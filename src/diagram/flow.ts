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
 * those and nothing else).
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
   * Horizontal center of a node's card — the dynamic-side decision compares
   * the two centers (spec 09 merged, Confirm at Approval (a)).
   */
  const centerX = (id: string): number => {
    const placement = placementOf(id);
    return placement.x + placement.width / 2;
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
    const forward = centerX(edge.target) >= centerX(edge.source);
    const sourceSide: HandleSide = forward ? 'right' : 'left';
    const targetSide: HandleSide = forward ? 'left' : 'right';
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
