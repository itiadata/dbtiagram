/**
 * The React Flow canvas: node adoption, live edge routing, and the viewport
 * fit policy. Split out of `App.tsx` (spec 17).
 */
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
  applyNodeChanges,
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
  type FlowElements,
  type HandleSide,
} from '../src/diagram/flow';
import { HEADER_HEIGHT, NODE_WIDTH } from '../src/diagram/layout';
import type { DiagramLayoutTable } from '../src/diagram/layoutFile';
import { mergeFlowNodes, type NodePosition } from '../src/diagram/positions';
import { FkEdge } from './FkEdge';
import type { RevealTarget } from './hooks/useRevealModel';
import { NoteNode } from './NoteNode';
import { TableNode } from './TableNode';

const nodeTypes: NodeTypes = { table: TableNode, note: NoteNode };
// The obstacle-aware FK edge (spec 12) — it draws the routed polyline.
const edgeTypes: EdgeTypes = { [FK_EDGE_TYPE]: FkEdge };

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
  /** Bumped by the "Add note" toolbar button; creates a note at the center. */
  addNoteTick: number;
  onAddNoteAt: (x: number, y: number) => void;
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
  onPaneClick,
  onNodeContextMenu,
  revealTarget,
  noteNodes,
  noteIds,
  onNoteNodeChanges,
  onPaneContextMenu,
  onDeleteSelectedNotes,
  addNoteTick,
  onAddNoteAt,
}: DiagramCanvasProps): JSX.Element {
  const { fitView, setCenter, getZoom, screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAddNoteTickRef = useRef(addNoteTick);
  // Seed the node list from the current flow so the first paint already has
  // full node rects (the live edge pass runs during render, before the adopt
  // effect below); later flow changes flow through the effect.
  const [rfNodes, setRfNodes] = useState<Node[]>(() => flow.nodes);
  const lastTickRef = useRef(layoutTick);
  const lastFilterTickRef = useRef(filterTick);
  const lastIdsRef = useRef<string[]>([]);
  const firstFitRef = useRef(true);
  const lastSeedTickRef = useRef(seedTick);

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
    const isFirst = firstFitRef.current;
    firstFitRef.current = false;
    if (isFirst || added || reset || filterChanged || seeded) {
      void fitView({ padding: 0.15, maxZoom: 1 });
    }
  }, [flow, layoutTick, filterTick, seedTick, seedPositions, fitView]);

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
    () => routeEdges(flow.edges, nodeRects, columnIndexOf),
    [flow.edges, nodeRects, columnIndexOf],
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
    },
    [onDeleteSelectedNotes],
  );

  // Spec 16: the "Add note" toolbar button lives outside ReactFlowProvider, so
  // it bumps a tick and the canvas — which can translate screen to canvas
  // coordinates — places the note at the center of the visible viewport.
  useEffect(() => {
    if (addNoteTick === lastAddNoteTickRef.current) {
      return;
    }
    lastAddNoteTickRef.current = addNoteTick;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect === undefined) {
      return;
    }
    const point = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    onAddNoteAt(point.x, point.y);
  }, [addNoteTick, screenToFlowPosition, onAddNoteAt]);

  const onPaneContextMenuInternal = useCallback(
    (event: ReactMouseEvent | MouseEvent): void => {
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onPaneContextMenu(event as ReactMouseEvent, point);
    },
    [screenToFlowPosition, onPaneContextMenu],
  );

  // Notes paint first so a note can never hide a table card (spec 16).
  const renderedNodes = useMemo(
    () => [...noteNodes, ...liveNodes.map((node) => ({ ...node, zIndex: 1 }))],
    [noteNodes, liveNodes],
  );

  return (
    <div className="canvas__surface" ref={containerRef} onKeyDown={onKeyDown} role="presentation">
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
      <Panel position="top-right">
        <button type="button" className="panel-button" onClick={onAutoLayout}>
          Auto-layout
        </button>
      </Panel>
    </ReactFlow>
    </div>
  );
}
