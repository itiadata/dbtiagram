import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import type { ModelEdit } from '../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../src/dbt/types';
import type { DiagramGraph } from '../src/diagram/graph';
import {
  buildFlowElements,
  recomputeEdgeSides,
  type FlowEdgeData,
  type FlowElements,
  type HandleSide,
} from '../src/diagram/flow';
import { HEADER_HEIGHT, NODE_WIDTH, layoutDiagram } from '../src/diagram/layout';
import { mergeFlowNodes } from '../src/diagram/positions';
import { computeVisibleModels, filterGraph, reconcileSelection } from '../src/shared/filter';
import type {
  DiagramModelFile,
  MessageToExtension,
  MessageToWebview,
} from '../src/shared/protocol';
import { DetailsSidebar, type SelectedEntity } from './DetailsSidebar';
import {
  DiagramInteractionContext,
  type DiagramInteractionContextValue,
} from './diagram-interaction-context';
import { FilterSidebar } from './FilterSidebar';
import { sameFkContent, type DraftForeignKey } from './ForeignKeySection';
import { TableNode } from './TableNode';

const vscode = window.acquireVsCodeApi();

const nodeTypes: NodeTypes = { table: TableNode };

/** What the user selected on the diagram (spec 06): a table or a column. */
type Selection =
  | { kind: 'table'; id: string }
  | { kind: 'column'; model: string; column: string }
  | null;

interface ColumnRef {
  model: string;
  column: string;
}

/** A rename of the selected entity, pending the host's verdict (spec 06). */
interface PendingRename {
  oldRef: Exclude<Selection, null>;
  newRef: Exclude<Selection, null>;
}

export function App(): JSX.Element {
  const [graph, setGraph] = useState<DiagramGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<ColumnRef | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  // Spec 08: the FK highlighted + scrolled into view in the details sidebar
  // after double-clicking its edge; null when nothing is focused.
  const [focusedFk, setFocusedFk] = useState<ForeignKeyDescriptor | null>(null);

  // Spec 09 merged: webview-only draft FKs per model — nothing is persisted
  // until a draft's first column pair is added (createForeignKey). Keyed by
  // model id; each draft carries a locally unique id.
  const [draftFks, setDraftFks] = useState<Record<string, DraftForeignKey[]>>({});
  const draftIdCounterRef = useRef(0);

  // Spec 05 filtering: per-file metadata from the host, the user's checked
  // sets (everything checked by default), the two search boxes, and a tick
  // that bumps on every explicit filter toggle so the view re-fits.
  const [modelFiles, setModelFiles] = useState<DiagramModelFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [fileSearch, setFileSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [filterTick, setFilterTick] = useState(0);
  // Universes from the previous diagram:update, used to tell brand-new
  // files/models (default checked) apart from ones the user unchecked.
  const previousFileUrisRef = useRef<string[]>([]);
  const previousModelNamesRef = useRef<string[]>([]);

  // Spec 06: the current selection is mirrored into a ref so the `onEdit`
  // funnel (created once) can read the freshest value without re-creating.
  const selectionRef = useRef<Selection>(null);
  const pendingRenameRef = useRef<PendingRename | null>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Models held by files that are currently checked: the Models filter only
  // lists these (spec 05, reactive model list). Models of unchecked files are
  // hidden from the list but keep their checked state, so re-checking a file
  // restores them exactly (file precedence already hides them from the graph).
  const availableModelNames = useMemo(() => {
    const names = new Set<string>();
    for (const file of modelFiles) {
      if (!selectedFiles.has(file.uri)) continue;
      for (const model of file.models) names.add(model);
    }
    return [...names];
  }, [modelFiles, selectedFiles]);

  useEffect(() => {
    const listener = (event: MessageEvent<MessageToWebview>): void => {
      const message = event.data;
      switch (message.type) {
        case 'diagram:update': {
          setGraph(message.diagram);
          setPendingErrors(
            message.pendingErrors.map((pending) => `${pending.uri}: ${pending.message}`),
          );
          setError(null);
          setModelFiles(message.modelFiles);

          const fileUris = message.modelFiles.map((file) => file.uri);
          const previousUris = previousFileUrisRef.current;
          setSelectedFiles((current) => reconcileSelection(previousUris, fileUris, current));
          previousFileUrisRef.current = fileUris;

          const modelNames = message.modelFiles.flatMap((file) => file.models);
          const previousNames = previousModelNamesRef.current;
          setSelectedModels((current) => reconcileSelection(previousNames, modelNames, current));
          previousModelNamesRef.current = modelNames;

          // Spec 06: a pending rename is confirmed by this update — follow the
          // selection to the new identity BEFORE the reconcile pass, so the
          // reconcile (which clears vanished entities) cannot drop the renamed
          // selection, and the sidebar switches to the new name in one render.
          const pending = pendingRenameRef.current;
          if (pending !== null) {
            setSelection(pending.newRef);
            pendingRenameRef.current = null;
          }

          // Reconcile the selection against the FULL graph: a selection that is
          // merely filtered out by the sidebar survives; one whose entity truly
          // disappeared (external delete, vanished column) clears.
          setSelection((current) => {
            if (current === null) return current;
            if (current.kind === 'table') {
              return message.diagram.nodes.some((node) => node.id === current.id)
                ? current
                : null;
            }
            const node = message.diagram.nodes.find((n) => n.id === current.model);
            if (node === undefined) return null;
            return node.columns.some((col) => col.name === current.column) ? current : null;
          });

          // Spec 08: a focused FK survives a diagram update only while a
          // descriptor matching it still exists (an edit that changed the FK
          // clears the focus).
          setFocusedFk((current) => {
            if (current === null) return current;
            const stillThere = message.diagram.nodes.some((node) =>
              node.foreignKeys.some((fk) => sameFkContent(current, fk)),
            );
            return stillThere ? current : null;
          });
          break;
        }
        case 'diagram:error': {
          setError(message.message);
          // A rejected rename (e.g. duplicate name): the selection never moved
          // — it still points at the old entity, which is unchanged in the
          // graph — so only the bookkeeping ref is dropped.
          pendingRenameRef.current = null;
          break;
        }
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'webview:ready' } satisfies MessageToExtension);
    return () => window.removeEventListener('message', listener);
  }, []);

  // Spec 05: the diagram is the full graph filtered by the checked files
  // (with precedence) and checked models. Search boxes never enter these
  // memos — they only narrow the sidebar checkbox lists.
  const visibleModels = useMemo(
    () => computeVisibleModels(modelFiles, selectedFiles, selectedModels),
    [modelFiles, selectedFiles, selectedModels],
  );
  const visibleGraph = useMemo(
    () => (graph === null ? null : filterGraph(graph, visibleModels)),
    [graph, visibleModels],
  );

  // The layout library re-runs when the filtered graph changes or the user
  // clicks Auto-layout; hover changes only re-derive highlights below, so node
  // positions (and manual drags) stay stable across hovers.
  const flow = useMemo<FlowElements | null>(() => {
    if (visibleGraph === null) return null;
    return buildFlowElements(visibleGraph, layoutDiagram(visibleGraph));
  }, [visibleGraph, layoutTick]);

  const activeEdgeIds = useMemo(() => {
    if (flow === null) return new Set<string>();
    const set = new Set<string>();
    if (hoveredEdgeId !== null) set.add(hoveredEdgeId);
    if (hoveredColumn !== null) {
      for (const edge of flow.edges) {
        if (edge.data.sourceColumn === undefined) continue;
        const touches =
          (edge.source === hoveredColumn.model &&
            edge.data.sourceColumn === hoveredColumn.column) ||
          (edge.target === hoveredColumn.model &&
            edge.data.targetColumn === hoveredColumn.column);
        if (touches) set.add(edge.id);
      }
    }
    return set;
  }, [flow, hoveredEdgeId, hoveredColumn]);

  const edges = useMemo<Edge[]>(() => {
    if (flow === null) return [];
    return flow.edges.map((edge) => {
      const active = activeEdgeIds.has(edge.id);
      // Virtual FKs draw dashed (spec 08) — combined with the hover/active
      // class so a hovered virtual edge keeps its active styling.
      const classes = [
        active ? 'edge--active' : null,
        edge.data.virtual ? 'edge--virtual' : null,
      ].filter((c): c is string => c !== null);
      return {
        ...edge,
        className: classes.length > 0 ? classes.join(' ') : undefined,
        // Every active edge flows (dashes travel child -> parent): the hovered
        // edge, or all edges touching a hovered column (spec 03).
        animated: active,
      };
    });
  }, [flow, activeEdgeIds]);

  const highlightedColumns = useMemo(() => {
    const byModel = new Map<string, Set<string>>();
    if (flow === null) return byModel;
    const add = (model: string, column: string): void => {
      let set = byModel.get(model);
      if (set === undefined) {
        set = new Set();
        byModel.set(model, set);
      }
      set.add(column);
    };
    if (hoveredColumn !== null) add(hoveredColumn.model, hoveredColumn.column);
    for (const edge of flow.edges) {
      if (!activeEdgeIds.has(edge.id)) continue;
      if (edge.data.sourceColumn !== undefined) add(edge.source, edge.data.sourceColumn);
      if (edge.data.targetColumn !== undefined) add(edge.target, edge.data.targetColumn);
    }
    return byModel;
  }, [flow, activeEdgeIds, hoveredColumn]);

  const onColumnHover = useCallback((model: string, column: string): void => {
    setHoveredColumn({ model, column });
  }, []);

  const onColumnLeave = useCallback((model: string, column: string): void => {
    setHoveredColumn((current) =>
      current !== null && current.model === model && current.column === column
        ? null
        : current,
    );
  }, []);

  const onTableSelect = useCallback((model: string): void => {
    setSelection({ kind: 'table', id: model });
  }, []);

  const onColumnSelect = useCallback((model: string, column: string): void => {
    setSelection({ kind: 'column', model, column });
  }, []);

  const onPaneClick = useCallback((): void => {
    setSelection(null);
    setFocusedFk(null);
  }, []);

  // Feature 07: a defined onEdgeClick is what keeps React Flow from tagging
  // every edge `inactive` (inactive = !selectable && !onClick), whose base CSS
  // rule pointer-events: none killed edge hover after spec 06. Clicking an FK
  // edge selects its child (source) table — the natural behavior that gives
  // the handler a purpose. elementsSelectable stays false, so React Flow's
  // native edge selection never engages.
  const onEdgeClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge): void => {
      onTableSelect(edge.source);
    },
    [onTableSelect],
  );

  // Spec 08: double-clicking an FK edge selects the child table AND focuses
  // (highlights + scrolls into view) the matching FK in the Foreign keys
  // section. Every edge is column-level (spec 09 merged), so the descriptor is
  // matched by its pair: the edge's source/target column at the same index.
  const onEdgeDoubleClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge): void => {
      onTableSelect(edge.source);
      if (graph === null) {
        setFocusedFk(null);
        return;
      }
      const node = graph.nodes.find((n) => n.id === edge.source);
      if (node === undefined) {
        setFocusedFk(null);
        return;
      }
      const data = edge.data as FlowEdgeData | undefined;
      let matched: ForeignKeyDescriptor | null = null;
      for (const fk of node.foreignKeys) {
        if (data?.sourceColumn !== undefined && data?.targetColumn !== undefined) {
          const index = fk.columns.indexOf(data.sourceColumn);
          if (index !== -1 && fk.toColumns[index] === data.targetColumn) {
            matched = fk;
            break;
          }
        }
      }
      setFocusedFk(matched);
    },
    [graph, onTableSelect],
  );

  /**
   * The single funnel every mutation goes through (inline editing and the
   * details sidebar). A rename of the currently selected entity records
   * `pendingRenameRef` but keeps the selection on the old entity — the
   * graph's `diagram:update` confirms the rename and moves the selection to
   * the new identity; a rejected edit (`diagram:error`) just drops the ref,
   * since the selection never left the (unchanged) old entity. The sidebar
   * therefore never shows its empty state during the round trip.
   */
  const onEdit = useCallback((edit: ModelEdit): void => {
    const current = selectionRef.current;
    if (current !== null) {
      if (edit.kind === 'setModelName' && current.kind === 'table' && current.id === edit.model) {
        const name = edit.name.trim();
        if (name.length > 0 && name !== current.id) {
          pendingRenameRef.current = {
            oldRef: current,
            newRef: { kind: 'table', id: name },
          };
        }
      } else if (
        edit.kind === 'setColumnName' &&
        current.kind === 'column' &&
        current.model === edit.model &&
        current.column === edit.column
      ) {
        const name = edit.name.trim();
        if (name.length > 0 && name !== current.column) {
          pendingRenameRef.current = {
            oldRef: current,
            newRef: { kind: 'column', model: edit.model, column: name },
          };
        }
      }
    }
    vscode.postMessage({ type: 'diagram:edit', edit } satisfies MessageToExtension);
  }, []);

  // Spec 09 merged: local draft-FK bookkeeping. Add foreign key only appends a
  // draft (no edit posted, no file write); the first pair persists the FK via
  // `createForeignKey`; removing the last pair of a persisted FK deletes it
  // and keeps a draft with the same target/virtual flag.
  const addDraft = useCallback((model: string, target: string): void => {
    setDraftFks((current) => {
      const draft: DraftForeignKey = {
        draftId: `draft-${draftIdCounterRef.current}`,
        target,
        virtual: false,
        columns: [],
        toColumns: [],
      };
      draftIdCounterRef.current += 1;
      return { ...current, [model]: [...(current[model] ?? []), draft] };
    });
  }, []);

  const removeDraft = useCallback((model: string, draftId: string): void => {
    setDraftFks((current) => {
      const drafts = (current[model] ?? []).filter((d) => d.draftId !== draftId);
      const next = { ...current };
      if (drafts.length === 0) delete next[model];
      else next[model] = drafts;
      return next;
    });
  }, []);

  const setDraftVirtual = useCallback(
    (model: string, draftId: string, virtual: boolean): void => {
      setDraftFks((current) => ({
        ...current,
        [model]: (current[model] ?? []).map((d) =>
          d.draftId === draftId ? { ...d, virtual } : d,
        ),
      }));
    },
    [],
  );

  const addDraftPair = useCallback(
    (model: string, draft: DraftForeignKey, source: string, target: string): void => {
      onEdit({
        kind: 'createForeignKey',
        model,
        target: draft.target,
        columns: [source],
        toColumns: [target],
        virtual: draft.virtual,
      });
      removeDraft(model, draft.draftId);
    },
    [onEdit, removeDraft],
  );

  const removeLastPair = useCallback(
    (model: string, fk: ForeignKeyDescriptor): void => {
      onEdit({ kind: 'removeForeignKey', model, fk });
      const target = fk.target;
      if (target !== undefined) {
        setDraftFks((current) => {
          const draft: DraftForeignKey = {
            draftId: `draft-${draftIdCounterRef.current}`,
            target,
            virtual: fk.virtual,
            columns: [],
            toColumns: [],
          };
          draftIdCounterRef.current += 1;
          return { ...current, [model]: [...(current[model] ?? []), draft] };
        });
      }
    },
    [onEdit],
  );

  const interaction: DiagramInteractionContextValue = useMemo(
    () => ({
      highlightedColumns,
      onColumnHover,
      onColumnLeave,
      selectedTableId: selection !== null && selection.kind === 'table' ? selection.id : null,
      selectedColumnRef:
        selection !== null && selection.kind === 'column'
          ? { model: selection.model, column: selection.column }
          : null,
      onTableSelect,
      onColumnSelect,
      onEdit,
    }),
    [
      highlightedColumns,
      onColumnHover,
      onColumnLeave,
      selection,
      onTableSelect,
      onColumnSelect,
      onEdit,
    ],
  );

  // The details sidebar derives its displayed entity from the FULL graph so a
  // filtered-out selection stays editable (spec 06, section 4).
  const selectedEntity = useMemo<SelectedEntity | null>(() => {
    if (graph === null || selection === null) return null;
    if (selection.kind === 'table') {
      const node = graph.nodes.find((n) => n.id === selection.id);
      return node === undefined ? null : { kind: 'table', node };
    }
    const node = graph.nodes.find((n) => n.id === selection.model);
    if (node === undefined) return null;
    const column = node.columns.find((c) => c.name === selection.column);
    return column === undefined ? null : { kind: 'column', node, column };
  }, [graph, selection]);

  // Remount the sidebar fields when the selected entity changes so drafts
  // start fresh from the new entity's values (spec 06, section 6).
  const detailsKey =
    selectedEntity === null
      ? 'none'
      : selectedEntity.kind === 'table'
        ? `table:${selectedEntity.node.id}`
        : `column:${selectedEntity.node.id}.${selectedEntity.column.name}`;

  const onEdgeMouseEnter = useCallback((_event: ReactMouseEvent, edge: Edge): void => {
    setHoveredEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback((): void => {
    setHoveredEdgeId(null);
  }, []);

  const onAutoLayout = useCallback((): void => {
    setLayoutTick((tick) => tick + 1);
  }, []);

  const toggleFile = useCallback((uri: string, checked: boolean): void => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (checked) next.add(uri);
      else next.delete(uri);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, []);

  const toggleModel = useCallback((name: string, checked: boolean): void => {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, []);

  // Bulk All / None per filter level (spec 05): file handlers set the whole
  // file Set; model handlers operate only on the listed (available) models,
  // leaving the hidden models' checked state untouched. All of them behave
  // like checkbox toggles for the refit policy.
  const selectAllFiles = useCallback((): void => {
    setSelectedFiles(new Set(modelFiles.map((file) => file.uri)));
    setFilterTick((tick) => tick + 1);
  }, [modelFiles]);

  const clearFiles = useCallback((): void => {
    setSelectedFiles(new Set());
    setFilterTick((tick) => tick + 1);
  }, []);

  const selectAllModels = useCallback((): void => {
    setSelectedModels((current) => new Set([...current, ...availableModelNames]));
    setFilterTick((tick) => tick + 1);
  }, [availableModelNames]);

  const clearModels = useCallback((): void => {
    setSelectedModels((current) => {
      const next = new Set(current);
      for (const name of availableModelNames) next.delete(name);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, [availableModelNames]);

  const statusText =
    graph === null || visibleGraph === null
      ? 'loading…'
      : visibleGraph.nodes.length === graph.nodes.length
        ? `${graph.nodes.length} models`
        : `${visibleGraph.nodes.length} of ${graph.nodes.length} models`;

  return (
    <main className="app">
      <div className="app__body">
        <FilterSidebar
          files={modelFiles}
          availableModelNames={availableModelNames}
          selectedFiles={selectedFiles}
          selectedModels={selectedModels}
          fileSearch={fileSearch}
          modelSearch={modelSearch}
          onFileSearchChange={setFileSearch}
          onModelSearchChange={setModelSearch}
          onToggleFile={toggleFile}
          onToggleModel={toggleModel}
          onSelectAllFiles={selectAllFiles}
          onClearFiles={clearFiles}
          onSelectAllModels={selectAllModels}
          onClearModels={clearModels}
        />

        <div className="app__main">
          <header className="app__header">
            <h1>dbt Diagram</h1>
            <span className="app__status">{statusText}</span>
          </header>

          {error !== null && <div className="banner banner--error">{error}</div>}
          {pendingErrors.length > 0 && (
            <div className="banner banner--info">
              <strong>Waiting for valid YAML:</strong>
              <ul className="banner__list">
                {pendingErrors.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          )}

          {graph === null || flow === null ? (
            <p className="empty">No diagram yet.</p>
          ) : (
            <section className="canvas">
              {visibleGraph !== null && visibleGraph.nodes.length === 0 && (
                <div className="empty-overlay">No models match the current filters.</div>
              )}
              <ReactFlowProvider>
                <DiagramInteractionContext.Provider value={interaction}>
                  <DiagramCanvas
                    flow={flow}
                    edges={edges}
                    layoutTick={layoutTick}
                    filterTick={filterTick}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    onEdgeClick={onEdgeClick}
                    onEdgeDoubleClick={onEdgeDoubleClick}
                    onAutoLayout={onAutoLayout}
                    onPaneClick={onPaneClick}
                  />
                </DiagramInteractionContext.Provider>
              </ReactFlowProvider>
            </section>
          )}
        </div>

        <DetailsSidebar
          key={detailsKey}
          entity={selectedEntity}
          nodes={graph?.nodes ?? []}
          focusedFk={focusedFk}
          drafts={selectedEntity?.kind === 'table' ? (draftFks[selectedEntity.node.id] ?? []) : []}
          onEdit={onEdit}
          onAddDraft={(target) => {
            if (selectedEntity?.kind === 'table') addDraft(selectedEntity.node.id, target);
          }}
          onRemoveDraft={(draftId) => {
            if (selectedEntity?.kind === 'table') removeDraft(selectedEntity.node.id, draftId);
          }}
          onDraftVirtualChange={(draftId, virtual) => {
            if (selectedEntity?.kind === 'table') {
              setDraftVirtual(selectedEntity.node.id, draftId, virtual);
            }
          }}
          onDraftAddPair={(draft, source, target) => {
            if (selectedEntity?.kind === 'table') {
              addDraftPair(selectedEntity.node.id, draft, source, target);
            }
          }}
          onRemoveLastPair={(fk) => {
            if (selectedEntity?.kind === 'table') removeLastPair(selectedEntity.node.id, fk);
          }}
        />
      </div>
    </main>
  );
}

interface DiagramCanvasProps {
  flow: FlowElements;
  edges: Edge[];
  layoutTick: number;
  filterTick: number;
  onEdgeMouseEnter: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  onEdgeClick: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeDoubleClick: (event: ReactMouseEvent, edge: Edge) => void;
  onAutoLayout: () => void;
  onPaneClick: () => void;
}

function DiagramCanvas({
  flow,
  edges,
  layoutTick,
  filterTick,
  onEdgeMouseEnter,
  onEdgeMouseLeave,
  onEdgeClick,
  onEdgeDoubleClick,
  onAutoLayout,
  onPaneClick,
}: DiagramCanvasProps): JSX.Element {
  const { fitView } = useReactFlow();
  // Seed the node list from the current flow so the first paint already has
  // full node rects (the live edge pass runs during render, before the adopt
  // effect below); later flow changes flow through the effect.
  const [rfNodes, setRfNodes] = useState<Node[]>(() => flow.nodes);
  const lastTickRef = useRef(layoutTick);
  const lastFilterTickRef = useRef(filterTick);
  const lastIdsRef = useRef<string[]>([]);
  const firstFitRef = useRef(true);

  // Adopt each new diagram without disturbing the layout: existing nodes keep
  // their current position (manual drags and the previous arrangement survive),
  // a renamed card keeps the vanished card's position (same columns/description
  // — spec 04), only genuinely brand-new ids receive an automatic slot, and
  // vanished ids are dropped. Auto-layout (layoutTick bump) resets every node
  // to the fresh dagre arrangement. The view re-fits only on the first render,
  // when the node set grows, after Auto-layout, or after an explicit filter
  // toggle (filterTick) — never on ordinary live edits or renames — so
  // pan/zoom survives typing (spec 04) and filter changes snap the remaining
  // tables into view (spec 05).
  useEffect(() => {
    const reset = layoutTick !== lastTickRef.current;
    lastTickRef.current = layoutTick;
    const filterChanged = filterTick !== lastFilterTickRef.current;
    lastFilterTickRef.current = filterTick;
    setRfNodes((current) => (reset ? flow.nodes : mergeFlowNodes(flow.nodes, current)));

    const ids = flow.nodes.map((node) => node.id);
    // Fit only when the node set actually grows (net count up); a rename swaps
    // one id for another and must neither refit nor disturb the layout (spec
    // 04 — the renamed card keeps its position via mergeFlowNodes).
    const added = ids.length > lastIdsRef.current.length;
    lastIdsRef.current = ids;
    const isFirst = firstFitRef.current;
    firstFitRef.current = false;
    if (isFirst || added || reset || filterChanged) {
      void fitView({ padding: 0.15, maxZoom: 1 });
    }
  }, [flow, layoutTick, filterTick, fitView]);

  // Live edge geometry (spec 09 Manual Verify iteration): the side an edge
  // uses — and the dot the column mounts — is re-derived from the CURRENT node
  // positions on every drag, not frozen at the initial layout. Node rects come
  // from React Flow's live state; recomputeEdgeSides preserves edge ids/data
  // so hover highlighting and edge double-click keep working unchanged.
  const nodeRects = useMemo(
    () =>
      rfNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? NODE_WIDTH,
        height: node.height ?? HEADER_HEIGHT,
      })),
    [rfNodes],
  );
  const { edges: liveEdges, nodeHandles } = useMemo(
    () => recomputeEdgeSides(flow.edges, nodeRects),
    [flow.edges, nodeRects],
  );

  // The nodes React Flow renders: the layout/data from `rfNodes`, with
  // `data.handles` overlaid from the live pass so the mounted dot follows the
  // drag. A node whose handle set is unchanged keeps its data reference so
  // memoized TableNodes don't re-render on every drag frame.
  const liveNodes = useMemo(
    () =>
      rfNodes.map((node) => {
        const handles = nodeHandles.get(node.id);
        // rfNodes is typed with the generic Node (data: Record<string, unknown>);
        // the handles field comes from FlowNodeData (spec 09 merged).
        const previous = (node.data as { handles?: Record<string, HandleSide> }).handles;
        if (handles === undefined || handles.size === 0) {
          return previous === undefined
            ? node
            : { ...node, data: { ...node.data, handles: undefined } };
        }
        const next = Object.fromEntries(handles);
        if (
          previous !== undefined &&
          Object.keys(previous).length === handles.size &&
          Object.entries(next).every(([handleId, side]) => previous[handleId] === side)
        ) {
          return node;
        }
        return { ...node, data: { ...node.data, handles: next } };
      }),
    [rfNodes, nodeHandles],
  );

  // Hover/active styling (className, animated) comes from the App-level edges
  // pass, keyed by the stable edge ids; the geometry comes from the live pass.
  const appEdgesById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);
  const liveStyledEdges = useMemo(
    () =>
      liveEdges.map((edge) => {
        const styled = appEdgesById.get(edge.id);
        return styled === undefined
          ? edge
          : { ...edge, className: styled.className, animated: styled.animated };
      }),
    [liveEdges, appEdgesById],
  );

  const onNodesChange = useCallback((changes: NodeChange[]): void => {
    setRfNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((_changes: EdgeChange[]): void => {
    // Edges are fully derived here: geometry from the live node positions,
    // styling from the App-level hover pass. React Flow never mutates edges in
    // this app (elementsSelectable is false), so there is nothing to apply.
  }, []);

  return (
    <ReactFlow
      nodes={liveNodes}
      edges={liveStyledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      nodesConnectable={false}
      // Selection is our own webview state (spec 06): clicking the header/row
      // selects; clicking the canvas deselects. React Flow's native selection
      // is disabled so its highlight never fights the card's --selected styles.
      elementsSelectable={false}
      proOptions={{ hideAttribution: false }}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
      onEdgeClick={onEdgeClick}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onPaneClick={onPaneClick}
      minZoom={0.1}
      maxZoom={2}
    >
      <Background gap={16} size={1} />
      <Controls />
      <Panel position="top-right">
        <button type="button" className="panel-button" onClick={onAutoLayout}>
          Auto-layout
        </button>
      </Panel>
    </ReactFlow>
  );
}
