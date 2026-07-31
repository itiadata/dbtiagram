/**
 * Pure diagram layout: node dimensions and automatic node arrangement.
 * MUST NOT import `vscode`.
 *
 * Node positions are computed by dagre (@dagrejs/dagre), a pure-JS
 * hierarchical layout library, in left-to-right (LR) rank order so that FK
 * edges run from a source model's right edge to a target model's left edge
 * and connected tables never overlap (spec 03).
 */
import dagre from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import type { DiagramGraph } from './graph';

export interface NodePlacement {
  id: string;
  /** Top-left corner of the node card. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramLayout {
  nodes: NodePlacement[];
}

/** Width of a node card. */
export const NODE_WIDTH = 240;
/** Height of the title header; the first column row starts at this offset. */
export const HEADER_HEIGHT = 44;
/** Height of a single column row. */
export const ROW_HEIGHT = 24;

/** Height of a node card with `columnCount` columns. */
export function nodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT;
}

/** Center Y of column row `i`, relative to the node's top. */
export function columnRowCenterY(i: number): number {
  return HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/** Vertical space between nodes in the same dagre rank. */
const NODE_SEP = 60;
/** Horizontal space between dagre ranks. */
const RANK_SEP = 80;
/** Empty margin around the whole graph. */
const MARGIN = 20;

/** Assigns non-overlapping left-to-right positions to graph nodes via dagre. */
export function layoutDiagram(graph: DiagramGraph): DiagramLayout {
  const dagreGraph = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodes: NodePlacement[] = graph.nodes.map((node) => ({
    id: node.id,
    width: NODE_WIDTH,
    height: nodeHeight(node.columns.length),
    x: 0,
    y: 0,
  }));

  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const edge of graph.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  // dagre reports each node's CENTER; React Flow positions nodes by top-left.
  for (const node of nodes) {
    const pos = dagreGraph.node(node.id);
    if (pos.x === undefined || pos.y === undefined) {
      throw new Error(`layoutDiagram: dagre returned no position for node ${node.id}`);
    }
    node.x = pos.x - node.width / 2;
    node.y = pos.y - node.height / 2;
  }

  return { nodes };
}
