import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import type { ModelDefinition } from '../../../src/dbt/types';

const models: ModelDefinition[] = [
  {
    name: 'orders',
    description: 'One row per order',
    constraints: [
      { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['id'] },
    ],
    columns: [
      { name: 'id', dataType: 'integer', description: 'Primary key' },
      { name: 'customer_id', dataType: 'integer' },
    ],
  },
  { name: 'customers', columns: [{ name: 'id', dataType: 'integer' }] },
  { name: 'orphan', columns: [] },
];

describe('buildDiagram', () => {
  it('creates one node per model with columns', () => {
    const graph = buildDiagram(models);

    expect(graph.nodes).toHaveLength(3);
    const orders = graph.nodes.find((n) => n.id === 'orders');
    expect(orders?.description).toBe('One row per order');
    expect(orders?.columns).toEqual([
      { name: 'id', dataType: 'integer', description: 'Primary key' },
      { name: 'customer_id', dataType: 'integer' },
    ]);
  });

  it('draws an FK edge for each foreign_key constraint whose target exists', () => {
    const graph = buildDiagram(models);
    expect(graph.edges).toEqual([
      {
        source: 'orders',
        target: 'customers',
        sourceColumns: ['customer_id'],
        targetColumns: ['id'],
      },
    ]);
  });

  it('supports composite FK constraints with multiple columns', () => {
    const graph = buildDiagram([
      {
        name: 'order_items',
        constraints: [
          {
            type: 'foreign_key',
            columns: ['order_id', 'customer_id'],
            to: "ref('orders')",
            toColumns: ['order_id', 'customer_id'],
          },
        ],
      },
      { name: 'orders' },
    ]);
    expect(graph.edges).toEqual([
      {
        source: 'order_items',
        target: 'orders',
        sourceColumns: ['order_id', 'customer_id'],
        targetColumns: ['order_id', 'customer_id'],
      },
    ]);
  });

  it('drops constraints with unknown targets, unparseable to, and self-refs', () => {
    const graph = buildDiagram([
      ...models,
      {
        name: 'ghost',
        constraints: [
          { type: 'foreign_key', columns: ['a'], to: "ref('nonexistent')", toColumns: ['b'] },
          { type: 'foreign_key', columns: ['a'], to: 'not a ref', toColumns: ['b'] },
          { type: 'foreign_key', columns: ['a'], to: "ref('ghost')", toColumns: ['a'] },
          { type: 'primary_key', columns: ['a'] },
        ],
      },
    ]);
    expect(graph.edges).toEqual([
      {
        source: 'orders',
        target: 'customers',
        sourceColumns: ['customer_id'],
        targetColumns: ['id'],
      },
    ]);
  });

  it('treats a missing to value as unparseable and drops the edge', () => {
    const graph = buildDiagram([
      { name: 'a', constraints: [{ type: 'foreign_key', columns: ['x'] }] },
      { name: 'b' },
    ]);
    expect(graph.edges).toEqual([]);
  });

  it('ignores legacy refs entries completely', () => {
    const graph = buildDiagram([
      { name: 'a', extra: { refs: ['b'] } },
      { name: 'b' },
    ]);
    expect(graph.edges).toEqual([]);
  });

  it('dedupes identical edges', () => {
    const graph = buildDiagram([
      {
        name: 'a',
        constraints: [
          { type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] },
          { type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] },
        ],
      },
      { name: 'b' },
    ]);
    expect(graph.edges).toEqual([
      { source: 'a', target: 'b', sourceColumns: ['x'], targetColumns: ['y'] },
    ]);
  });

  it('handles an empty model set', () => {
    const graph = buildDiagram([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
