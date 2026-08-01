/**
 * Pure mapping from the diagram graph + layout onto React Flow elements.
 * MUST NOT import `vscode`.
 *
 * Produces the nodes/edges arrays that the webview passes straight to
 * `<ReactFlow>`. Each model becomes a custom `table` node with per-column
 * Handles; each FK constraint becomes one `smoothstep` edge per column pair
 * (spec 09 merged: equal, non-empty column arrays only — table-level edges
 * are gone). Every edge's endpoint sides are chosen dynamically from the
 * node positions so the path is simplest, and each node's `data.handles`
 * records exactly which handles its edges use (the webview mounts a dot for
 * those and nothing else). `buildFlowElements` seeds this geometry from the
 * initial layout; `recomputeEdgeSides` re-derives it from the CURRENT node
 * positions so the webview can keep the sides and dots live while a card is
 * dragged (spec 09 Manual Verify iteration).
 */
import type { Edge, Node } from '@xyflow/react';
import type { DiagramGraph, TableNodeColumn } from './graph';
import type { DiagramLayout, NodePlacement } from './layout';

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

/** Edge payload used by the webview's hover highlighting and tooltip. */
export type FlowEdgeData = {
  sourceColumn?: string;
  targetColumn?: string;
  /** Human-readable FK description, e.g. 'order_items.order_id -> orders.order_id'. */
  title: string;
  /** True for virtual (meta-stored) FKs — drawn dashed (spec 08). */
  virtual?: boolean;
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

export interface EdgeSideChoice {
  /** Side the source column emits from. */
  sourceSide: HandleSide;
  /** Side the target column receives on. */
  targetSide: HandleSide;
}

/**
 * The one dynamic-side decision (spec 09 merged, Confirm at Approval (a)):
 * when the target's horizontal center is at or right of the source's, the
 * source emits from its right edge and the target receives on its left;
 * otherwise (target left of source — a back-edge) both flip. This is the
 * simplest horizontal arrangement for any pair of nodes and is used by both
 * `buildFlowElements` (initial layout) and `recomputeEdgeSides` (live drags)
 * so the two can never drift apart.
 */
export function chooseEdgeSides(
  rectOf: (id: string) => NodeRect,
  source: string,
  target: string,
): EdgeSideChoice {
  const sourceRect = rectOf(source);
  const targetRect = rectOf(target);
  const forward = targetRect.x + targetRect.width / 2 >= sourceRect.x + sourceRect.width / 2;
  return {
    sourceSide: forward ? 'right' : 'left',
    targetSide: forward ? 'left' : 'right',
  };
}

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

  /**
   * Rect accessor for the initial layout — the same shape `recomputeEdgeSides`
   * takes from the webview's live node state, so both share `chooseEdgeSides`.
   */
  const rectOf = (id: string): NodeRect => {
    const placement = placementOf(id);
    return { id, x: placement.x, y: placement.y, width: placement.width, height: placement.height };
  };

  const usedIds = new Set<string>();
  const edges: FlowEdge[] = [];

  // Per node: handle id -> side, collected while building the edges so the
  // mounted handle set is always exactly the set the edges reference.
  const nodeHandles = new Map<string, Map<string, HandleSide>>();
  const addHandle = (nodeId: string, handleId: string, side: HandleSide): void => {
    let handles = nodeHandles.get(nodeId);
    if (handles === undefined) {
      handles = new Map();
      nodeHandles.set(nodeId, handles);
    }
    handles.set(handleId, side);
  };

  // Only column-pair edges exist (spec 09 merged): graph edges with empty or
  // unequal-length arrays never reach this layer.
  for (const edge of graph.edges) {
    const { sourceSide, targetSide } = chooseEdgeSides(rectOf, edge.source, edge.target);
    edge.sourceColumns.forEach((sourceColumn, index) => {
      const targetColumn = edge.targetColumns[index];
      const sourceHandle = columnSourceHandle(sourceColumn, sourceSide);
      const targetHandle = columnTargetHandle(targetColumn, targetSide);
      addHandle(edge.source, sourceHandle, sourceSide);
      addHandle(edge.target, targetHandle, targetSide);
      edges.push({
        id: uniqueId(usedIds, `${edge.source}.${sourceColumn}->${edge.target}.${targetColumn}`),
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
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

export interface RebuiltEdgeGeometry {
  /** The input edges with `sourceHandle`/`targetHandle` updated to the sides the current positions demand. */
  edges: FlowEdge[];
  /** Per node: the handle ids its edges use (id -> side), derived from the same pass. */
  nodeHandles: Map<string, Map<string, HandleSide>>;
}

/**
 * Live-drag companion to `buildFlowElements` (spec 09 Manual Verify iteration):
 * re-derives every edge's endpoint sides and the per-node `handles` map from
 * the CURRENT node rects (React Flow's live node state) instead of the initial
 * layout. Edge ids and `data` (the hover/tooltip payloads) are preserved, so
 * hover highlighting and edge double-click keep working while the sides and
 * the handle dots follow the drag.
 *
 * An endpoint that is missing from `nodeRects` — a transient one-render gap
 * while React Flow adopts a new node list (mount, rename) — leaves that edge
 * untouched (its current sides stand in) instead of crashing; the next render
 * recomputes from the complete rect set.
 */
export function recomputeEdgeSides(
  edges: readonly FlowEdge[],
  nodeRects: readonly NodeRect[],
): RebuiltEdgeGeometry {
  const byId = new Map(nodeRects.map((rect) => [rect.id, rect]));
  const rectOf = (id: string): NodeRect => {
    const rect = byId.get(id);
    if (rect === undefined) {
      throw new Error(`recomputeEdgeSides: no rect for node ${id}`);
    }
    return rect;
  };

  const nodeHandles = new Map<string, Map<string, HandleSide>>();
  const addHandle = (nodeId: string, handleId: string, side: HandleSide): void => {
    let handles = nodeHandles.get(nodeId);
    if (handles === undefined) {
      handles = new Map();
      nodeHandles.set(nodeId, handles);
    }
    handles.set(handleId, side);
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
    if (byId.get(edge.source) === undefined || byId.get(edge.target) === undefined) {
      return edge;
    }
    const { sourceSide, targetSide } = chooseEdgeSides(rectOf, edge.source, edge.target);
    const sourceHandle = columnSourceHandle(sourceColumn, sourceSide);
    const targetHandle = columnTargetHandle(targetColumn, targetSide);
    addHandle(edge.source, sourceHandle, sourceSide);
    addHandle(edge.target, targetHandle, targetSide);
    return { ...edge, sourceHandle, targetHandle };
  });

  return { edges: rebuilt, nodeHandles };
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
