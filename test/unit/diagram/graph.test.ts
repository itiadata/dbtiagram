import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import type { ModelDefinition } from '../../../src/dbt/types';

const models: ModelDefinition[] = [
  {
    name: 'orders',
    description: 'One row per order',
    refs: ['customers'],
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

  it('draws an edge for each ref whose target exists', () => {
    const graph = buildDiagram(models);
    expect(graph.edges).toEqual([{ source: 'orders', target: 'customers' }]);
  });

  it('drops refs to unknown models and self-refs', () => {
    const graph = buildDiagram([
      ...models,
      { name: 'ghost', refs: ['nonexistent', 'ghost'] },
    ]);
    expect(graph.edges).toEqual([{ source: 'orders', target: 'customers' }]);
  });

  it('handles an empty model set', () => {
    const graph = buildDiagram([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
