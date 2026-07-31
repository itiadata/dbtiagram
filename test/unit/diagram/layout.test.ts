import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import { layoutDiagram } from '../../../src/diagram/layout';
import type { BundleSegment, EdgeBundle } from '../../../src/diagram/layout';
import type { ModelDefinition } from '../../../src/dbt/types';

function layoutFor(models: ModelDefinition[]) {
  return layoutDiagram(buildDiagram(models));
}

function trunkLine(bundle: EdgeBundle): Extract<BundleSegment, { kind: 'line' }> {
  const line = bundle.segments.find((s): s is Extract<BundleSegment, { kind: 'line' }> => s.kind === 'line');
  if (line === undefined) throw new Error('expected a trunk line segment');
  return line;
}

describe('layoutDiagram', () => {
  it('positions nodes on the grid and computes column row centers', () => {
    const layout = layoutFor([
      { name: 'a', columns: [{ name: 'x1' }, { name: 'x2' }, { name: 'x3' }] },
    ]);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({
      id: 'a',
      x: 60,
      y: 80,
      width: 240,
      height: 108,
      columns: ['x1', 'x2', 'x3'],
    });
    expect(layout.nodes[0].columnY).toEqual([136, 160, 184]);
  });

  it('draws a single-column FK as one direct bezier with no trunk', () => {
    const layout = layoutFor([
      {
        name: 'a',
        columns: [{ name: 'x' }],
        constraints: [{ type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] }],
      },
      { name: 'b', columns: [{ name: 'y' }] },
    ]);

    expect(layout.bundles).toHaveLength(1);
    const bundle = layout.bundles[0];
    expect(bundle.id).toBe('a->b[0]');
    expect(bundle.title).toBe('a.x -> b.y');
    expect(bundle.segments).toHaveLength(1);
    expect(bundle.segments[0]).toMatchObject({ kind: 'bezier' });
    const bezier = bundle.segments[0];
    if (bezier.kind !== 'bezier') throw new Error('expected bezier');
    // Source anchor on the source's right edge, target on the target's left edge.
    expect(bezier.from).toEqual({ x: 300, y: 136 });
    expect(bezier.to).toEqual({ x: 380, y: 136 });
    // Horizontal tangent handles.
    expect(bezier.control1.y).toBe(bezier.from.y);
    expect(bezier.control2.y).toBe(bezier.to.y);
  });

  it('fans a composite FK into one trunk and out to the target columns', () => {
    const layout = layoutFor([
      {
        name: 'a',
        columns: [{ name: 'x1' }, { name: 'x2' }, { name: 'x3' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['x1', 'x3'],
            to: "ref('b')",
            toColumns: ['y1', 'y2'],
          },
        ],
      },
      { name: 'b', columns: [{ name: 'y1' }, { name: 'y2' }] },
    ]);

    const bundle = layout.bundles[0];
    expect(bundle.title).toBe('a.x1, x3 -> b.y1, y2');
    expect(bundle.segments).toHaveLength(5); // 2 fan-in, 1 trunk, 2 fan-out

    const [fanIn1, fanIn2, trunk, fanOut1, fanOut2] = bundle.segments;
    expect(trunk.kind).toBe('line');

    // Fan-in starts on the source's right edge at each source column's row.
    expect(fanIn1.kind).toBe('bezier');
    expect(fanIn2.kind).toBe('bezier');
    if (fanIn1.kind !== 'bezier' || fanIn2.kind !== 'bezier') throw new Error('expected beziers');
    expect(fanIn1.from).toEqual({ x: 300, y: 136 });
    expect(fanIn2.from).toEqual({ x: 300, y: 184 });

    // One horizontal trunk at the mean of the anchor Ys.
    const line = trunk as Extract<BundleSegment, { kind: 'line' }>;
    expect(line.from.y).toBe(154);
    expect(line.to.y).toBe(154);
    expect(line.from.x).toBeCloseTo(300 + 80 / 3, 6);
    expect(line.to.x).toBeCloseTo(380 - 80 / 3, 6);

    // Fan-out ends on the target's left edge.
    if (fanOut1.kind !== 'bezier' || fanOut2.kind !== 'bezier') throw new Error('expected beziers');
    expect(fanOut1.to).toEqual({ x: 380, y: 136 });
    expect(fanOut2.to).toEqual({ x: 380, y: 160 });

    // Horizontal tangent handles on every bezier.
    for (const segment of bundle.segments) {
      if (segment.kind === 'bezier') {
        expect(segment.control1.y).toBe(segment.from.y);
        expect(segment.control2.y).toBe(segment.to.y);
      }
    }
  });

  it('separates the trunks of multiple bundles between the same pair', () => {
    const layout = layoutFor([
      {
        name: 'a',
        columns: [{ name: 'c0' }, { name: 'c1' }, { name: 'c2' }, { name: 'c3' }, { name: 'c4' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['c0', 'c1'],
            to: "ref('b')",
            toColumns: ['d0', 'd1'],
          },
          {
            type: 'foreign_key',
            columns: ['c1', 'c2'],
            to: "ref('b')",
            toColumns: ['d0', 'd2'],
          },
        ],
      },
      { name: 'b', columns: [{ name: 'd0' }, { name: 'd1' }, { name: 'd2' }, { name: 'd3' }] },
    ]);

    expect(layout.bundles).toHaveLength(2);
    expect(layout.bundles.map((b) => b.id)).toEqual(['a->b[0]', 'a->b[1]']);

    const y0 = trunkLine(layout.bundles[0]).from.y;
    const y1 = trunkLine(layout.bundles[1]).from.y;
    expect(Math.abs(y0 - y1)).toBeGreaterThanOrEqual(24);
    // Natural positions (148 and 166) collide, so they spread around the mean.
    expect(Math.min(y0, y1)).toBeCloseTo(145, 6);
    expect(Math.max(y0, y1)).toBeCloseTo(169, 6);
  });

  it('mirrors the attachment when the target sits fully left of the source', () => {
    const layout = layoutFor([
      { name: 'b', columns: [{ name: 'y1' }, { name: 'y2' }] },
      {
        name: 'a',
        columns: [{ name: 'x1' }, { name: 'x2' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['x1', 'x2'],
            to: "ref('b')",
            toColumns: ['y1', 'y2'],
          },
        ],
      },
    ]);

    const bundle = layout.bundles[0];
    expect(bundle.id).toBe('a->b[0]');
    const [fanIn1, fanIn2, trunk, fanOut1, fanOut2] = bundle.segments;
    if (fanIn1.kind !== 'bezier' || fanIn2.kind !== 'bezier') throw new Error('expected beziers');
    // Source is at index 1 (x=380): fan-in anchors on its LEFT edge.
    expect(fanIn1.from.x).toBe(380);
    expect(fanIn2.from.x).toBe(380);
    // Target is at index 0 (right edge x=300): fan-out on its RIGHT edge.
    if (fanOut1.kind !== 'bezier' || fanOut2.kind !== 'bezier') throw new Error('expected beziers');
    expect(fanOut1.to.x).toBe(300);
    expect(fanOut2.to.x).toBe(300);
    // Trunk travels right-to-left.
    expect(trunk.kind).toBe('line');
    expect(trunk.from.x).toBeGreaterThan(trunk.to.x);
  });

  it('renders a column-less FK constraint as a table-level direct curve', () => {
    const layout = layoutFor([
      { name: 'a', constraints: [{ type: 'foreign_key', to: "ref('b')" }] },
      { name: 'b' },
    ]);

    expect(layout.bundles).toHaveLength(1);
    const bundle = layout.bundles[0];
    expect(bundle.title).toBe('a -> b');
    expect(bundle.segments).toHaveLength(1);
    const bezier = bundle.segments[0];
    if (bezier.kind !== 'bezier') throw new Error('expected bezier');
    // Virtual anchors at each node's frame center (y = 80 + 36/2 = 98).
    expect(bezier.from).toEqual({ x: 300, y: 98 });
    expect(bezier.to).toEqual({ x: 380, y: 98 });
  });

  it('handles an empty graph', () => {
    const layout = layoutFor([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.bundles).toEqual([]);
  });
});
