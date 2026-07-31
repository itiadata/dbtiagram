/**
 * Pure mapping from the diagram graph + layout onto React Flow elements.
 * MUST NOT import `vscode`.
 *
 * Produces the nodes/edges arrays that the webview passes straight to
 * `<ReactFlow>`. Each model becomes a custom `table` node with per-column
 * Handles; each FK constraint becomes either one `smoothstep` edge per column
 * pair (equal, non-empty column arrays) or a single table-level edge (spec 03).
 */
import type { Edge, Node } from '@xyflow/react';
import type { DiagramGraph, TableNodeColumn } from './graph';
import type { DiagramLayout } from './layout';

/** Row data rendered by the custom `table` node. */
export type FlowNodeData = {
  label: string;
  description?: string;
  columns: TableNodeColumn[];
  /** Column names on this model that should render highlighted. */
  highlightedColumns?: string[];
};

/** Node descriptor for a custom `table` node. */
export type FlowNode = Node<FlowNodeData, 'table'>;

/** Edge payload used by the webview's hover highlighting and tooltip. */
export type FlowEdgeData = {
  sourceColumn?: string;
  targetColumn?: string;
  /** Human-readable FK description, e.g. 'order_items.order_id -> orders.order_id'. */
  title: string;
};

/** An edge that is guaranteed to carry its `FlowEdgeData` payload. */
export type FlowEdge = Edge<FlowEdgeData> & { data: FlowEdgeData };

export interface FlowElements {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Handle id for an outgoing edge on the right edge of a column row. */
export function columnSourceHandle(column: string): string {
  return `${column}:source`;
}

/** Handle id for an incoming edge on the left edge of a column row. */
export function columnTargetHandle(column: string): string {
  return `${column}:target`;
}

/** Handle id for outgoing table-level edges (right edge, vertical center). */
export const TABLE_SOURCE_HANDLE = 'table:source';
/** Handle id for incoming table-level edges (left edge, vertical center). */
export const TABLE_TARGET_HANDLE = 'table:target';

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

  const nodes: FlowNode[] = graph.nodes.map((node) => {
    const placement = byId.get(node.id);
    if (placement === undefined) {
      throw new Error(`buildFlowElements: no layout placement for node ${node.id}`);
    }
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
      },
    };
  });

  const usedIds = new Set<string>();
  const tableEdgeCounts = new Map<string, number>();
  const edges: FlowEdge[] = graph.edges.flatMap((edge) => {
    if (edge.sourceColumns.length > 0 && edge.sourceColumns.length === edge.targetColumns.length) {
      return edge.sourceColumns.map((sourceColumn, index) => {
        const targetColumn = edge.targetColumns[index];
        return {
          id: uniqueId(usedIds, `${edge.source}.${sourceColumn}->${edge.target}.${targetColumn}`),
          source: edge.source,
          target: edge.target,
          sourceHandle: columnSourceHandle(sourceColumn),
          targetHandle: columnTargetHandle(targetColumn),
          type: 'smoothstep',
          interactionWidth: EDGE_INTERACTION_WIDTH,
          data: {
            sourceColumn,
            targetColumn,
            title: `${edge.source}.${sourceColumn} -> ${edge.target}.${targetColumn}`,
          },
        };
      });
    }

    const pair = `${edge.source}\u0000${edge.target}`;
    const k = tableEdgeCounts.get(pair) ?? 0;
    tableEdgeCounts.set(pair, k + 1);
    return [
      {
        id: uniqueId(usedIds, `${edge.source}->${edge.target}[${k}]`),
        source: edge.source,
        target: edge.target,
        sourceHandle: TABLE_SOURCE_HANDLE,
        targetHandle: TABLE_TARGET_HANDLE,
        type: 'smoothstep',
        interactionWidth: EDGE_INTERACTION_WIDTH,
        data: { title: `${edge.source} -> ${edge.target}` },
      },
    ];
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
