/**
 * The React Flow canvas: node adoption, live edge routing, and the viewport
 * fit policy. Split out of `App.tsx` (spec 17).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  ViewportPortal,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import {
  FK_EDGE_TYPE,
  routeEdges,
  type ColumnRowIndexLookup,
  type FlowElements,
  type HandleSide,
} from '../src/diagram/flow';
import { HEADER_HEIGHT, NODE_WIDTH, columnRowCenterY } from '../src/diagram/layout';
import { chooseSide } from '../src/diagram/routing';
import { COLUMN_DISPLAY_OPTIONS, type ColumnDisplayMode } from '../src/diagram/columnDisplay';
import type { DiagramLayoutTable } from '../src/diagram/layoutFile';
import { mergeFlowNodes, type NodePosition } from '../src/diagram/positions';
import { FkEdge } from './FkEdge';
import { StickyNotePlus, Cable, Grid3x3, Network } from './icons';
import type { RevealTarget } from './hooks/useRevealModel';
import { shouldRunInitialFit, shouldRunPendingFit } from './initial-fit';
import { NoteNode } from './NoteNode';
import { TableNode } from './TableNode';

const nodeTypes: NodeTypes = { table: TableNode, note: NoteNode };
// The obstacle-aware FK edge (spec 12) — it draws the routed polyline.
const edgeTypes: EdgeTypes = { [FK_EDGE_TYPE]: FkEdge };

// Upper bound on how many frames the spec 32 owed fit waits for React Flow to
// measure every card before fitting anyway (~2s at 60fps).
const MAX_FIT_WAIT_FRAMES = 120;

export interface DiagramCanvasProps {
  flow: FlowElements;
  edges: Edge[];
  layoutTick: number;
  filterTick: number;
  /** Stored positions from an opened layout, adopted when `seedTick` changes. */
  seedPositions: Map<string, NodePosition> | null;
  seedTick: number;
  /** Reports the live positions of the visible tables (spec 13). */
  onPositionsChange: (tables: DiagramLayoutTable[]) => void;
  onEdgeMouseEnter: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  onEdgeClick: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeDoubleClick: (event: ReactMouseEvent, edge: Edge) => void;
  onAutoLayout: () => void;
  /** Full (unfiltered-by-display) column existence, so the live drag pass can
   * still distinguish a genuinely missing FK column from a merely hidden one
   * (spec 20 vs. spec 24). */
  columnExists: ColumnRowIndexLookup;
  /** The diagram-wide default column-display mode and its setter (spec 24). */
  columnDisplayDefault: ColumnDisplayMode;
  onColumnDisplayDefaultChange: (mode: ColumnDisplayMode) => void;
  onPaneClick: () => void;
  /** Right-click on a node; the App decides the menu from `node.type` (spec 15). */
  onNodeContextMenu: (event: ReactMouseEvent, node: Node) => void;
  /** Centers the viewport on a table when this changes (spec 15). */
  revealTarget: RevealTarget | null;
  /** Sticky note nodes, rendered behind the tables (spec 16). */
  noteNodes: Node[];
  noteIds: ReadonlySet<string>;
  onNoteNodeChanges: (changes: NodeChange[]) => void;
  /** Right-click on empty canvas; opens the "Add note here" menu (spec 16). */
  onPaneContextMenu: (event: ReactMouseEvent, flowPoint: { x: number; y: number }) => void;
  onDeleteSelectedNotes: () => void;
  /** Delete/Backspace on the canvas: removes the selected table (spec 36). */
  onRemoveSelectedTable: () => void;
  /** Creates a note at the given flow point (spec 26's "Add note" toolbar button). */
  onAddNoteAt: (point: { x: number; y: number }) => void;
  /** Opens the global fields matrix (spec 27's toolbar button). */
  onOpenFieldsMatrix: () => void;
  /** The column picked as the FK gesture's source, or null (spec 26). */
  fkSource: { model: string; column: string } | null;
  fkCreateActive: boolean;
  onStartFkCreate: () => void;
  onCancelFkCreate: () => void;
}

export function DiagramCanvas({
  flow,
  edges,
  layoutTick,
  filterTick,
  seedPositions,
  seedTick,
  onPositionsChange,
  onEdgeMouseEnter,
  onEdgeMouseLeave,
  onEdgeClick,
  onEdgeDoubleClick,
  onAutoLayout,
  columnExists,
  columnDisplayDefault,
  onColumnDisplayDefaultChange,
  onPaneClick,
  onNodeContextMenu,
  revealTarget,
  noteNodes,
  noteIds,
  onNoteNodeChanges,
  onPaneContextMenu,
  onDeleteSelectedNotes,
  onRemoveSelectedTable,
  onAddNoteAt,
  onOpenFieldsMatrix,
  fkSource,
  fkCreateActive,
  onStartFkCreate,
  onCancelFkCreate,
}: DiagramCanvasProps): JSX.Element {
  const { fitView, setCenter, getZoom, getNodes, screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Seed the node list from the current flow so the first paint already has
  // full node rects (the live edge pass runs during render, before the adopt
  // effect below); later flow changes flow through the effect.
  const [rfNodes, setRfNodes] = useState<Node[]>(() => flow.nodes);
  const lastTickRef = useRef(layoutTick);
  const lastFilterTickRef = useRef(filterTick);
  const lastIdsRef = useRef<string[]>([]);
  const lastSeedTickRef = useRef(seedTick);
  const didInitialFitRef = useRef(false);
  // Spec 21: set on the first pointerdown anywhere on the canvas, in the
  // capture phase so it is recorded before React Flow's drag handling and
  // before any child's `stopPropagation`. Read only by the corrective fit.
  const userInteractedRef = useRef(false);
  const pendingFitRef = useRef(false);
  const pendingFitFrameRef = useRef<number | undefined>(undefined);
  const nodesInitialized = useNodesInitialized();

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
    // Spec 13: opening a saved layout overrides the automatic arrangement for
    // every table the layout stores a position for. Tables the layout does not
    // mention (e.g. re-checked later) still get their dagre slot.
    const seeded = seedTick !== lastSeedTickRef.current;
    lastSeedTickRef.current = seedTick;
    const seededNodes =
      seeded && seedPositions !== null
        ? flow.nodes.map((node) => {
            const stored = seedPositions.get(node.id);
            return stored === undefined ? node : { ...node, position: { ...stored } };
          })
        : flow.nodes;
    setRfNodes((current) =>
      reset ? flow.nodes : seeded ? seededNodes : mergeFlowNodes(flow.nodes, current),
    );

    const ids = flow.nodes.map((node) => node.id);
    // Fit only when the node set actually grows (net count up); a rename swaps
    // one id for another and must neither refit nor disturb the layout (spec
    // 04 — the renamed card keeps its position via mergeFlowNodes).
    const added = ids.length > lastIdsRef.current.length;
    lastIdsRef.current = ids;
    if (added || reset || filterChanged || seeded) {
      pendingFitRef.current = true;
    }
  }, [flow, layoutTick, filterTick, seedTick, seedPositions, fitView]);

  // Spec 32: deferred fit — the adopt effect sets `pendingFitRef` instead of
  // calling `fitView` inline.
  //
  // Simply deferring by one commit (or one macrotask) is not enough. After
  // Auto-layout the adopt effect replaces `rfNodes` with brand-new node
  // objects straight from `buildFlowElements`, which carry no measured
  // dimensions yet, while `useNodesInitialized` is still stale-`true` from the
  // previous node set. Fitting at that moment measures the cards at their
  // fallback sizes — smaller than the real rendered cards — so the bounds come
  // out too small and the result is noticeably more zoomed in than the
  // Controls "Fit View" button gives.
  //
  // So the owed fit waits, frame by frame, until React Flow reports a measured
  // width/height for every current node, and only then fits. That is exactly
  // the state the canvas is in when the user clicks Fit View manually, so the
  // two produce the same viewport. `fitView()` is called with no arguments for
  // the same reason: `<Controls>` forwards its own (unset) `fitViewOptions`.
  //
  // The frame handle lives in a ref cleared only on unmount — never as this
  // effect's own cleanup, because the measurement updates we are waiting for
  // change `rfNodes` and would otherwise cancel the very fit they should
  // trigger.
  useEffect(() => {
    if (!shouldRunPendingFit(nodesInitialized, pendingFitRef.current)) return;
    pendingFitRef.current = false;

    let attempts = 0;
    const runWhenMeasured = (): void => {
      const nodes = getNodes();
      const allMeasured =
        nodes.length > 0 &&
        nodes.every(
          (node) =>
            node.measured?.width !== undefined && node.measured.height !== undefined,
        );
      // Bail out after ~2s of frames so a node that never measures (e.g. one
      // rendered with zero size) can't leave the fit permanently pending.
      if (allMeasured || attempts >= MAX_FIT_WAIT_FRAMES) {
        pendingFitFrameRef.current = undefined;
        void fitView();
        return;
      }
      attempts += 1;
      pendingFitFrameRef.current = requestAnimationFrame(runWhenMeasured);
    };
    pendingFitFrameRef.current = requestAnimationFrame(runWhenMeasured);
  }, [rfNodes, nodesInitialized, fitView, getNodes]);

  useEffect(
    () => () => {
      if (pendingFitFrameRef.current !== undefined) {
        cancelAnimationFrame(pendingFitFrameRef.current);
      }
    },
    [],
  );

  // Spec 19: the pre-measurement `fitView` prop/`fitViewOptions` run before
  // React Flow has measured the table cards, so the initial fit is against
  // stale/default dimensions. Once nodes are actually measured, correct the
  // viewport once — a ref guard keeps this to a single fit for the life of
  // the panel, so later measurement churn (e.g. a card growing after an
  // inline edit) never refits and disturbs an in-progress pan/zoom (spec 04).
  //
  // Spec 21: this runs in a *layout* effect so the corrected viewport is
  // committed before the browser paints the un-fitted one — the user can never
  // see, and so never click, a layout that is about to shift. Should the fit
  // still be pending once the user has touched the canvas, it is abandoned
  // outright rather than yanking a card out from under an in-flight click.
  useLayoutEffect(() => {
    if (!shouldRunInitialFit(nodesInitialized, didInitialFitRef.current, userInteractedRef.current)) {
      return;
    }
    didInitialFitRef.current = true;
    void fitView({ padding: 0.15, maxZoom: 1 });
  }, [nodesInitialized, fitView]);

  // Spec 13: report the live table positions upward so the App can save them
  // (and, while a layout is active, write them back after a short debounce).
  useEffect(() => {
    onPositionsChange(
      rfNodes.map((node) => ({
        name: node.id,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      })),
    );
  }, [rfNodes, onPositionsChange]);

  // Live edge geometry (spec 12): the sides an edge uses, the dot the column
  // mounts, AND the path it takes around the other cards are all re-derived
  // from the CURRENT node positions on every drag, not frozen at the initial
  // layout. Node rects come from React Flow's live state; routeEdges preserves
  // edge ids/type/data so hover highlighting and edge double-click keep
  // working unchanged.
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
  // Column row indices come from the node data, so the router anchors each
  // edge at the exact row it attaches to.
  const columnIndexOf = useMemo(() => {
    const byNode = new Map<string, Map<string, number>>(
      rfNodes.map((node) => {
        const columns = (node.data as { columns?: { name: string }[] }).columns ?? [];
        return [node.id, new Map(columns.map((column, index) => [column.name, index]))];
      }),
    );
    return (nodeId: string, column: string): number | undefined => byNode.get(nodeId)?.get(column);
  }, [rfNodes]);
  const { edges: liveEdges, nodeHandles } = useMemo(
    () => routeEdges(flow.edges, nodeRects, columnIndexOf, columnExists),
    [flow.edges, nodeRects, columnIndexOf, columnExists],
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

  // Spec 16: notes are React Flow nodes too, but they live in their own state
  // and must never enter `rfNodes` — the routing, fit and position-report
  // passes above all assume tables only. Changes are partitioned by id;
  // changes without an id (e.g. viewport-level) go to the table branch.
  const onNodesChange = useCallback(
    (changes: NodeChange[]): void => {
      const noteChanges: NodeChange[] = [];
      const tableChanges: NodeChange[] = [];
      for (const change of changes) {
        const id = 'id' in change ? change.id : undefined;
        if (id !== undefined && noteIds.has(id)) noteChanges.push(change);
        else tableChanges.push(change);
      }
      if (noteChanges.length > 0) {
        onNoteNodeChanges(noteChanges);
      }
      if (tableChanges.length > 0) {
        setRfNodes((current) => applyNodeChanges(tableChanges, current));
      }
    },
    [noteIds, onNoteNodeChanges],
  );

  const onEdgesChange = useCallback((_changes: EdgeChange[]): void => {
    // Edges are fully derived here: geometry from the live node positions,
    // styling from the App-level hover pass. React Flow never mutates edges in
    // this app (elementsSelectable is false), so there is nothing to apply.
  }, []);

  // Spec 15: center on the requested table. Keyed on `rfNodes` too, so a reveal
  // fired before the node exists (e.g. right after a filter change) lands as
  // soon as it appears. Never zooms out: a user zoomed in past 0.8 stays there.
  useEffect(() => {
    if (revealTarget === null) {
      return;
    }
    const node = rfNodes.find((candidate) => candidate.id === revealTarget.name);
    if (node === undefined) {
      return;
    }
    void setCenter(
      node.position.x + (node.width ?? NODE_WIDTH) / 2,
      node.position.y + (node.height ?? HEADER_HEIGHT) / 2,
      { zoom: Math.max(getZoom(), 0.8), duration: 300 },
    );
  }, [revealTarget, rfNodes, setCenter, getZoom]);

  // Spec 16: Delete/Backspace removes the selected notes. Ignored while the
  // caret is in a text field, so editing a note's text never deletes it.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) {
        return;
      }
      onDeleteSelectedNotes();
      onRemoveSelectedTable();
    },
    [onDeleteSelectedNotes, onRemoveSelectedTable],
  );

  const onPaneContextMenuInternal = useCallback(
    (event: ReactMouseEvent | MouseEvent): void => {
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onPaneContextMenu(event as ReactMouseEvent, point);
    },
    [screenToFlowPosition, onPaneContextMenu],
  );

  const onAddNote = useCallback((): void => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const center = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    onAddNoteAt(center);
  }, [screenToFlowPosition, onAddNoteAt]);

  // Spec 26: while the FK gesture has a source picked, track the live mouse
  // position in flow coordinates so the preview line can follow the pointer.
  // A no-op handler otherwise avoids a re-render per mouse move when the mode
  // is off.
  const [fkMousePoint, setFkMousePoint] = useState<{ x: number; y: number } | null>(null);
  const trackingFkPreview = fkCreateActive && fkSource !== null;
  useEffect(() => {
    if (!trackingFkPreview) {
      setFkMousePoint(null);
    }
  }, [trackingFkPreview]);
  const onSurfaceMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (!trackingFkPreview) return;
      setFkMousePoint(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [trackingFkPreview, screenToFlowPosition],
  );

  // The FK preview line's source anchor: the picked column's row, on the side
  // facing the current mouse position (spec 26).
  const fkPreviewLine = useMemo(() => {
    if (!trackingFkPreview || fkSource === null || fkMousePoint === null) {
      return null;
    }
    const node = rfNodes.find((candidate) => candidate.id === fkSource.model);
    if (node === undefined) {
      return null;
    }
    const rowIndex = columnIndexOf(fkSource.model, fkSource.column);
    const width = node.width ?? NODE_WIDTH;
    const y = node.position.y + (rowIndex !== undefined ? columnRowCenterY(rowIndex) : HEADER_HEIGHT / 2);
    const centerX = node.position.x + width / 2;
    const side = chooseSide(centerX, fkMousePoint.x);
    const x = node.position.x + (side === 'right' ? width : 0);
    return { from: { x, y }, to: fkMousePoint };
  }, [trackingFkPreview, fkSource, fkMousePoint, rfNodes, columnIndexOf]);

  // Notes paint first so a note can never hide a table card (spec 16).
  const renderedNodes = useMemo(
    () => [...noteNodes, ...liveNodes.map((node) => ({ ...node, zIndex: 1 }))],
    [noteNodes, liveNodes],
  );

  return (
    <div
      className={
        fkCreateActive ? 'canvas__surface canvas__surface--fk-create' : 'canvas__surface'
      }
      ref={containerRef}
      onKeyDown={onKeyDown}
      onMouseMove={onSurfaceMouseMove}
      onPointerDownCapture={() => {
        userInteractedRef.current = true;
      }}
      role="presentation"
    >
    <ReactFlow
      nodes={renderedNodes}
      edges={liveStyledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
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
      onNodeContextMenu={onNodeContextMenu}
      onPaneContextMenu={onPaneContextMenuInternal}
      minZoom={0.1}
      maxZoom={2}
    >
      <Background gap={16} size={1} />
      <Controls />
      <Panel position="top-left">
        <div className="canvas-toolbar">
          <button
            type="button"
            className="panel-button panel-button--secondary"
            onClick={onAddNote}
            title="Add note"
          >
            <StickyNotePlus size={16} />
          </button>
          <button
            type="button"
            className="panel-button panel-button--secondary"
            onClick={fkCreateActive ? onCancelFkCreate : onStartFkCreate}
            title={fkCreateActive ? 'Cancel' : 'Add foreign key'}
          >
            <Cable size={16} />
          </button>
          <button
            type="button"
            className="panel-button panel-button--secondary"
            onClick={onOpenFieldsMatrix}
            title="Edit fields matrix"
          >
            <Grid3x3 size={16} />
          </button>
        </div>
      </Panel>
      <Panel position="top-right">
        <div className="canvas-toolbar">
          <button
            type="button"
            className="panel-button panel-button--secondary"
            onClick={onAutoLayout}
            title="Auto-layout"
          >
            <Network size={16} />
          </button>
          <select
            className="canvas-toolbar__select"
            value={columnDisplayDefault}
            onChange={(event) => onColumnDisplayDefaultChange(event.target.value as ColumnDisplayMode)}
            title="Sets the column display mode for every table, current and future"
          >
            {COLUMN_DISPLAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Panel>
      {fkPreviewLine !== null && (
        <ViewportPortal>
          <svg className="fk-draw-line-layer">
            <line
              className="fk-draw-line"
              x1={fkPreviewLine.from.x}
              y1={fkPreviewLine.from.y}
              x2={fkPreviewLine.to.x}
              y2={fkPreviewLine.to.y}
            />
          </svg>
        </ViewportPortal>
      )}
    </ReactFlow>
    </div>
  );
}
