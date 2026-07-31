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
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import type { ModelEdit } from '../src/dbt/edit';
import type { DiagramGraph } from '../src/diagram/graph';
import { buildFlowElements, type FlowElements } from '../src/diagram/flow';
import { layoutDiagram } from '../src/diagram/layout';
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
    return flow.edges.map((edge) => ({
      ...edge,
      className: activeEdgeIds.has(edge.id) ? 'edge--active' : undefined,
      // Every active edge flows (dashes travel child -> parent): the hovered
      // edge, or all edges touching a hovered column (spec 03).
      animated: activeEdgeIds.has(edge.id),
    }));
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
  }, []);

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
                    onAutoLayout={onAutoLayout}
                    onPaneClick={onPaneClick}
                  />
                </DiagramInteractionContext.Provider>
              </ReactFlowProvider>
            </section>
          )}
        </div>

        <DetailsSidebar key={detailsKey} entity={selectedEntity} onEdit={onEdit} />
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
  onAutoLayout,
  onPaneClick,
}: DiagramCanvasProps): JSX.Element {
  const { fitView } = useReactFlow();
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const lastTickRef = useRef(layoutTick);
  const lastFilterTickRef = useRef(filterTick);
  const lastIdsRef = useRef<string[]>([]);
  const firstFitRef = useRef(true);

  // Adopt each new diagram without disturbing the layout: existing nodes keep
  // their current position (manual drags and the previous arrangement survive),
  // only brand-new ids receive an automatic slot, and vanished ids are dropped.
  // Auto-layout (layoutTick bump) resets every node to the fresh dagre
  // arrangement. The view re-fits only on the first render, when the node set
  // grows, after Auto-layout, or after an explicit filter toggle (filterTick)
  // — never on ordinary live edits — so pan/zoom survives typing (spec 04) and
  // filter changes snap the remaining tables into view (spec 05).
  useEffect(() => {
    const reset = layoutTick !== lastTickRef.current;
    lastTickRef.current = layoutTick;
    const filterChanged = filterTick !== lastFilterTickRef.current;
    lastFilterTickRef.current = filterTick;
    setRfNodes((current) => (reset ? flow.nodes : mergeFlowNodes(flow.nodes, current)));

    const ids = flow.nodes.map((node) => node.id);
    const added = ids.filter((id) => !lastIdsRef.current.includes(id)).length > 0;
    lastIdsRef.current = ids;
    const isFirst = firstFitRef.current;
    firstFitRef.current = false;
    if (isFirst || added || reset || filterChanged) {
      void fitView({ padding: 0.15, maxZoom: 1 });
    }
  }, [flow, layoutTick, filterTick, fitView]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges]);

  const onNodesChange = useCallback((changes: NodeChange[]): void => {
    setRfNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]): void => {
    setRfEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
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
