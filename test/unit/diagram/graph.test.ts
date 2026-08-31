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
        virtual: false,
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
        virtual: false,
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
        virtual: false,
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
      { source: 'a', target: 'b', sourceColumns: ['x'], targetColumns: ['y'], virtual: false },
    ]);
  });

  it('handles an empty model set', () => {
    const graph = buildDiagram([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  describe('primaryKey', () => {
    it('is undefined when the model declares no PK', () => {
      const graph = buildDiagram([{ name: 'products', columns: [{ name: 'id' }] }]);
      expect(graph.nodes[0].primaryKey).toBeUndefined();
    });

    it('reads a real primary_key constraint', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'order_id' }],
          constraints: [{ type: 'primary_key', columns: ['order_id'] }],
        },
      ]);
      expect(graph.nodes[0].primaryKey).toEqual({
        columns: ['order_id'],
        virtual: false,
        uniqueTest: false,
      });
    });

    it('reads a virtual PK from the meta block (no real constraint)', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
        },
      ]);
      expect(graph.nodes[0].primaryKey).toEqual({
        columns: ['product_id'],
        virtual: true,
        uniqueTest: false,
      });
    });

    it('prefers the virtual (diagram-written) PK when both exist (c)', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
        },
      ]);
      expect(graph.nodes[0].primaryKey).toEqual({
        columns: ['product_id'],
        virtual: true,
        uniqueTest: false,
      });
    });

    it('reports uniqueTest true when the test exists', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'id' }],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
        },
      ]);
      expect(graph.nodes[0].primaryKey).toEqual({ columns: ['id'], virtual: false, uniqueTest: true });
    });

    it('reports uniqueTest false when the test is absent', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'id' }],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ]);
      expect(graph.nodes[0].primaryKey).toEqual({ columns: ['id'], virtual: false, uniqueTest: false });
    });

    it('reports uniqueTest false for a virtual PK', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['id'] } } } },
          },
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
        },
      ]);
      expect(graph.nodes[0].primaryKey?.uniqueTest).toBe(false);
    });
  });

  describe('foreignKeys', () => {
    it('lists real FK descriptors in constraint order with parsed targets', () => {
      const graph = buildDiagram([
        {
          name: 'order_items',
          constraints: [
            { type: 'foreign_key', columns: ['a'], to: "ref('orders')", toColumns: ['x'] },
            { type: 'foreign_key', columns: ['b'], to: "ref('s_pp', 'customers')", toColumns: ['y'] },
          ],
        },
        { name: 'orders' },
        { name: 'customers' },
      ]);
      expect(graph.nodes[0].foreignKeys).toEqual([
        { target: 'orders', to: "ref('orders')", columns: ['a'], toColumns: ['x'], virtual: false },
        { target: 'customers', to: "ref('s_pp', 'customers')", columns: ['b'], toColumns: ['y'], virtual: false },
      ]);
    });

    it('keeps unparseable to and self-references with no target and no edge', () => {
      const graph = buildDiagram([
        {
          name: 'ghost',
          constraints: [
            { type: 'foreign_key', columns: ['a'], to: 'not a ref', toColumns: ['b'] },
            { type: 'foreign_key', columns: ['a'], to: "ref('ghost')", toColumns: ['a'] },
          ],
        },
      ]);
      expect(graph.nodes[0].foreignKeys).toEqual([
        { target: undefined, to: 'not a ref', columns: ['a'], toColumns: ['b'], virtual: false },
        { target: 'ghost', to: "ref('ghost')", columns: ['a'], toColumns: ['a'], virtual: false },
      ]);
      expect(graph.edges).toEqual([]);
    });

    it('appends virtual FK descriptors after the real ones', () => {
      const graph = buildDiagram([
        {
          name: 'order_items',
          constraints: [
            { type: 'foreign_key', columns: ['a'], to: "ref('orders')", toColumns: ['x'] },
          ],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('customers')", columns: ['b'], to_columns: ['y'] }],
                },
              },
            },
          },
        },
        { name: 'orders' },
        { name: 'customers' },
      ]);
      expect(graph.nodes[0].foreignKeys).toEqual([
        { target: 'orders', to: "ref('orders')", columns: ['a'], toColumns: ['x'], virtual: false },
        { target: 'customers', to: "ref('customers')", columns: ['b'], toColumns: ['y'], virtual: true },
      ]);
    });
  });

  describe('column-pair FK edges (spec 09 merged)', () => {
    it('draws no edge for a real FK with empty column arrays, but keeps its descriptor', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          constraints: [{ type: 'foreign_key', columns: [], to: "ref('customers')", toColumns: [] }],
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
      ]);
      expect(graph.edges).toEqual([]);
      expect(graph.nodes[0].foreignKeys).toEqual([
        { target: 'customers', to: "ref('customers')", columns: [], toColumns: [], virtual: false },
      ]);
    });

    it('draws no edge for a virtual FK with empty column arrays, but keeps its descriptor', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('customers')", columns: [], to_columns: [] }],
                },
              },
            },
          },
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
      ]);
      expect(graph.edges).toEqual([]);
      expect(graph.nodes[0].foreignKeys).toEqual([
        { target: 'customers', to: "ref('customers')", columns: [], toColumns: [], virtual: true },
      ]);
    });

    it('draws no edge when the FK arrays exist but have different lengths', () => {
      const graph = buildDiagram([
        {
          name: 'a',
          constraints: [
            { type: 'foreign_key', columns: ['x1', 'x2'], to: "ref('b')", toColumns: ['y1'] },
          ],
        },
        { name: 'b', columns: [{ name: 'y1' }] },
      ]);
      expect(graph.edges).toEqual([]);
    });

    it('draws no edge when one array is missing entirely', () => {
      const graph = buildDiagram([
        {
          name: 'a',
          constraints: [{ type: 'foreign_key', columns: ['x1'], to: "ref('b')" }],
        },
        { name: 'b', columns: [{ name: 'y1' }] },
      ]);
      expect(graph.edges).toEqual([]);
    });

    it('still draws an edge for a single column pair', () => {
      const graph = buildDiagram([
        {
          name: 'a',
          constraints: [{ type: 'foreign_key', columns: ['x1'], to: "ref('b')", toColumns: ['y1'] }],
        },
        { name: 'b', columns: [{ name: 'y1' }] },
      ]);
      expect(graph.edges).toEqual([
        { source: 'a', target: 'b', sourceColumns: ['x1'], targetColumns: ['y1'], virtual: false },
      ]);
    });

    it('still emits a relation edge when the FK names a missing column (spec 20)', () => {
      const graph = buildDiagram([
        {
          name: 'order_items',
          columns: [{ name: 'id' }],
          constraints: [
            { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['id'] },
          ],
        },
        { name: 'customers', columns: [{ name: 'id' }] },
      ]);
      expect(graph.edges).toEqual([
        { source: 'order_items', target: 'customers', sourceColumns: ['customer_id'], targetColumns: ['id'], virtual: false },
      ]);
    });
  });

  describe('virtual FK edges', () => {
    it('draws a dashed (virtual) edge from a meta-block FK', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('customers')", columns: ['product_id'], to_columns: ['customer_id'] }],
                },
              },
            },
          },
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
      ]);
      expect(graph.edges).toEqual([
        {
          source: 'products',
          target: 'customers',
          sourceColumns: ['product_id'],
          targetColumns: ['customer_id'],
          virtual: true,
        },
      ]);
    });

    it('drops virtual edges with unknown targets or self-refs', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [
                    { to: "ref('ghost')", columns: ['a'], to_columns: ['b'] },
                    { to: "ref('products')", columns: ['a'], to_columns: ['a'] },
                  ],
                },
              },
            },
          },
        },
      ]);
      expect(graph.edges).toEqual([]);
    });

    it('keeps the real edge when a real and a virtual FK describe the same mapping', () => {
      const graph = buildDiagram([
        {
          name: 'products',
          constraints: [
            { type: 'foreign_key', columns: ['product_id'], to: "ref('customers')", toColumns: ['customer_id'] },
          ],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('customers')", columns: ['product_id'], to_columns: ['customer_id'] }],
                },
              },
            },
          },
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
      ]);
      expect(graph.edges).toEqual([
        {
          source: 'products',
          target: 'customers',
          sourceColumns: ['product_id'],
          targetColumns: ['customer_id'],
          virtual: false,
        },
      ]);
    });
  });

  describe('foreignKeyColumns (spec 24)', () => {
    it('includes own FK columns and incoming target columns', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'id' }, { name: 'customer_id' }],
          constraints: [
            { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['id'] },
          ],
        },
        { name: 'customers', columns: [{ name: 'id' }] },
      ]);
      const orders = graph.nodes.find((n) => n.id === 'orders')!;
      const customers = graph.nodes.find((n) => n.id === 'customers')!;
      expect(orders.foreignKeyColumns).toEqual(['customer_id']);
      expect(customers.foreignKeyColumns).toEqual(['id']);
    });

    it('is empty when a table has no FKs and is not an FK target', () => {
      const graph = buildDiagram([{ name: 'orphan', columns: [{ name: 'id' }] }]);
      expect(graph.nodes[0].foreignKeyColumns).toEqual([]);
    });

    it('collapses duplicates when a column is both a PK/FK target and a declared FK column', () => {
      const graph = buildDiagram([
        {
          name: 'a',
          columns: [{ name: 'b_id' }],
          constraints: [
            { type: 'foreign_key', columns: ['b_id'], to: "ref('b')", toColumns: ['id'] },
            { type: 'foreign_key', columns: ['b_id'], to: "ref('c')", toColumns: ['id'] },
          ],
        },
        { name: 'b', columns: [{ name: 'id' }] },
        { name: 'c', columns: [{ name: 'id' }] },
      ]);
      const a = graph.nodes.find((n) => n.id === 'a')!;
      expect(a.foreignKeyColumns).toEqual(['b_id']);
    });
  });

  describe('column tests (spec 30)', () => {
    it('carries column test names into the node', () => {
      const graph = buildDiagram([
        {
          name: 'users',
          columns: [{ name: 'email', dataTests: ['unique'] }],
        },
      ]);
      const node = graph.nodes.find((n) => n.id === 'users')!;
      const email = node.columns.find((c) => c.name === 'email')!;
      expect(email.tests).toEqual(['unique']);
    });

    it('omits tests when a column has none', () => {
      const graph = buildDiagram([
        {
          name: 'users',
          columns: [{ name: 'amount' }],
        },
      ]);
      const node = graph.nodes.find((n) => n.id === 'users')!;
      const amount = node.columns.find((c) => c.name === 'amount')!;
      expect(amount.tests).toBeUndefined();
    });

    it('excludes the PK-owned not_null from the node', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'order_id', dataTests: ['not_null'] }],
          constraints: [{ type: 'primary_key', columns: ['order_id'] }],
        },
      ]);
      const node = graph.nodes.find((n) => n.id === 'orders')!;
      const order_id = node.columns.find((c) => c.name === 'order_id')!;
      expect(order_id.tests).toBeUndefined();
    });

    it('keeps extra tests on a PK column beyond not_null', () => {
      const graph = buildDiagram([
        {
          name: 'orders',
          columns: [{ name: 'order_id', dataTests: ['not_null', 'unique'] }],
          constraints: [{ type: 'primary_key', columns: ['order_id'] }],
        },
      ]);
      const node = graph.nodes.find((n) => n.id === 'orders')!;
      const order_id = node.columns.find((c) => c.name === 'order_id')!;
      expect(order_id.tests).toEqual(['unique']);
    });
  });
});
