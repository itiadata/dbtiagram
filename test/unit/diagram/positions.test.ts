import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  OVERLAP_PADDING,
  avoidOverlap,
  mergeFlowNodes,
  rectsOverlap,
} from '../../../src/diagram/positions';
import { NODE_WIDTH } from '../../../src/diagram/layout';

function node(id: string, x: number, y: number, width = NODE_WIDTH, height = 80): Node {
  return { id, position: { x, y }, width, height, data: { label: id } };
}

describe('rectsOverlap', () => {
  it('detects overlapping and well-separated rectangles', () => {
    const a = { x: 0, y: 0, width: 100, height: 80 };
    expect(rectsOverlap(a, { x: 50, y: 40, width: 100, height: 80 })).toBe(true);
    expect(rectsOverlap(a, { x: 120, y: 0, width: 100, height: 80 })).toBe(false);
  });

  it('treats cards within the padding margin as overlapping', () => {
    const a = { x: 0, y: 0, width: 100, height: 80 };
    const close = { x: 100 + OVERLAP_PADDING - 1, y: 0, width: 100, height: 80 };
    expect(rectsOverlap(a, close)).toBe(true);
    const far = { x: 100 + OVERLAP_PADDING + 1, y: 0, width: 100, height: 80 };
    expect(rectsOverlap(a, far)).toBe(false);
  });
});

describe('avoidOverlap', () => {
  it('returns the position unchanged when it is free', () => {
    const occupied = [{ x: 500, y: 0, width: 100, height: 80 }];
    expect(avoidOverlap({ x: 0, y: 0 }, 240, 80, occupied)).toEqual({ x: 0, y: 0 });
  });

  it('nudges the position down below an obstacle', () => {
    const obstacle = { x: 0, y: 0, width: 240, height: 80 };
    const result = avoidOverlap({ x: 0, y: 0 }, 240, 80, [obstacle]);
    expect(result.x).toBe(0);
    expect(result.y).toBeGreaterThan(80);
    const rect = { x: result.x, y: result.y, width: 240, height: 80 };
    expect(rectsOverlap(rect, obstacle)).toBe(false);
  });

  it('steps past a column of obstacles', () => {
    const occupied = [0, 100, 200].map((y) => ({ x: 0, y, width: 240, height: 80 }));
    const result = avoidOverlap({ x: 0, y: 0 }, 240, 80, occupied);
    const rect = { x: result.x, y: result.y, width: 240, height: 80 };
    expect(occupied.some((o) => rectsOverlap(rect, o))).toBe(false);
  });
});

describe('mergeFlowNodes', () => {
  it('keeps the current positions of existing nodes', () => {
    const flow = [node('a', 10, 10), node('b', 200, 200)];
    const current = [node('a', 999, 999)];
    const merged = mergeFlowNodes(flow, current);
    expect(merged[0].position).toEqual({ x: 999, y: 999 });
    expect(merged[1].position).toEqual({ x: 200, y: 200 });
  });

  it('refreshes data, width, and height from the flow node', () => {
    const fresh = { ...node('a', 10, 10, 240, 120), data: { label: 'a', columns: [{ name: 'x' }] } };
    const merged = mergeFlowNodes([fresh], [node('a', 999, 999, 240, 44)]);
    expect(merged[0]).toMatchObject({
      position: { x: 999, y: 999 },
      width: 240,
      height: 120,
      data: { label: 'a', columns: [{ name: 'x' }] },
    });
  });

  it('preserves the selected flag of existing nodes', () => {
    const selected = { ...node('a', 0, 0), selected: true };
    const merged = mergeFlowNodes([node('a', 10, 10)], [selected]);
    expect(merged[0].selected).toBe(true);
  });

  it('places new nodes at their flow position when free', () => {
    const flow = [node('a', 0, 0), node('b', 500, 500)];
    const merged = mergeFlowNodes(flow, [node('a', 0, 0)]);
    expect(merged[1].position).toEqual({ x: 500, y: 500 });
  });

  it('nudges a new node below an existing card instead of overlapping it', () => {
    // 'b' wants the same slot the user has manually placed 'a' in.
    const current = [node('a', 0, 0)];
    const flow = [node('a', 0, 0), node('b', 0, 0)];
    const merged = mergeFlowNodes(flow, current);
    expect(merged[1].position.x).toBe(0);
    expect(merged[1].position.y).toBeGreaterThan(0);
    const b = merged[1];
    const rect = { x: b.position.x, y: b.position.y, width: 240, height: 80 };
    expect(rectsOverlap(rect, { x: 0, y: 0, width: 240, height: 80 })).toBe(false);
  });

  it('drops ids that disappeared from the flow', () => {
    const current = [node('gone', 0, 0), node('kept', 5, 5)];
    const merged = mergeFlowNodes([node('kept', 1, 1)], current);
    expect(merged.map((n) => n.id)).toEqual(['kept']);
  });

  it('handles an empty flow', () => {
    expect(mergeFlowNodes([], [node('a', 0, 0)])).toEqual([]);
  });
});
