/**
 * The webview root: owns the graph state and composes the filter sidebar, the
 * diagram canvas, and the details sidebar.
 *
 * Since spec 17 the behavior lives in focused hooks (`hooks/`) and the canvas
 * and sidebar chrome are their own components; this file is composition only.
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import type { ModelEdit } from '../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../src/dbt/types';
import type { DiagramGraph } from '../src/diagram/graph';
import { buildFlowElements, type FlowEdgeData, type FlowElements } from '../src/diagram/flow';
import { layoutDiagram } from '../src/diagram/layout';
import { filterGraph } from '../src/shared/filter';
import { DetailsSidebar, type SelectedEntity } from './DetailsSidebar';
import { DiagramCanvas } from './DiagramCanvas';
import { ContextMenu } from './ContextMenu';
import { advanceDetailsVisibility, initialDetailsVisibility } from './details-visibility';
import {
  DiagramInteractionContext,
  type DiagramInteractionContextValue,
} from './diagram-interaction-context';
import { FilterSidebar } from './FilterSidebar';
import { postToHost } from './host';
import { useDiagramFilter } from './hooks/useDiagramFilter';
import { useContextMenu } from './hooks/useContextMenu';
import { useRevealModel } from './hooks/useRevealModel';
import { useDraftForeignKeys } from './hooks/useDraftForeignKeys';
import { useEdgeHighlighting } from './hooks/useEdgeHighlighting';
import { useHostMessages } from './hooks/useHostMessages';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { useNotes } from './hooks/useNotes';
import { useSelection } from './hooks/useSelection';
import { SidebarRail, SidebarResizer } from './SidebarChrome';
import { SIDEBAR_DEFAULT_WIDTH } from './sidebar-constants';

export function App(): JSX.Element {
  const [graph, setGraph] = useState<DiagramGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  // Spec 11: sidebar visibility and widths are plain webview state — they
  // survive panel hide/reveal (retainContextWhenHidden) and reset on reopen.
  const [filterVisible, setFilterVisible] = useState(true);
  const [details, setDetails] = useState(() => initialDetailsVisibility(null));
  const detailsVisible = details.visible;
  const [filterWidth, setFilterWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [detailsWidth, setDetailsWidth] = useState(SIDEBAR_DEFAULT_WIDTH);

  const selection = useSelection();
  const filter = useDiagramFilter();
  const notes = useNotes();
  const layout = useLayoutPersistence(notes.notes);
  // Stable callbacks pulled out of the hook results: memo dependency lists must
  // reference these, never the freshly-built hook result objects, or every
  // render would invalidate `interaction` and re-render every TableNode.
  const {
    notePendingRename,
    onPaneClick,
    onTableSelect,
    onColumnSelect,
    setFocusedFk,
  } = selection;

  // Spec 19: the details sidebar's visibility is a pure function of whether
  // the selection changed and, if so, to what — a manual collapse survives
  // until the selection next changes. Spec 21: visibility and the key it was
  // decided for advance together as one piece of state, so the transition reads
  // only from `previous` and stays correct whenever React invokes the updater.
  useEffect(() => {
    setDetails((previous) => advanceDetailsVisibility(previous, selection.selection));
  }, [selection.selection]);

  useHostMessages({
    onDiagramUpdate: (message) => {
      setGraph(message.diagram);
      setPendingErrors(
        message.pendingErrors.map((pending) => `${pending.uri}: ${pending.message}`),
      );
      setError(null);
      filter.applyModelFiles(message.modelFiles);
      selection.reconcileToGraph(message.diagram);
    },
    onDiagramError: (message) => {
      setError(message);
      // A rejected rename (e.g. duplicate name): the selection never moved
      // — it still points at the old entity, which is unchanged in the
      // graph — so only the bookkeeping ref is dropped.
      selection.clearPendingRename();
    },
    onFilterScope: (uri) => filter.applyScope(uri),
    onLayoutApply: (message) => {
      filter.applyLayoutTables(layout.applyLayout(message));
      notes.applyLayoutNotes(message.layout.notes);
    },
    onLayoutActive: (message) => layout.applyActiveLayout(message),
  });

  const visibleGraph = useMemo(
    () => (graph === null ? null : filterGraph(graph, filter.visibleModels)),
    [graph, filter.visibleModels],
  );

  // The layout library re-runs when the filtered graph changes or the user
  // clicks Auto-layout; hover changes only re-derive highlights, so node
  // positions (and manual drags) stay stable across hovers.
  const flow = useMemo<FlowElements | null>(() => {
    if (visibleGraph === null) return null;
    return buildFlowElements(visibleGraph, layoutDiagram(visibleGraph));
  }, [visibleGraph, layoutTick]);

  const highlighting = useEdgeHighlighting(flow);

  /**
   * The single funnel every mutation goes through (inline editing and the
   * details sidebar). A rename of the currently selected entity records a
   * pending rename but keeps the selection on the old entity — the graph's
   * `diagram:update` confirms the rename and moves the selection to the new
   * identity; a rejected edit (`diagram:error`) just drops the record, since
   * the selection never left the (unchanged) old entity. The sidebar therefore
   * never shows its empty state during the round trip.
   */
  const onEdit = useCallback(
    (edit: ModelEdit): void => {
      notePendingRename(edit);
      postToHost({ type: 'diagram:edit', edit });
    },
    [notePendingRename],
  );

  const drafts = useDraftForeignKeys(onEdit);

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
    [graph, onTableSelect, setFocusedFk],
  );

  const onAutoLayout = useCallback((): void => {
    setLayoutTick((tick) => tick + 1);
  }, []);

  const contextMenu = useContextMenu();
  const { openMenu, closeMenu } = contextMenu;

  // Reveal selects the table; the details-visibility effect opens the
  // sidebar as a consequence of the selection changing, and the canvas
  // centers on it.
  const onRevealed = useCallback(
    (name: string): void => {
      onTableSelect(name);
    },
    [onTableSelect],
  );
  const { revealTarget, revealModel } = useRevealModel(onRevealed);

  const onOpenModelSource = useCallback((model: string): void => {
    postToHost({ type: 'model:openSource', model });
  }, []);

  // Spec 16: React Flow tags each rendered node with its id, so focusing a
  // note's editor after it is created (or via "Edit text") needs no extra
  // plumbing through the node data. The frame wait lets the node mount first.
  const focusNoteText = useCallback((id: string): void => {
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        `.react-flow__node[data-id="${id}"] .note__text`,
      );
      textarea?.focus();
    });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent, flowPoint: { x: number; y: number }): void => {
      openMenu(event.clientX, event.clientY, [
        {
          label: 'Add note here',
          onSelect: () => focusNoteText(notes.addNote(flowPoint.x, flowPoint.y)),
        },
      ]);
    },
    [openMenu, notes, focusNoteText],
  );

  const onDeleteSelectedNotes = useCallback((): void => {
    for (const id of notes.selectedNoteIds) {
      notes.deleteNote(id);
    }
  }, [notes]);

  // Spec 15: only table cards carry a menu; other node types (notes) are
  // handled by their own features.
  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node): void => {
      event.preventDefault();
      if (node.type === 'table') {
        openMenu(event.clientX, event.clientY, [
          { label: 'Open in model.yml', onSelect: () => onOpenModelSource(node.id) },
        ]);
        return;
      }
      if (node.type !== 'note') {
        return;
      }
      // Spec 16: Collapse/Expand is runtime only; "Collapsed by default" is the
      // persisted choice, so both appear side by side.
      const note = notes.notes.find((candidate) => candidate.id === node.id);
      if (note === undefined) {
        return;
      }
      const collapsed = notes.isCollapsed(note.id);
      openMenu(event.clientX, event.clientY, [
        { label: 'Edit text', onSelect: () => focusNoteText(note.id) },
        {
          label: collapsed ? 'Expand' : 'Collapse',
          onSelect: () => notes.toggleCollapsedNow(note.id),
        },
        {
          label: 'Collapsed by default',
          checked: note.collapsedByDefault,
          onSelect: () => notes.setCollapsedByDefault(note.id, !note.collapsedByDefault),
        },
        { label: 'Delete', onSelect: () => notes.deleteNote(note.id) },
      ]);
    },
    [openMenu, onOpenModelSource, notes],
  );

  const current = selection.selection;
  const interaction: DiagramInteractionContextValue = useMemo(
    () => ({
      highlightedColumns: highlighting.highlightedColumns,
      onColumnHover: highlighting.onColumnHover,
      onColumnLeave: highlighting.onColumnLeave,
      selectedTableId: current !== null && current.kind === 'table' ? current.id : null,
      selectedColumnRef:
        current !== null && current.kind === 'column'
          ? { model: current.model, column: current.column }
          : null,
      onTableSelect,
      onColumnSelect,
      onEdit,
    }),
    [
      highlighting.highlightedColumns,
      highlighting.onColumnHover,
      highlighting.onColumnLeave,
      current,
      onTableSelect,
      onColumnSelect,
      onEdit,
    ],
  );

  // The details sidebar derives its displayed entity from the FULL graph so a
  // filtered-out selection stays editable (spec 06, section 4).
  const selectedEntity = useMemo<SelectedEntity | null>(() => {
    if (graph === null || current === null) return null;
    if (current.kind === 'table') {
      const node = graph.nodes.find((n) => n.id === current.id);
      return node === undefined ? null : { kind: 'table', node };
    }
    const node = graph.nodes.find((n) => n.id === current.model);
    if (node === undefined) return null;
    const column = node.columns.find((c) => c.name === current.column);
    return column === undefined ? null : { kind: 'column', node, column };
  }, [graph, current]);

  // Remount the sidebar fields when the selected entity changes so drafts
  // start fresh from the new entity's values (spec 06, section 6).
  const detailsKey =
    selectedEntity === null
      ? 'none'
      : selectedEntity.kind === 'table'
        ? `table:${selectedEntity.node.id}`
        : `column:${selectedEntity.node.id}.${selectedEntity.column.name}`;

  const statusText =
    graph === null || visibleGraph === null
      ? 'loading…'
      : visibleGraph.nodes.length === graph.nodes.length
        ? `${graph.nodes.length} models`
        : `${visibleGraph.nodes.length} of ${graph.nodes.length} models`;

  const activeLayout = layout.activeLayout;
  const selectedTableId = selectedEntity?.kind === 'table' ? selectedEntity.node.id : null;

  return (
    <main className="app">
      <div className="app__body">
        {filterVisible ? (
          <FilterSidebar
            style={{ width: filterWidth }}
            files={filter.modelFiles}
            availableModelNames={filter.availableModelNames}
            selectedFiles={filter.selectedFiles}
            selectedModels={filter.selectedModels}
            fileSearch={filter.fileSearch}
            modelSearch={filter.modelSearch}
            onFileSearchChange={filter.setFileSearch}
            onModelSearchChange={filter.setModelSearch}
            onToggleFile={filter.toggleFile}
            onToggleModel={filter.toggleModel}
            onSelectAllFiles={filter.selectAllFiles}
            onClearFiles={filter.clearFiles}
            onSelectAllModels={filter.selectAllModels}
            onClearModels={filter.clearModels}
            onRevealModel={revealModel}
            onOpenModelSource={onOpenModelSource}
            onOpenMenu={openMenu}
            onCollapse={() => setFilterVisible(false)}
          />
        ) : (
          <SidebarRail side="left" onExpand={() => setFilterVisible(true)} />
        )}
        {filterVisible && <SidebarResizer side="left" onWidthChange={setFilterWidth} />}

        <div className="app__main">
          <header className="app__header">
            <h1>dbt Diagram</h1>
            {activeLayout !== null && <span className="app__layout">{activeLayout.name}</span>}
            <span className="app__status">{statusText}</span>
            <button
              type="button"
              className="panel-button app__save"
              onClick={layout.onSaveDiagram}
              disabled={activeLayout === null ? graph === null : !layout.dirty}
              title={
                activeLayout === null
                  ? 'Save the visible tables and their positions to a diagram file'
                  : layout.dirty
                    ? `Save changes to ${activeLayout.path}`
                    : 'No unsaved changes'
              }
            >
              {activeLayout === null ? 'Save diagram' : layout.dirty ? 'Save' : 'No changes'}
            </button>
          </header>

          {error !== null && <div className="banner banner--error">{error}</div>}
          {layout.layoutMissing.length > 0 && (
            <div className="banner banner--info">
              <strong>
                {layout.layoutMissing.length} table
                {layout.layoutMissing.length === 1 ? '' : 's'} in this diagram no longer exist:
              </strong>{' '}
              {layout.layoutMissing.join(', ')}
              <button
                type="button"
                className="panel-button"
                onClick={layout.dismissLayoutMissing}
              >
                Dismiss
              </button>
            </div>
          )}
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
                    edges={highlighting.edges}
                    layoutTick={layoutTick}
                    filterTick={filter.filterTick}
                    seedPositions={layout.seedPositions}
                    seedTick={layout.seedTick}
                    onPositionsChange={layout.onPositionsChange}
                    onEdgeMouseEnter={highlighting.onEdgeMouseEnter}
                    onEdgeMouseLeave={highlighting.onEdgeMouseLeave}
                    onEdgeClick={onEdgeClick}
                    onEdgeDoubleClick={onEdgeDoubleClick}
                    onAutoLayout={onAutoLayout}
                    onPaneClick={onPaneClick}
                    onNodeContextMenu={onNodeContextMenu}
                    revealTarget={revealTarget}
                    noteNodes={notes.noteNodes}
                    noteIds={notes.noteIds}
                    onNoteNodeChanges={notes.applyNoteNodeChanges}
                    onPaneContextMenu={onPaneContextMenu}
                    onDeleteSelectedNotes={onDeleteSelectedNotes}
                  />
                </DiagramInteractionContext.Provider>
              </ReactFlowProvider>
            </section>
          )}
        </div>

        {detailsVisible && <SidebarResizer side="right" onWidthChange={setDetailsWidth} />}
        {detailsVisible ? (
          <DetailsSidebar
            style={{ width: detailsWidth }}
            key={detailsKey}
            entity={selectedEntity}
            nodes={graph?.nodes ?? []}
            focusedFk={selection.focusedFk}
            drafts={selectedTableId === null ? [] : (drafts.draftFks[selectedTableId] ?? [])}
            onEdit={onEdit}
            onAddDraft={(target) => {
              if (selectedTableId !== null) drafts.addDraft(selectedTableId, target);
            }}
            onRemoveDraft={(draftId) => {
              if (selectedTableId !== null) drafts.removeDraft(selectedTableId, draftId);
            }}
            onDraftVirtualChange={(draftId, virtual) => {
              if (selectedTableId !== null) {
                drafts.setDraftVirtual(selectedTableId, draftId, virtual);
              }
            }}
            onDraftAddPair={(draft, source, target) => {
              if (selectedTableId !== null) {
                drafts.addDraftPair(selectedTableId, draft, source, target);
              }
            }}
            onRemoveLastPair={(fk) => {
              if (selectedTableId !== null) drafts.removeLastPair(selectedTableId, fk);
            }}
            onCollapse={() => setDetails((previous) => ({ ...previous, visible: false }))}
          />
        ) : (
          <SidebarRail
            side="right"
            onExpand={() => setDetails((previous) => ({ ...previous, visible: true }))}
          />
        )}
      </div>

      {contextMenu.menu !== null && (
        <ContextMenu
          x={contextMenu.menu.x}
          y={contextMenu.menu.y}
          items={contextMenu.menu.items}
          onClose={closeMenu}
        />
      )}
    </main>
  );
}
