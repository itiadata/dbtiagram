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
import { COLUMN_DISPLAY_OPTIONS } from '../src/diagram/columnDisplay';
import type { ColumnDisplayMode } from '../src/diagram/columnDisplay';
import type { DiagramGraph } from '../src/diagram/graph';
import { buildFlowElements, columnRowIndexLookup, type FlowEdgeData, type FlowElements } from '../src/diagram/flow';
import { layoutDiagram } from '../src/diagram/layout';
import { filterGraph } from '../src/shared/filter';
import { DetailsSidebar, type SelectedEntity } from './DetailsSidebar';
import { DiagramCanvas } from './DiagramCanvas';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { FieldsMatrix } from './FieldsMatrix';
import { advanceDetailsVisibility, initialDetailsVisibility } from './details-visibility';
import {
  DiagramInteractionContext,
  type DiagramInteractionContextValue,
} from './diagram-interaction-context';
import { FilterSidebar } from './FilterSidebar';
import { SettingsPanel } from './SettingsPanel';
import { postToHost } from './host';
import { useColumnDisplay } from './hooks/useColumnDisplay';
import { useDiagramFilter } from './hooks/useDiagramFilter';
import { useContextMenu } from './hooks/useContextMenu';
import { useRevealModel } from './hooks/useRevealModel';
import { useDraftForeignKeys } from './hooks/useDraftForeignKeys';
import { useEdgeHighlighting } from './hooks/useEdgeHighlighting';
import { useFkCreateMode } from './hooks/useFkCreateMode';
import { useFieldsMatrix } from './hooks/useFieldsMatrix';
import { useHostMessages } from './hooks/useHostMessages';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { useNotes } from './hooks/useNotes';
import { useSelection } from './hooks/useSelection';
import { useSettings } from './hooks/useSettings';
import { SidebarRail, SidebarResizer } from './SidebarChrome';
import { SIDEBAR_DEFAULT_WIDTH } from './sidebar-constants';
import { Settings, SavePlus, Save, SaveCheck, StickyNotePlus, Grid3x3, ChartNoAxesGantt, BetweenHorizontalStart } from './icons';

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
  const columnDisplay = useColumnDisplay();
  const fkCreate = useFkCreateMode();
  const layout = useLayoutPersistence(notes.notes, {
    defaultMode: columnDisplay.defaultMode,
    overrides: columnDisplay.overrides,
  });
  const settings = useSettings();
  const fieldsMatrix = useFieldsMatrix(postToHost);
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
      columnDisplay.applySeed(
        message.layout.defaultColumnDisplay ?? 'all',
        new Map(
          message.layout.tables
            .filter((table) => table.columnDisplay !== undefined)
            .map((table) => [table.name, table.columnDisplay as ColumnDisplayMode]),
        ),
      );
    },
    onLayoutActive: (message) => layout.applyActiveLayout(message),
    onSettingsCurrent: (openBehavior) => settings.applyCurrent(openBehavior),
    onMatrixColumnPrefs: (scope, columns) => fieldsMatrix.applyColumnPrefs(scope, columns),
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
    const columnDisplayMode = (nodeId: string): ColumnDisplayMode => columnDisplay.effectiveMode(nodeId);
    const displayedColumnCount = (nodeId: string): number => {
      const node = visibleGraph.nodes.find((n) => n.id === nodeId);
      if (node === undefined) return 0;
      const mode = columnDisplayMode(nodeId);
      if (mode === 'all') return node.columns.length;
      if (mode === 'nameOnly') return 0;
      const pk = new Set(node.primaryKey?.columns ?? []);
      if (mode === 'pkOnly') return node.columns.filter((c) => pk.has(c.name)).length;
      const fk = new Set(node.foreignKeyColumns);
      return node.columns.filter((c) => pk.has(c.name) || fk.has(c.name)).length;
    };
    return buildFlowElements(
      visibleGraph,
      layoutDiagram(visibleGraph, displayedColumnCount),
      columnDisplayMode,
    );
  }, [visibleGraph, layoutTick, columnDisplay.defaultMode, columnDisplay.overrides]);

  // Full (unfiltered-by-display) column existence, so a genuinely missing FK
  // column and a hidden-but-existing one stay distinguishable while dragging
  // (spec 20 vs. spec 24).
  const columnExists = useMemo(
    () => (visibleGraph === null ? (): undefined => undefined : columnRowIndexLookup(visibleGraph)),
    [visibleGraph],
  );

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

  // Spec 26: column clicks route through the FK-draw gesture first; when the
  // mode is inactive `handleColumnClick` returns null and the click falls
  // through to ordinary selection, byte-identical to before this feature.
  const onColumnSelectOrDraw = useCallback(
    (model: string, column: string): void => {
      const outcome = fkCreate.handleColumnClick(model, column);
      if (outcome === null) {
        onColumnSelect(model, column);
        return;
      }
      if (outcome.completed !== undefined) {
        const { source, target } = outcome.completed;
        onEdit({
          kind: 'createForeignKey',
          model: source.model,
          target: target.model,
          columns: [source.column],
          toColumns: [target.column],
          virtual: false,
        });
        onTableSelect(source.model);
        setFocusedFk({
          to: `ref('${target.model}')`,
          target: target.model,
          columns: [source.column],
          toColumns: [target.column],
          virtual: false,
        });
      }
    },
    [fkCreate, onColumnSelect, onEdit, onTableSelect, setFocusedFk],
  );

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

  const onOpenModelSource = useCallback((model: string, column?: string): void => {
    postToHost({ type: 'model:openSource', model, column });
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

  // Spec 26: the top-left "Add note" toolbar button — the toolbar path spec
  // 16 described but never wired up. Same addNote + focusNoteText pair as the
  // "Add note here" context-menu item, just centered on the viewport.
  const onAddNoteAt = useCallback(
    (point: { x: number; y: number }): void => {
      focusNoteText(notes.addNote(point.x, point.y));
    },
    [notes, focusNoteText],
  );

  // Spec 26: clicking empty canvas cancels an in-progress FK gesture, exactly
  // like Escape, in addition to the existing pane-click deselection.
  const onPaneClickWithFkCancel = useCallback((): void => {
    if (fkCreate.state.active) {
      fkCreate.cancel();
    }
    onPaneClick();
  }, [fkCreate, onPaneClick]);

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent, flowPoint: { x: number; y: number }): void => {
      openMenu(event.clientX, event.clientY, [
        {
          label: 'Add note here',
          icon: <StickyNotePlus size={16} />,
          onSelect: () => focusNoteText(notes.addNote(flowPoint.x, flowPoint.y)),
        },
        {
          label: 'Edit fields matrix (all models)',
          icon: <Grid3x3 size={16} />,
          onSelect: () => fieldsMatrix.openGlobal(),
        },
      ]);
    },
    [openMenu, notes, focusNoteText, fieldsMatrix],
  );

  const onDeleteSelectedNotes = useCallback((): void => {
    for (const id of notes.selectedNoteIds) {
      notes.deleteNote(id);
    }
  }, [notes]);

  // Spec 15 (extended by spec 25): the table card's context menu is the same
  // whether opened from the header or a column row — only what "Reveal in
  // model.yml" reveals differs, based on whether `column` is given.
  const buildTableMenuItems = useCallback(
    (model: string, column?: string): ContextMenuItem[] => {
      const currentMode = columnDisplay.effectiveMode(model);
      return [
        { label: 'Reveal in model.yml', icon: <ChartNoAxesGantt size={16} />, onSelect: () => onOpenModelSource(model, column) },
        {
          label: 'Show columns',
          icon: <BetweenHorizontalStart size={16} />,
          items: COLUMN_DISPLAY_OPTIONS.map((option) => ({
            label: option.label,
            checked: currentMode === option.value,
            onSelect: () => columnDisplay.setTableMode(model, option.value),
          })),
        },
        { label: 'Edit fields matrix', icon: <Grid3x3 size={16} />, onSelect: () => fieldsMatrix.openForModel(model) },
      ];
    },
    [columnDisplay, onOpenModelSource, fieldsMatrix],
  );

  const onColumnContextMenu = useCallback(
    (model: string, column: string, event: ReactMouseEvent): void => {
      openMenu(event.clientX, event.clientY, buildTableMenuItems(model, column));
    },
    [openMenu, buildTableMenuItems],
  );

  // Spec 15: only table cards carry a menu; other node types (notes) are
  // handled by their own features.
  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node): void => {
      event.preventDefault();
      if (node.type === 'table') {
        openMenu(event.clientX, event.clientY, buildTableMenuItems(node.id));
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
    [openMenu, buildTableMenuItems, notes],
  );

  const current = selection.selection;
  // Spec 26: while the FK gesture has a source picked, that column renders
  // selected too (reuses TableNode's existing selected-row styling), taking
  // priority over the ordinary selection.
  const fkPickedSource =
    fkCreate.state.active && fkCreate.state.source !== null ? fkCreate.state.source : null;
  const interaction: DiagramInteractionContextValue = useMemo(
    () => ({
      highlightedColumns: highlighting.highlightedColumns,
      onColumnHover: highlighting.onColumnHover,
      onColumnLeave: highlighting.onColumnLeave,
      selectedTableId: current !== null && current.kind === 'table' ? current.id : null,
      selectedColumnRef:
        fkPickedSource ??
        (current !== null && current.kind === 'column'
          ? { model: current.model, column: current.column }
          : null),
      onTableSelect,
      onColumnSelect: onColumnSelectOrDraw,
      onEdit,
      onColumnContextMenu,
    }),
    [
      highlighting.highlightedColumns,
      highlighting.onColumnHover,
      highlighting.onColumnLeave,
      current,
      fkPickedSource,
      onTableSelect,
      onColumnSelectOrDraw,
      onEdit,
      onColumnContextMenu,
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
              className="panel-button app__settings"
              onClick={settings.openPanel}
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
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
              {activeLayout === null
                ? <><SavePlus size={14} /> Save as new diagram</>
                : layout.dirty
                  ? <><Save size={14} /> Save</>
                  : <><SaveCheck size={14} /> No changes</>}
            </button>
          </header>

          {error !== null && <div className="banner banner--error">{error}</div>}
          {fkCreate.hint !== null && <div className="banner banner--info">{fkCreate.hint}</div>}
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
                    columnExists={columnExists}
                    columnDisplayDefault={columnDisplay.defaultMode}
                    onColumnDisplayDefaultChange={columnDisplay.setDefaultMode}
                    onPaneClick={onPaneClickWithFkCancel}
                    onNodeContextMenu={onNodeContextMenu}
                    revealTarget={revealTarget}
                    noteNodes={notes.noteNodes}
                    noteIds={notes.noteIds}
                    onNoteNodeChanges={notes.applyNoteNodeChanges}
                    onPaneContextMenu={onPaneContextMenu}
                    onDeleteSelectedNotes={onDeleteSelectedNotes}
                    onAddNoteAt={onAddNoteAt}
                    onOpenFieldsMatrix={fieldsMatrix.openGlobal}
                    fkSource={fkPickedSource}                    fkCreateActive={fkCreate.state.active}
                    onStartFkCreate={fkCreate.start}
                    onCancelFkCreate={fkCreate.cancel}
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
            columnDisplayMode={
              selectedTableId === null ? 'all' : columnDisplay.effectiveMode(selectedTableId)
            }
            onColumnDisplayModeChange={(mode) => {
              if (selectedTableId !== null) columnDisplay.setTableMode(selectedTableId, mode);
            }}
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
      {settings.open && (
        <SettingsPanel
          value={settings.openBehavior}
          onChange={settings.setOpenBehavior}
          onClose={settings.closePanel}
        />
      )}
      {fieldsMatrix.target !== null && graph !== null && (
        <FieldsMatrix
          target={fieldsMatrix.target}
          graph={graph}
          onEdit={onEdit}
          onClose={fieldsMatrix.close}
          columns={fieldsMatrix.columns}
          seedColumns={fieldsMatrix.seedColumns}
          onColumnsChange={fieldsMatrix.setColumns}
          storedPrefs={fieldsMatrix.storedPrefs[fieldsMatrix.target.scope]}
          columnFilters={fieldsMatrix.columnFilters}
          onColumnFilterChange={fieldsMatrix.setColumnFilter}
        />
      )}
    </main>
  );
}
