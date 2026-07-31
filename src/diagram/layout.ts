/**
 * Pure diagram layout: node positions and FK edge-bundle geometry.
 * MUST NOT import `vscode`.
 *
 * Routing convention (spec 02, section 5): source columns attach to the
 * source node's right edge and target columns to the target node's left edge,
 * mirrored when the target sits fully to the left of the source. Multi-column
 * bundles fan in from each source anchor to a single trunk point, travel as
 * one horizontal trunk, then fan out to the target anchors. Two-anchor
 * bundles draw one direct bezier with no trunk.
 */
import type { DiagramGraph, RelationEdge } from './graph';

export interface Point {
  x: number;
  y: number;
}

export type BundleSegment =
  | { kind: 'bezier'; from: Point; control1: Point; control2: Point; to: Point }
  | { kind: 'line'; from: Point; to: Point };

export interface EdgeBundle {
  /** `${source}->${target}[${k}]`, k = index among bundles for that pair. */
  id: string;
  source: string;
  target: string;
  sourceColumns: string[];
  targetColumns: string[];
  /** Accessible tooltip, e.g. 'orders.customer_id -> customers.customer_id'. */
  title: string;
  /** Fan-in beziers, then the trunk line, then fan-out beziers. */
  segments: BundleSegment[];
}

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Column names in display order. */
  columns: string[];
  /** Center Y of each column row; parallel to `columns`. */
  columnY: number[];
}

export interface DiagramLayout {
  nodes: NodeLayout[];
  bundles: EdgeBundle[];
}

/** Width of a node card. */
export const NODE_WIDTH = 240;
/** Height of a single column row. */
export const ROW_HEIGHT = 24;
/** Y offset from the node top to the first column row. */
export const ROW_TOP = 44;
/** Frame height of a node with no columns. */
export const FRAME_NO_COLUMNS = 36;

const NODE_X_STEP = 320;
const NODE_Y_STEP = 240;
const GRID_X = 60;
const GRID_Y = 80;
const MIN_HANDLE = 24;
const MIN_TRUNK_SPACING = ROW_HEIGHT;

/** Assigns grid positions to graph nodes and computes bundle geometry. */
export function layoutDiagram(graph: DiagramGraph): DiagramLayout {
  const nodes: NodeLayout[] = graph.nodes.map((node, index) => {
    const x = GRID_X + (index % 4) * NODE_X_STEP;
    const y = GRID_Y + Math.floor(index / 4) * NODE_Y_STEP;
    const columnY = node.columns.map((_, i) => y + ROW_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2);
    return {
      id: node.id,
      x,
      y,
      width: NODE_WIDTH,
      height: FRAME_NO_COLUMNS + node.columns.length * ROW_HEIGHT,
      columns: node.columns.map((c) => c.name),
      columnY,
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const edges = graph.edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source === undefined || target === undefined) {
      throw new Error(`layoutDiagram: edge references unknown node ${edge.source} -> ${edge.target}`);
    }
    return { edge, source, target };
  });

  const pairCounts = new Map<string, number>();
  const bundles = edges.map(({ edge, source, target }) => {
    const k = pairCounts.get(pairKey(edge)) ?? 0;
    pairCounts.set(pairKey(edge), k + 1);

    const orientation = resolveOrientation(source, target);
    const sourceAnchors = columnPoints(source, edge.sourceColumns, orientation.sourceSide);
    const targetAnchors = columnPoints(target, edge.targetColumns, orientation.targetSide);
    const anchors = [...sourceAnchors, ...targetAnchors];

    const bundle: EdgeBundle = {
      id: `${edge.source}->${edge.target}[${k}]`,
      source: edge.source,
      target: edge.target,
      sourceColumns: edge.sourceColumns,
      targetColumns: edge.targetColumns,
      title: bundleTitle(edge),
      segments: [],
    };

    return {
      bundle,
      orientation,
      sourceAnchors,
      targetAnchors,
      naturalTrunkY: anchors.length > 2 ? meanY(anchors) : null,
    };
  });

  // Separate the trunks of bundles sharing the same ordered pair (source,
  // target) so they never overlap.
  const byPair = new Map<string, { bundle: EdgeBundle; trunkY: number }[]>();
  for (const item of bundles) {
    if (item.naturalTrunkY === null) continue;
    const key = `${item.bundle.source}\u0000${item.bundle.target}`;
    const list = byPair.get(key) ?? [];
    list.push({ bundle: item.bundle, trunkY: item.naturalTrunkY });
    byPair.set(key, list);
  }
  const trunkYById = new Map<string, number>();
  for (const list of byPair.values()) {
    const ys = separateTrunkYs(list.map((item) => item.trunkY));
    list.forEach((item, i) => trunkYById.set(item.bundle.id, ys[i]));
  }

  for (const item of bundles) {
    const anchorCount = item.sourceAnchors.length + item.targetAnchors.length;
    if (anchorCount === 2) {
      item.bundle.segments = directBezier(
        item.sourceAnchors[0],
        item.targetAnchors[0],
        item.orientation.gap,
      );
    } else {
      const trunkY =
        trunkYById.get(item.bundle.id) ??
        meanY([...item.sourceAnchors, ...item.targetAnchors]);
      item.bundle.segments = trunkSegments(
        item.sourceAnchors,
        item.targetAnchors,
        trunkY,
        item.orientation.gap,
      );
    }
  }

  return { nodes, bundles: bundles.map((item) => item.bundle) };
}

/** The facing sides of the source/target nodes given their relative position. */
function resolveOrientation(
  source: NodeLayout,
  target: NodeLayout,
): { sourceSide: 'left' | 'right'; targetSide: 'left' | 'right'; gap: number } {
  const gap = target.x - (source.x + source.width);
  if (gap > 0) {
    // Normal: source is to the left of the target.
    return { sourceSide: 'right', targetSide: 'left', gap };
  }
  // Mirrored: target sits fully to the left of the source.
  const mirroredGap = source.x - (target.x + target.width);
  return { sourceSide: 'left', targetSide: 'right', gap: mirroredGap };
}

/** Anchor points for one side of an edge on the node's facing edge. */
function columnPoints(
  node: NodeLayout,
  columnNames: string[],
  side: 'left' | 'right',
): Point[] {
  const x = side === 'right' ? node.x + node.width : node.x;

  if (columnNames.length === 0) {
    // Virtual anchor at the midpoint of the node's column block (frame center
    // when the node has no columns).
    return [{ x, y: columnBlockMidY(node) }];
  }

  return columnNames.map((name) => {
    const index = node.columns.indexOf(name);
    return { x, y: index >= 0 ? node.columnY[index] : columnBlockMidY(node) };
  });
}

function columnBlockMidY(node: NodeLayout): number {
  if (node.columnY.length === 0) return node.y + node.height / 2;
  return (node.columnY[0] + node.columnY[node.columnY.length - 1]) / 2;
}

function meanY(points: Point[]): number {
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

/** A single direct cubic bezier between the two anchors (2-anchor bundles). */
function directBezier(from: Point, to: Point, gap: number): BundleSegment[] {
  const d = Math.max(MIN_HANDLE, Math.abs(gap) / 6);
  const sign = Math.sign(to.x - from.x) || 1;
  return [
    {
      kind: 'bezier',
      from,
      control1: { x: from.x + sign * d, y: from.y },
      control2: { x: to.x - sign * d, y: to.y },
      to,
    },
  ];
}

/** Fan-in beziers, one horizontal trunk, fan-out beziers. */
function trunkSegments(
  sourceAnchors: Point[],
  targetAnchors: Point[],
  trunkY: number,
  gap: number,
): BundleSegment[] {
  const d = Math.max(MIN_HANDLE, Math.abs(gap) / 6);

  // Each trunk point sits one third of the gap in from its own node's edge.
  const sourceAnchorX = sourceAnchors[0].x;
  const targetAnchorX = targetAnchors[0].x;
  const direction = sourceAnchorX < targetAnchorX ? 1 : -1;
  const sourceTrunk = { x: sourceAnchorX + direction * (gap / 3), y: trunkY };
  const targetTrunk = { x: targetAnchorX - direction * (gap / 3), y: trunkY };

  const segments: BundleSegment[] = [];

  for (const anchor of sourceAnchors) {
    const sign = Math.sign(sourceTrunk.x - anchor.x) || 1;
    segments.push({
      kind: 'bezier',
      from: anchor,
      control1: { x: anchor.x + sign * d, y: anchor.y },
      control2: { x: sourceTrunk.x - sign * d, y: trunkY },
      to: sourceTrunk,
    });
  }

  segments.push({ kind: 'line', from: sourceTrunk, to: targetTrunk });

  for (const anchor of targetAnchors) {
    const sign = Math.sign(anchor.x - targetTrunk.x) || 1;
    segments.push({
      kind: 'bezier',
      from: targetTrunk,
      control1: { x: targetTrunk.x + sign * d, y: trunkY },
      control2: { x: anchor.x - sign * d, y: anchor.y },
      to: anchor,
    });
  }

  return segments;
}

/**
 * Ensures trunks of bundles between the same pair stay at least
 * `MIN_TRUNK_SPACING` apart, spreading them symmetrically around the group
 * mean only when the natural positions collide.
 */
function separateTrunkYs(naturalYs: number[]): number[] {
  const sorted = [...naturalYs].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;
  const mean = sorted.reduce((sum, y) => sum + y, 0) / sorted.length;
  const neededSpan = (sorted.length - 1) * MIN_TRUNK_SPACING;
  if (sorted[sorted.length - 1] - sorted[0] > neededSpan) return sorted;
  const start = mean - neededSpan / 2;
  return sorted.map((_, i) => start + i * MIN_TRUNK_SPACING);
}

function pairKey(edge: RelationEdge): string {
  return `${edge.source}\u0000${edge.target}`;
}

function bundleTitle(edge: RelationEdge): string {
  if (edge.sourceColumns.length === 0) return `${edge.source} -> ${edge.target}`;
  return `${edge.source}.${edge.sourceColumns.join(', ')} -> ${edge.target}.${edge.targetColumns.join(', ')}`;
}
