import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import {
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  columnRowCenterY,
  layoutDiagram,
  nodeHeight,
} from '../../../src/diagram/layout';
import type { NodePlacement } from '../../../src/diagram/layout';
import type { ModelDefinition } from '../../../src/dbt/types';

function layoutFor(models: ModelDefinition[]) {
  return layoutDiagram(buildDiagram(models));
}

function byId(layout: ReturnType<typeof layoutDiagram>): Map<string, NodePlacement> {
  return new Map(layout.nodes.map((node) => [node.id, node]));
}

function overlaps(a: NodePlacement, b: NodePlacement): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/** Minimal stand-in for the fixture workspace relationships. */
const fixtureModels: ModelDefinition[] = [
  {
    name: 'order_items',
    columns: [{ name: 'order_id' }, { name: 'customer_id' }, { name: 'product_id' }],
    constraints: [
      {
        type: 'foreign_key',
        columns: ['order_id', 'customer_id'],
        to: "ref('orders')",
        toColumns: ['order_id', 'customer_id'],
      },
      {
        type: 'foreign_key',
        columns: ['product_id'],
        to: "ref('products')",
        toColumns: ['product_id'],
      },
    ],
  },
  {
    name: 'orders',
    columns: [{ name: 'order_id' }, { name: 'customer_id' }],
    constraints: [
      {
        type: 'foreign_key',
        columns: ['customer_id'],
        to: "ref('customers')",
        toColumns: ['customer_id'],
      },
    ],
  },
  { name: 'customers', columns: [{ name: 'customer_id' }] },
  { name: 'products', columns: [{ name: 'product_id' }] },
];

describe('layoutDiagram', () => {
  it('computes node dimensions from the column count', () => {
    const layout = layoutFor([
      { name: 'a', columns: [{ name: 'x1' }, { name: 'x2' }, { name: 'x3' }] },
    ]);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({
      id: 'a',
      width: NODE_WIDTH,
      height: nodeHeight(3),
    });
    expect(nodeHeight(0)).toBe(HEADER_HEIGHT);
    expect(nodeHeight(3)).toBe(HEADER_HEIGHT + 3 * ROW_HEIGHT);
  });

  it('centers column rows under the header', () => {
    expect(columnRowCenterY(0)).toBe(HEADER_HEIGHT + ROW_HEIGHT / 2);
    expect(columnRowCenterY(2)).toBe(HEADER_HEIGHT + 2 * ROW_HEIGHT + ROW_HEIGHT / 2);
  });

  it('arranges a chain left to right without overlap', () => {
    const layout = layoutFor([
      {
        name: 'a',
        columns: [{ name: 'x' }],
        constraints: [{ type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] }],
      },
      {
        name: 'b',
        columns: [{ name: 'y' }],
        constraints: [{ type: 'foreign_key', columns: ['y'], to: "ref('c')", toColumns: ['z'] }],
      },
      { name: 'c', columns: [{ name: 'z' }] },
    ]);
    const nodes = byId(layout);
    const a = nodes.get('a');
    const b = nodes.get('b');
    const c = nodes.get('c');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(b!.x).toBeGreaterThan(a!.x + a!.width);
    expect(c!.x).toBeGreaterThan(b!.x + b!.width);
  });

  it('places every model with finite, non-negative coordinates', () => {
    const layout = layoutFor(fixtureModels);
    expect(layout.nodes).toHaveLength(4);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('never overlaps two tables', () => {
    const layout = layoutFor(fixtureModels);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false);
      }
    }
  });

  it('handles an empty graph', () => {
    const layout = layoutFor([]);
    expect(layout.nodes).toEqual([]);
  });
});
