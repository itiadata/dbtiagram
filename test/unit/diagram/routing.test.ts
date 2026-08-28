import { describe, expect, it } from 'vitest';
import {
  ROUTE_MARGIN,
  ROUTING_NODE_LIMIT,
  chooseSide,
  routeEdge,
  type Point,
  type RouteRequest,
} from '../../../src/diagram/routing';
import type { NodeRect } from '../../../src/diagram/flow';

const CARD_WIDTH = 240;
const CARD_HEIGHT = 100;

function card(id: string, x: number, y: number, height = CARD_HEIGHT): NodeRect {
  return { id, x, y, width: CARD_WIDTH, height };
}

/** Routes an edge attached to each card's vertical middle. */
function route(source: NodeRect, target: NodeRect, obstacles: NodeRect[] = []) {
  const request: RouteRequest = {
    source: { rect: source, rowCenterY: source.height / 2 },
    target: { rect: target, rowCenterY: target.height / 2 },
    obstacles,
  };
  return routeEdge(request);
}

/** True when any segment of the polyline overlaps the card inflated by the routing margin. */
function crossesCard(points: readonly Point[], rect: NodeRect, margin = ROUTE_MARGIN): boolean {
  const left = rect.x - margin;
  const right = rect.x + rect.width + margin;
  const top = rect.y - margin;
  const bottom = rect.y + rect.height + margin;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (
      Math.min(a.x, b.x) < right - 0.5 &&
      Math.max(a.x, b.x) > left + 0.5 &&
      Math.min(a.y, b.y) < bottom - 0.5 &&
      Math.max(a.y, b.y) > top + 0.5
    ) {
      return true;
    }
  }
  return false;
}

describe('routeEdge (spec 12)', () => {
  it('takes the direct path between horizontally separated cards', () => {
    const a = card('a', 0, 0);
    const b = card('b', 500, 0);
    const result = route(a, b);
    expect(result.sourceSide).toBe('right');
    expect(result.targetSide).toBe('left');
    // Same row center on both cards: a single straight segment, no bends.
    expect(result.points).toEqual([
      { x: CARD_WIDTH, y: 50 },
      { x: 500, y: 50 },
    ]);
  });

  it('flips both endpoints when the target sits left of the source', () => {
    const a = card('a', 500, 0);
    const b = card('b', 0, 0);
    const result = route(a, b);
    expect(result.sourceSide).toBe('left');
    expect(result.targetSide).toBe('right');
  });

  it('starts at the source anchor and ends at the target anchor', () => {
    const a = card('a', 0, 0);
    const b = card('b', 500, 200);
    const result = route(a, b);
    expect(result.points[0]).toEqual({ x: CARD_WIDTH, y: 50 });
    expect(result.points[result.points.length - 1]).toEqual({ x: 500, y: 250 });
  });

  it('produces an orthogonal polyline (every segment is axis-aligned)', () => {
    const result = route(card('a', 0, 0), card('b', 600, 300), [card('o', 300, 100)]);
    for (let i = 0; i + 1 < result.points.length; i += 1) {
      const a = result.points[i];
      const b = result.points[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('attaches both endpoints on the same side for vertically stacked cards', () => {
    // Identical x, one directly below the other: the old center comparison
    // could only answer right/left, which cuts straight through both cards.
    const a = card('a', 0, 0);
    const b = card('b', 0, 400);
    const result = route(a, b);
    expect(result.sourceSide).toBe(result.targetSide);
    expect(crossesCard(result.points, a, 0)).toBe(false);
    expect(crossesCard(result.points, b, 0)).toBe(false);
  });

  it('routes around a card sitting directly between the two endpoints', () => {
    const a = card('a', 0, 0);
    const b = card('b', 800, 0);
    const obstacle = card('o', 380, -20, 140);
    const result = route(a, b, [obstacle]);
    expect(crossesCard(result.points, obstacle)).toBe(false);
  });

  it('squeezes through the gap between two stacked obstacles', () => {
    const a = card('a', 0, 0);
    const b = card('b', 900, 0);
    const above = card('o1', 400, -400, 340);
    const below = card('o2', 400, 120, 340);
    const result = route(a, b, [above, below]);
    expect(crossesCard(result.points, above)).toBe(false);
    expect(crossesCard(result.points, below)).toBe(false);
  });

  it('goes around a wall of obstacles rather than through it', () => {
    const a = card('a', 0, 0);
    const b = card('b', 900, 0);
    const wall = [
      card('w1', 400, -300, 250),
      card('w2', 400, 0, 250),
      card('w3', 400, 300, 250),
    ];
    const result = route(a, b, wall);
    for (const rect of wall) {
      expect(crossesCard(result.points, rect)).toBe(false);
    }
  });

  it('still draws a line when no crossing-free route exists', () => {
    const a = card('a', 0, 0);
    const b = card('b', 40, 10);
    // A third card covering everything: every path crosses it.
    const blanket = { id: 'o', x: -2000, y: -2000, width: 4000, height: 4000 };
    const result = route(a, b, [blanket]);
    expect(result.points.length).toBeGreaterThanOrEqual(2);
    expect([0, CARD_WIDTH]).toContain(result.points[0].x);
  });

  it('is deterministic for identical inputs', () => {
    const a = card('a', 0, 0);
    const b = card('b', 700, 250);
    const obstacles = [card('o1', 300, 0), card('o2', 300, 300)];
    const first = route(a, b, obstacles);
    const second = route(a, b, obstacles);
    expect(second).toEqual(first);
  });

  it('honours the attached column row rather than the card center', () => {
    const a = card('a', 0, 0);
    const b = card('b', 500, 0);
    const result = routeEdge({
      source: { rect: a, rowCenterY: 56 },
      target: { rect: b, rowCenterY: 80 },
      obstacles: [],
    });
    expect(result.points[0]).toEqual({ x: CARD_WIDTH, y: 56 });
    expect(result.points[result.points.length - 1]).toEqual({ x: 500, y: 80 });
  });

  it('never routes an interior segment back through its own endpoint cards', () => {
    const a = card('a', 0, 0, 300);
    const b = card('b', 300, 0, 300);
    const result = route(a, b);
    const interior = result.points.slice(1, -1);
    if (interior.length >= 2) {
      expect(crossesCard([result.points[1], ...interior.slice(1)], a, 0)).toBe(false);
    }
  });

  it('degrades above the node limit by taking no obstacles (caller contract)', () => {
    // The limit itself is enforced by the caller (`routeEdges`); the router is
    // simply obstacle-free then, i.e. the plain shortest/straightest route.
    expect(ROUTING_NODE_LIMIT).toBe(200);
    const result = route(card('a', 0, 0), card('b', 800, 0), []);
    expect(result.points).toHaveLength(2);
  });
});

describe('chooseSide (spec 26)', () => {
  it('picks left when the point is left of center', () => {
    expect(chooseSide(100, 40)).toBe('left');
  });

  it('picks right when the point is right of center', () => {
    expect(chooseSide(100, 160)).toBe('right');
  });

  it('ties go right', () => {
    expect(chooseSide(100, 100)).toBe('right');
  });
});
