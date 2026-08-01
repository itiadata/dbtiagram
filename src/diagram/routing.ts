/**
 * Pure orthogonal edge routing for FK lines (spec 12).
 * MUST NOT import `vscode`.
 *
 * One scoring function decides everything: for an edge the router enumerates
 * the four side combinations (source left/right x target left/right) and, for
 * each, a bounded set of candidate orthogonal polylines built from a fixed
 * template (stub -> vertical channel -> optional horizontal lane -> stub). Each
 * candidate is scored by `OBSTACLE_PENALTY * crossings + length + BEND_PENALTY
 * * corners`, so any crossing-free route beats any crossing route, and among
 * crossing-free routes the shortest and straightest wins. The winning
 * candidate's side pair IS the edge's side pair — there is no separate
 * "which side" rule any more (spec 12, Confirm at Approval (a)).
 */
import type { NodeRect } from './flow';

export interface Point {
  x: number;
  y: number;
}

/** A handle's attachment side on a node's edge (mirrors `flow.HandleSide`). */
export type RouteSide = 'left' | 'right';

export interface RouteEndpoint {
  rect: NodeRect;
  /** Center Y of the attached column row, relative to the node's top. */
  rowCenterY: number;
}

export interface RouteRequest {
  source: RouteEndpoint;
  target: RouteEndpoint;
  /** Every other card on the canvas; the two endpoints' own rects are excluded by the caller. */
  obstacles: readonly NodeRect[];
}

export interface Route {
  sourceSide: RouteSide;
  targetSide: RouteSide;
  /** Orthogonal polyline from the source anchor to the target anchor. */
  points: Point[];
}

/** Length (px) of the straight stub leaving a card before the route may turn. */
export const STUB_PX = 20;
/** Clearance (px) kept between a routed line and any card it passes. */
export const ROUTE_MARGIN = 16;
/** Cost added per card a candidate route crosses — dominates length and bends. */
export const OBSTACLE_PENALTY = 10000;
/** Cost added per corner, so a straighter route wins among equal-length ones. */
export const BEND_PENALTY = 30;
/**
 * Above this node count the obstacle scoring is skipped (the caller passes no
 * obstacles): the router then degrades to the plain shortest/straightest
 * candidate, which is the old side comparison (spec 12, section 7).
 */
export const ROUTING_NODE_LIMIT = 200;

/** Half-pixel slack so a line that merely grazes a card's margin is not "crossing" it. */
const EPSILON = 0.5;

/** Side combinations, in the deterministic tie-break order (spec 12, section 4). */
const SIDE_COMBINATIONS: readonly { sourceSide: RouteSide; targetSide: RouteSide }[] = [
  { sourceSide: 'right', targetSide: 'left' },
  { sourceSide: 'right', targetSide: 'right' },
  { sourceSide: 'left', targetSide: 'left' },
  { sourceSide: 'left', targetSide: 'right' },
];

/**
 * Routes one FK edge: picks the side pair and the polyline with the lowest
 * score. Deterministic — equal-cost candidates are resolved by the fixed
 * enumeration order, so the picture never flickers between two equal routes.
 */
export function routeEdge(request: RouteRequest): Route {
  const { source, target, obstacles } = request;

  let best: Route | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  // The two endpoint cards are not obstacles for their own stubs (the stub
  // starts on the card's edge), but an interior segment that cuts back through
  // them is just as ugly as one crossing a third card — so they are scored
  // with zero margin and only on interior segments.
  const own: readonly NodeRect[] = [source.rect, target.rect];

  for (const { sourceSide, targetSide } of SIDE_COMBINATIONS) {
    const from = anchor(source, sourceSide);
    const to = anchor(target, targetSide);
    const fromStub = stub(from, sourceSide);
    const toStub = stub(to, targetSide);
    const relevant = relevantObstacles(fromStub, toStub, [...obstacles, ...own]);

    for (const candidate of candidateRoutes(from, fromStub, toStub, to, relevant)) {
      const points = simplify(candidate);
      const score = scoreRoute(points, obstacles, own);
      if (score < bestScore) {
        bestScore = score;
        best = { sourceSide, targetSide, points };
      }
    }
  }

  if (best === undefined) {
    // Unreachable: every side combination yields at least one candidate. Kept
    // so the function is total without a non-null assertion.
    const from = anchor(source, 'right');
    const to = anchor(target, 'left');
    return { sourceSide: 'right', targetSide: 'left', points: [from, to] };
  }
  return best;
}

/** The exact point on a card's edge where a column row's handle sits. */
function anchor(endpoint: RouteEndpoint, side: RouteSide): Point {
  const { rect, rowCenterY } = endpoint;
  return {
    x: side === 'left' ? rect.x : rect.x + rect.width,
    y: rect.y + rowCenterY,
  };
}

/** The straight stub end, `STUB_PX` outward from the card. */
function stub(point: Point, side: RouteSide): Point {
  return { x: side === 'left' ? point.x - STUB_PX : point.x + STUB_PX, y: point.y };
}

/**
 * Candidate polylines for one side combination:
 *
 * - a **vertical channel** at `cx`: stubs, then across at some x;
 * - a **horizontal lane** at `ly`: stubs, then across at some y.
 *
 * Candidate coordinates are the natural midpoint plus each nearby obstacle's
 * margins, so "squeeze through the gap" and "go around above/below" are both
 * in the set.
 */
function candidateRoutes(
  from: Point,
  fromStub: Point,
  toStub: Point,
  to: Point,
  obstacles: readonly NodeRect[],
): Point[][] {
  const channelXs = dedupe([
    (fromStub.x + toStub.x) / 2,
    ...obstacles.flatMap((rect) => [rect.x - ROUTE_MARGIN, rect.x + rect.width + ROUTE_MARGIN]),
  ]);
  const laneYs = dedupe([
    fromStub.y,
    toStub.y,
    (fromStub.y + toStub.y) / 2,
    ...obstacles.flatMap((rect) => [rect.y - ROUTE_MARGIN, rect.y + rect.height + ROUTE_MARGIN]),
  ]);

  const routes: Point[][] = [];
  for (const cx of channelXs) {
    routes.push([from, fromStub, { x: cx, y: fromStub.y }, { x: cx, y: toStub.y }, toStub, to]);
  }
  for (const ly of laneYs) {
    routes.push([from, fromStub, { x: fromStub.x, y: ly }, { x: toStub.x, y: ly }, toStub, to]);
  }
  return routes;
}

/**
 * Obstacles that can plausibly shape the route: those overlapping the two
 * stubs' bounding box inflated by a generous detour allowance. Only candidate
 * GENERATION is narrowed — scoring still tests every obstacle, so a detour
 * that wanders into a distant card is still penalized.
 */
function relevantObstacles(
  fromStub: Point,
  toStub: Point,
  obstacles: readonly NodeRect[],
): NodeRect[] {
  const pad = 4 * ROUTE_MARGIN;
  const minX = Math.min(fromStub.x, toStub.x) - pad;
  const maxX = Math.max(fromStub.x, toStub.x) + pad;
  const minY = Math.min(fromStub.y, toStub.y) - pad;
  const maxY = Math.max(fromStub.y, toStub.y) + pad;
  return obstacles.filter(
    (rect) =>
      rect.x <= maxX &&
      rect.x + rect.width >= minX &&
      rect.y <= maxY &&
      rect.y + rect.height >= minY,
  );
}

/** Sorted, duplicate-free coordinate list (keeps the enumeration bounded and stable). */
function dedupe(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
}

/** Drops repeated and collinear points so bends are counted honestly. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === point.x && last.y === point.y) continue;
    out.push(point);
  }
  const simplified: Point[] = [];
  for (let i = 0; i < out.length; i += 1) {
    const previous = simplified[simplified.length - 1];
    const next = out[i + 1];
    const current = out[i];
    if (previous !== undefined && next !== undefined) {
      const collinear =
        (previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y);
      if (collinear) continue;
    }
    simplified.push(current);
  }
  return simplified;
}

/** `OBSTACLE_PENALTY * crossings + length + BEND_PENALTY * corners` (lower is better). */
function scoreRoute(
  points: readonly Point[],
  obstacles: readonly NodeRect[],
  ownRects: readonly NodeRect[],
): number {
  let length = 0;
  let crossings = 0;
  const lastIndex = points.length - 2;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (const rect of obstacles) {
      if (segmentCrossesRect(a, b, rect, ROUTE_MARGIN)) crossings += 1;
    }
    // The first and last segments are the stubs leaving/entering the endpoint
    // cards; they touch their own card by construction.
    if (i !== 0 && i !== lastIndex) {
      for (const rect of ownRects) {
        if (segmentCrossesRect(a, b, rect, 0)) crossings += 1;
      }
    }
  }
  const corners = Math.max(0, points.length - 2);
  return OBSTACLE_PENALTY * crossings + length + BEND_PENALTY * corners;
}

/** True when the segment overlaps the card inflated by `margin`. */
function segmentCrossesRect(a: Point, b: Point, rect: NodeRect, margin: number): boolean {
  const left = rect.x - margin;
  const right = rect.x + rect.width + margin;
  const top = rect.y - margin;
  const bottom = rect.y + rect.height + margin;
  return (
    Math.min(a.x, b.x) < right - EPSILON &&
    Math.max(a.x, b.x) > left + EPSILON &&
    Math.min(a.y, b.y) < bottom - EPSILON &&
    Math.max(a.y, b.y) > top + EPSILON
  );
}
