import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ReactFlowProvider, type Edge, type Node, type NodeChange } from '@xyflow/react';
import type { ModelEdit } from '../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../src/dbt/types';
import { displayedColumns } from '../src/diagram/columnDisplay';
import { buildFlowElements, columnRowIndexLookup, type FlowEdgeData } from '../src/diagram/flow';
import { groupRect, type GroupTableRect } from '../src/diagram/layoutGroups';
import { applyLayout } from '../src/diagram/layoutFile';
import { layoutDiagram } from '../src/diagram/layout';
import { filterGraph } from '../src/shared/filter';
import { diagramModeLabels } from '../src/shared/diagramMode';
import type { StaticDiagramRoute, StaticSiteData } from '../src/shared/staticSite';
import { DetailsSidebar, type SelectedEntity } from '../webview-ui/DetailsSidebar';
import { DiagramCanvas } from '../webview-ui/DiagramCanvas';
import { DiagramInteractionContext, type DiagramInteractionContextValue } from '../webview-ui/diagram-interaction-context';
import { FilterSidebar } from '../webview-ui/FilterSidebar';
import { useColumnDisplay } from '../webview-ui/hooks/useColumnDisplay';
import { useDiagramFilter } from '../webview-ui/hooks/useDiagramFilter';
import { useRevealModel } from '../webview-ui/hooks/useRevealModel';
import type { Selection } from '../webview-ui/hooks/useSelection';

export interface StaticDiagramProps { data: StaticSiteData; route: StaticDiagramRoute; onBack: () => void }

export function StaticDiagram(props: StaticDiagramProps): JSX.Element {
  return <ReactFlowProvider><StaticDiagramContent {...props} /></ReactFlowProvider>;
}

function StaticDiagramContent({ data, route, onBack }: StaticDiagramProps): JSX.Element {
  const layoutEntry = route.startsWith('diagram/') ? data.layouts.find((entry) => entry.route === route) : undefined;
  const mode = layoutEntry?.layout.mode ?? (route === 'sources' ? 'source' : 'model');
  const universe = mode === 'model' ? data.model : data.source;
  const filter = useDiagramFilter(data.initialSelectionLimit);
  const columnDisplay = useColumnDisplay();
  const [selection, setSelection] = useState<Selection>(null);
  const reveal = useRevealModel((name) => setSelection({ kind: 'table', id: name }));
  const [layoutTick, setLayoutTick] = useState(0);
  const [useSavedPositions, setUseSavedPositions] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [tableRects, setTableRects] = useState<readonly GroupTableRect[]>([]);
  const seeded = useMemo(() => layoutEntry === undefined || universe === undefined ? null : applyLayout(layoutEntry.layout, new Set(universe.graph.nodes.map((node) => node.id))), [layoutEntry, universe]);
  useEffect(() => {
    if (universe === undefined) return;
    filter.applyModelFiles(universe.files);
    if (seeded !== null) {
      filter.applyLayoutTables([...seeded.visible]);
      columnDisplay.applySeed(seeded.defaultColumnDisplay, seeded.columnDisplay);
    }
  }, [universe, seeded, filter.applyModelFiles, filter.applyLayoutTables, columnDisplay.applySeed]);
  const visibleGraph = useMemo(() => universe === undefined ? null : filterGraph(universe.graph, filter.visibleModels), [universe, filter.visibleModels]);
  const flow = useMemo(() => {
    if (visibleGraph === null) return null;
    const count = (id: string): number => { const node = visibleGraph.nodes.find((item) => item.id === id); return node === undefined ? 0 : displayedColumns(node, columnDisplay.effectiveMode(id)).length; };
    const automatic = layoutDiagram(visibleGraph, count);
    const positioned = seeded === null || !useSavedPositions ? automatic : { nodes: automatic.nodes.map((node) => ({ ...node, ...(seeded.positions.get(node.id) ?? {}) })) };
    return buildFlowElements(visibleGraph, positioned, columnDisplay.effectiveMode);
  }, [visibleGraph, layoutTick, columnDisplay.defaultMode, columnDisplay.overrides, seeded, useSavedPositions]);
  const selectedEntity = useMemo<SelectedEntity | null>(() => {
    if (selection === null || universe === undefined) return null;
    const node = universe.graph.nodes.find((item) => item.id === (selection.kind === 'table' ? selection.id : selection.model));
    if (node === undefined) return null;
    if (selection.kind === 'table') return { kind: 'table', node };
    const column = node.columns.find((item) => item.name === selection.column);
    return column === undefined ? null : { kind: 'column', node, column };
  }, [selection, universe]);
  const interaction = useMemo<DiagramInteractionContextValue>(() => ({
    highlightedColumns: new Map(), selectedTableId: selection?.kind === 'table' ? selection.id : null,
    selectedColumnRef: selection?.kind === 'column' ? selection : null, selectedColumns: new Map(), cutColumns: new Map(), insertionTarget: null,
    onColumnHover: () => undefined, onColumnLeave: () => undefined, onTableSelect: (id) => setSelection({ kind: 'table', id }),
    onColumnSelect: (model, column) => setSelection({ kind: 'column', model, column }), onEdit: (_edit: ModelEdit) => undefined,
    onColumnContextMenu: () => undefined, onColumnDragStart: () => undefined, onColumnDragOver: () => undefined,
    onColumnDragLeave: () => undefined, onColumnDrop: () => undefined, onColumnDragEnd: () => undefined,
  }), [selection]);
  if (universe === undefined || flow === null || visibleGraph === null) return <div className="static-diagram"><header className="static-diagram__header"><button onClick={onBack}>Back</button></header><p>No {mode} definitions found.</p></div>;
  const notes = layoutEntry?.layout.notes ?? [];
  const noteNodes: Node[] = notes.map((note) => ({ id: note.id, type: 'note', position: { x: note.x, y: note.y }, draggable: false, selectable: false, data: { note, collapsed: collapsed.has(note.id) ? !note.collapsedByDefault : note.collapsedByDefault, onTextChange: () => undefined, onResize: () => undefined, onToggleCollapsed: (id: string) => setCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }) } }));
  const groupNodes: Node[] = (layoutEntry?.layout.groups ?? []).flatMap((group) => { const rect = groupRect(group, tableRects); return rect === null ? [] : [{ id: group.id, type: 'group', position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height, style: { width: rect.width, height: rect.height }, draggable: false, selectable: false, data: { group, viewport: rect, zoom: 1 } }]; });
  return <div className="static-diagram"><header className="static-diagram__header"><button type="button" onClick={onBack}>Back to diagrams</button> <strong>{layoutEntry?.title ?? `${mode === 'model' ? 'Model' : 'Source'} explorer`}</strong></header>
    {layoutEntry !== undefined && layoutEntry.missing.length > 0 && <p className="static-warning">Missing tables: {layoutEntry.missing.join(', ')}</p>}
    <div className="static-diagram__body"><FilterSidebar files={universe.files} labels={diagramModeLabels(mode)} showSql={false} availableModelNames={filter.availableModelNames} selectedFiles={filter.selectedFiles} selectedModels={filter.selectedModels} fileSearch={filter.fileSearch} modelSearch={filter.modelSearch} onFileSearchChange={filter.setFileSearch} onModelSearchChange={filter.setModelSearch} onToggleFile={filter.toggleFile} onToggleModel={filter.toggleModel} onSelectAllFiles={filter.selectAllFiles} onClearFiles={filter.clearFiles} onSelectAllModels={filter.selectAllModels} onClearModels={filter.clearModels} onRevealModel={reveal.revealModel} onOpenModelSource={() => undefined} sqlModels={new Set()} onOpenModelSql={() => undefined} onOpenMenu={() => undefined} onCollapse={() => undefined} />
      <DiagramInteractionContext.Provider value={interaction}><div className="static-diagram__canvas"><DiagramCanvas flow={flow} edges={flow.edges as Edge<FlowEdgeData>[]} layoutTick={layoutTick} filterTick={filter.filterTick} seedPositions={null} seedTick={0} onPositionsChange={() => undefined} onEdgeMouseEnter={() => undefined} onEdgeMouseLeave={() => undefined} onEdgeClick={(_event: ReactMouseEvent, edge: Edge) => setSelection({ kind: 'table', id: edge.source })} onEdgeDoubleClick={() => undefined} onAutoLayout={() => { setUseSavedPositions(false); setLayoutTick((tick) => tick + 1); }} columnExists={columnRowIndexLookup(visibleGraph)} columnDisplayDefault={columnDisplay.defaultMode} onColumnDisplayDefaultChange={columnDisplay.setDefaultMode} onPaneClick={() => setSelection(null)} onNodeContextMenu={() => undefined} revealTarget={reveal.revealTarget} noteNodes={noteNodes} noteIds={new Set(notes.map((note) => note.id))} onNoteNodeChanges={(_changes: NodeChange[]) => undefined} onPaneContextMenu={() => undefined} onDeleteSelectedNotes={() => undefined} onRemoveSelectedTable={() => undefined} onAddNoteAt={() => undefined} groupNodes={groupNodes} groupIds={new Set(groupNodes.map((node) => node.id))} onTableRectsChange={setTableRects} onCreateGroup={() => undefined} fkSource={null} fkCreateActive={false} onStartFkCreate={() => undefined} onCancelFkCreate={() => undefined} onLayoutGestureStart={() => undefined} onLayoutGestureFinish={() => undefined} /></div></DiagramInteractionContext.Provider>
      <DetailsSidebar entity={selectedEntity} nodes={universe.graph.nodes} focusedFk={null as ForeignKeyDescriptor | null} drafts={[]} onEdit={() => undefined} onAddDraft={() => undefined} onRemoveDraft={() => undefined} onDraftVirtualChange={() => undefined} onDraftAddPair={() => undefined} onRemoveLastPair={() => undefined} onCollapse={() => undefined} onOpenModelSource={() => undefined} columnDisplayMode={selectedEntity?.kind === 'table' ? columnDisplay.effectiveMode(selectedEntity.node.id) : columnDisplay.defaultMode} onColumnDisplayModeChange={(next) => { if (selectedEntity?.kind === 'table') columnDisplay.setTableMode(selectedEntity.node.id, next); }} mode={mode} />
    </div></div>;
}
