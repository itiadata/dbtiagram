/**
 * Pure mapping from the diagram graph + layout onto React Flow elements.
 * MUST NOT import `vscode`.
 *
 * Produces the nodes/edges arrays that the webview passes straight to
 * `<ReactFlow>`. Each model becomes a custom `table` node with per-column
 * Handles; each FK constraint becomes one `fk` edge per column pair (spec 09
 * merged: equal, non-empty column arrays only — table-level edges are gone).
 *
 * Spec 12: an edge's endpoint sides AND its path both come from the pure
 * router in `./routing` — one scoring function that avoids running over or
 * under other cards. `buildFlowElements` seeds this geometry from the initial
 * dagre layout; `routeEdges` re-derives it from the CURRENT node positions so
 * the webview keeps the sides, the dots and the path live while a card is
 * dragged. Each node's `data.handles` records exactly which handles its edges
 * use (the webview mounts a dot for those and nothing else).
 */
import type { Edge, Node } from '@xyflow/react';
import type { DiagramGraph, TableNodeColumn } from './graph';
import { columnRowCenterY } from './layout';
import type { DiagramLayout, NodePlacement } from './layout';
import { ROUTING_NODE_LIMIT, routeEdge, type Point } from './routing';

/** A handle's attachment side on a node's edge. */
export type HandleSide = 'left' | 'right';

/** Row data rendered by the custom `table` node. */
export type FlowNodeData = {
  label: string;
  description?: string;
  columns: TableNodeColumn[];
  /** Column names on this model that should render highlighted. */
  highlightedColumns?: string[];
  /** The displayed primary key (copied from the graph node) — key icons (spec 08). */
  primaryKey?: { columns: string[]; virtual: boolean };
  /**
   * Handle placements for the handles this node actually uses: keyed by the
   * full handle id (e.g. `customer_id:source:right`), value the side. Only
   * handles that an edge references appear here — the webview mounts a dot
   * exactly for these, and nodes with no edges omit the key entirely
   * (spec 09 merged).
   */
  handles?: Record<string, HandleSide>;
};

/** Node descriptor for a custom `table` node. */
export type FlowNode = Node<FlowNodeData, 'table'>;

/** Edge payload used by the webview's hover highlighting, tooltip and path. */
export type FlowEdgeData = {
  sourceColumn?: string;
  targetColumn?: string;
  /** Human-readable FK description, e.g. 'order_items.order_id -> orders.order_id'. */
  title: string;
  /** True for virtual (meta-stored) FKs — drawn dashed (spec 08). */
  virtual?: boolean;
  /**
   * The routed orthogonal polyline, source anchor first (spec 12). The custom
   * `fk` edge draws it with rounded corners; when absent (a transient
   * missing-rect render) the edge falls back to a straight path.
   */
  points?: Point[];
};

/** An edge that is guaranteed to carry its `FlowEdgeData` payload. */
export type FlowEdge = Edge<FlowEdgeData> & { data: FlowEdgeData };

export interface FlowElements {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/**
 * Handle id for an outgoing edge on the `side` edge of a column row. The side
 * is part of the id so one column can hold edges in both directions without
 * id collisions (spec 09 merged).
 */
export function columnSourceHandle(column: string, side: HandleSide): string {
  return `${column}:source:${side}`;
}

/** Handle id for an incoming edge on the `side` edge of a column row. */
export function columnTargetHandle(column: string, side: HandleSide): string {
  return `${column}:target:${side}`;
}

/**
 * A node's current on-canvas footprint. `buildFlowElements` builds these from
 * the layout; the webview builds them from React Flow's live node state
 * (position + measured width/height) when recomputing edge sides during a
 * drag.
 */
export interface NodeRect {
  id: string;
  /** Top-left corner of the node card. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolves the row index of a column on a node, so the router knows the exact
 * y of the handle it is routing from/to. Returns `undefined` for an unknown
 * node/column (the router then falls back to the card's vertical center).
 */
export type ColumnRowIndexLookup = (nodeId: string, column: string) => number | undefined;

/** Edge type id of the custom obstacle-aware FK edge (spec 12). */
export const FK_EDGE_TYPE = 'fk';


/**
 * Width (px) of the invisible hover/click band around every edge, rendered by
 * React Flow's `interactionWidth`. The visible stroke stays 1.5px; this band
 * is what makes hovering forgiving instead of pixel-perfect (spec 03, Manual
 * Verify iteration). Must match the `.react-flow__edge-interaction` notes in
 * `webview-ui/styles.css`.
 */
export const EDGE_INTERACTION_WIDTH = 24;

/** Maps the diagram graph + dagre layout onto React Flow nodes and edges. */
export function buildFlowElements(graph: DiagramGraph, layout: DiagramLayout): FlowElements {
  const byId = new Map(layout.nodes.map((placement) => [placement.id, placement]));

  const placementOf = (id: string): NodePlacement => {
    const placement = byId.get(id);
    if (placement === undefined) {
      throw new Error(`buildFlowElements: no layout placement for node ${id}`);
    }
    return placement;
  };

  const usedIds = new Set<string>();
  const rawEdges: FlowEdge[] = [];

  // Only column-pair edges exist (spec 09 merged): graph edges with empty or
  // unequal-length arrays never reach this layer. Handles/paths are filled in
  // by the single routing pass below (spec 12), so the initial layout and the
  // live drag pass can never drift apart.
  for (const edge of graph.edges) {
    edge.sourceColumns.forEach((sourceColumn, index) => {
      const targetColumn = edge.targetColumns[index];
      rawEdges.push({
        id: uniqueId(usedIds, `${edge.source}.${sourceColumn}->${edge.target}.${targetColumn}`),
        source: edge.source,
        target: edge.target,
        sourceHandle: columnSourceHandle(sourceColumn, 'right'),
        targetHandle: columnTargetHandle(targetColumn, 'left'),
        type: FK_EDGE_TYPE,
        interactionWidth: EDGE_INTERACTION_WIDTH,
        data: {
          sourceColumn,
          targetColumn,
          title: `${edge.source}.${sourceColumn} -> ${edge.target}.${targetColumn}`,
          ...(edge.virtual ? { virtual: true } : {}),
        },
      });
    });
  }

  const nodeRects: NodeRect[] = layout.nodes.map((placement) => ({
    id: placement.id,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  }));
  const columnIndexOf = columnRowIndexLookup(graph);
  const { edges, nodeHandles } = routeEdges(rawEdges, nodeRects, columnIndexOf);

  const nodes: FlowNode[] = graph.nodes.map((node) => {
    const placement = placementOf(node.id);
    const handles = nodeHandles.get(node.id);
    return {
      id: node.id,
      type: 'table',
      position: { x: placement.x, y: placement.y },
      width: placement.width,
      height: placement.height,
      data: {
        label: node.label,
        description: node.description,
        columns: node.columns,
        ...(node.primaryKey !== undefined ? { primaryKey: node.primaryKey } : {}),
        ...(handles !== undefined ? { handles: Object.fromEntries(handles) } : {}),
      },
    };
  });

  return { nodes, edges };
}

export interface RoutedEdgeGeometry {
  /** The input edges with their sides and `data.points` updated to what the current positions demand. */
  edges: FlowEdge[];
  /** Per node: the handle ids its edges use (id -> side), derived from the same pass. */
  nodeHandles: Map<string, Map<string, HandleSide>>;
}

/**
 * The single geometry pass (spec 12): for every edge it asks the pure router
 * for the best side pair AND path given the CURRENT node rects, then rebuilds
 * the per-node `handles` map from the chosen sides. Used by
 * `buildFlowElements` on the initial dagre layout and by the webview on every
 * drag frame, so build-time and drag-time geometry can never differ.
 *
 * Edge ids, types and the rest of `data` (hover/tooltip payloads) are
 * preserved. An endpoint that is missing from `nodeRects` — a transient
 * one-render gap while React Flow adopts a new node list (mount, rename) —
 * leaves that edge untouched instead of crashing; the next render recomputes
 * from the complete rect set.
 *
 * Above `ROUTING_NODE_LIMIT` nodes the obstacle set is dropped: the router
 * then simply picks the shortest, straightest candidate (spec 12, section 7).
 */
export function routeEdges(
  edges: readonly FlowEdge[],
  nodeRects: readonly NodeRect[],
  columnIndexOf: ColumnRowIndexLookup,
): RoutedEdgeGeometry {
  const byId = new Map(nodeRects.map((rect) => [rect.id, rect]));
  const scoreObstacles = nodeRects.length <= ROUTING_NODE_LIMIT;

  const nodeHandles = new Map<string, Map<string, HandleSide>>();
  const addHandle = (nodeId: string, handleId: string, side: HandleSide): void => {
    let handles = nodeHandles.get(nodeId);
    if (handles === undefined) {
      handles = new Map();
      nodeHandles.set(nodeId, handles);
    }
    handles.set(handleId, side);
  };

  const rowCenterY = (rect: NodeRect, column: string): number => {
    const index = columnIndexOf(rect.id, column);
    return index === undefined ? rect.height / 2 : columnRowCenterY(index);
  };

  const rebuilt: FlowEdge[] = edges.map((edge) => {
    const sourceColumn = edge.data.sourceColumn;
    const targetColumn = edge.data.targetColumn;
    // Every edge from buildFlowElements is a column-pair edge, so the columns
    // are always present; the guard keeps FlowEdgeData's optional fields honest
    // (such an edge carries no endpoint and is passed through untouched).
    if (sourceColumn === undefined || targetColumn === undefined) {
      return edge;
    }
    const sourceRect = byId.get(edge.source);
    const targetRect = byId.get(edge.target);
    if (sourceRect === undefined || targetRect === undefined) {
      return edge;
    }
    const obstacles = scoreObstacles
      ? nodeRects.filter((rect) => rect.id !== edge.source && rect.id !== edge.target)
      : [];
    const route = routeEdge({
      source: { rect: sourceRect, rowCenterY: rowCenterY(sourceRect, sourceColumn) },
      target: { rect: targetRect, rowCenterY: rowCenterY(targetRect, targetColumn) },
      obstacles,
    });
    const sourceHandle = columnSourceHandle(sourceColumn, route.sourceSide);
    const targetHandle = columnTargetHandle(targetColumn, route.targetSide);
    addHandle(edge.source, sourceHandle, route.sourceSide);
    addHandle(edge.target, targetHandle, route.targetSide);
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      data: { ...edge.data, points: route.points },
    };
  });

  return { edges: rebuilt, nodeHandles };
}

/** Column name -> row index lookup for every node of a graph. */
export function columnRowIndexLookup(graph: DiagramGraph): ColumnRowIndexLookup {
  const byNode = new Map<string, Map<string, number>>(
    graph.nodes.map((node) => [
      node.id,
      new Map(node.columns.map((column, index) => [column.name, index])),
    ]),
  );
  return (nodeId, column) => byNode.get(nodeId)?.get(column);
}

/** Appends `[k]` suffixes until `base` is unique within `used`. */
function uniqueId(used: Set<string>, base: string): string {
  let id = base;
  let k = 0;
  while (used.has(id)) {
    id = `${base}[${k}]`;
    k += 1;
  }
  used.add(id);
  return id;
}
