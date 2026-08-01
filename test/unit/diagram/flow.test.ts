import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import { layoutDiagram } from '../../../src/diagram/layout';
import {
  EDGE_INTERACTION_WIDTH,
  TABLE_SOURCE_HANDLE,
  TABLE_TARGET_HANDLE,
  buildFlowElements,
  columnSourceHandle,
  columnTargetHandle,
} from '../../../src/diagram/flow';
import type { ModelDefinition } from '../../../src/dbt/types';

function flowFor(models: ModelDefinition[]) {
  const graph = buildDiagram(models);
  const layout = layoutDiagram(graph);
  return { flow: buildFlowElements(graph, layout), layout };
}

describe('buildFlowElements', () => {
  it('maps every model to a table node positioned by the layout', () => {
    const { flow, layout } = flowFor([
      { name: 'a', columns: [{ name: 'x1' }, { name: 'x2' }] },
      { name: 'b', columns: [{ name: 'y1' }], description: 'the b table' },
    ]);

    expect(flow.nodes).toHaveLength(2);
    for (const node of flow.nodes) {
      const placement = layout.nodes.find((n) => n.id === node.id);
      expect(placement).toBeDefined();
      expect(node.position).toEqual({ x: placement!.x, y: placement!.y });
      expect(node.width).toBe(placement!.width);
      expect(node.height).toBe(placement!.height);
      expect(node.type).toBe('table');
    }

    expect(flow.nodes[1].data).toMatchObject({ label: 'b', description: 'the b table' });
    expect(flow.nodes[1].data.columns).toEqual([{ name: 'y1' }]);
  });

  it('draws one edge per column pair for an equal-length FK', () => {
    const { flow } = flowFor([
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
      { name: 'b', columns: [{ name: 'y1' }, { name: 'y2' }] },
    ]);

    expect(flow.edges).toHaveLength(2);
    expect(flow.edges[0]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: columnSourceHandle('x1'),
      targetHandle: columnTargetHandle('y1'),
      type: 'smoothstep',
      interactionWidth: EDGE_INTERACTION_WIDTH,
      data: {
        sourceColumn: 'x1',
        targetColumn: 'y1',
        title: 'a.x1 -> b.y1',
      },
    });
    expect(flow.edges[1]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: columnSourceHandle('x2'),
      targetHandle: columnTargetHandle('y2'),
      interactionWidth: EDGE_INTERACTION_WIDTH,
      data: { title: 'a.x2 -> b.y2' },
    });
  });

  it('draws a single table-level edge for an FK with no columns', () => {
    const { flow } = flowFor([
      { name: 'a', constraints: [{ type: 'foreign_key', to: "ref('b')" }] },
      { name: 'b' },
    ]);

    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: TABLE_SOURCE_HANDLE,
      targetHandle: TABLE_TARGET_HANDLE,
      type: 'smoothstep',
      interactionWidth: EDGE_INTERACTION_WIDTH,
      data: { title: 'a -> b' },
    });
    expect(flow.edges[0].data.sourceColumn).toBeUndefined();
    expect(flow.edges[0].data.targetColumn).toBeUndefined();
  });

  it('draws a single table-level edge when column arrays have different lengths', () => {
    const { flow } = flowFor([
      {
        name: 'a',
        columns: [{ name: 'x1' }, { name: 'x2' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['x1', 'x2'],
            to: "ref('b')",
            toColumns: ['y1'],
          },
        ],
      },
      { name: 'b', columns: [{ name: 'y1' }] },
    ]);

    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0].sourceHandle).toBe(TABLE_SOURCE_HANDLE);
    expect(flow.edges[0].targetHandle).toBe(TABLE_TARGET_HANDLE);
  });

  it('keeps edge ids unique even when FKs share column pairs', () => {
    const { flow } = flowFor([
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
          {
            type: 'foreign_key',
            columns: ['x1'],
            to: "ref('b')",
            toColumns: ['y1'],
          },
        ],
      },
      { name: 'b', columns: [{ name: 'y1' }, { name: 'y2' }] },
    ]);

    const ids = flow.edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['a.x1->b.y1', 'a.x2->b.y2', 'a.x1->b.y1[0]']);
  });

  it('dedupes identical table-level FKs at the graph layer', () => {
    const { flow } = flowFor([
      {
        name: 'a',
        constraints: [
          { type: 'foreign_key', to: "ref('b')" },
          { type: 'foreign_key', to: "ref('b')" },
        ],
      },
      { name: 'b' },
    ]);

    expect(flow.edges).toHaveLength(1);
  });

  it('carries the interaction width on every column-level and table-level edge', () => {
    const { flow } = flowFor([
      {
        name: 'a',
        columns: [{ name: 'x1' }, { name: 'x2' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['x1'],
            to: "ref('b')",
            toColumns: ['y1'],
          },
          { type: 'foreign_key', to: "ref('c')" },
        ],
      },
      { name: 'b', columns: [{ name: 'y1' }] },
      { name: 'c' },
    ]);

    expect(flow.edges.length).toBeGreaterThan(0);
    const columnLevel = flow.edges.find((edge) => edge.data.sourceColumn !== undefined);
    const tableLevel = flow.edges.find((edge) => edge.data.sourceColumn === undefined);
    expect(columnLevel).toBeDefined();
    expect(tableLevel).toBeDefined();
    expect(columnLevel!.interactionWidth).toBe(EDGE_INTERACTION_WIDTH);
    expect(tableLevel!.interactionWidth).toBe(EDGE_INTERACTION_WIDTH);
    expect(EDGE_INTERACTION_WIDTH).toBe(24);
  });

  it('handles an empty graph', () => {
    const { flow } = flowFor([]);
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });

  it('copies primaryKey from the graph node onto the flow node data', () => {
    const { flow } = flowFor([
      {
        name: 'products',
        columns: [{ name: 'product_id' }],
        config: {
          meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
        },
      },
    ]);
    expect(flow.nodes[0].data.primaryKey).toEqual({ columns: ['product_id'], virtual: true });
  });

  it('omits primaryKey from flow data when the graph node has none', () => {
    const { flow } = flowFor([{ name: 'products', columns: [{ name: 'product_id' }] }]);
    expect(flow.nodes[0].data.primaryKey).toBeUndefined();
  });

  it('marks virtual edges in the edge data', () => {
    const { flow } = flowFor([
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
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0].data.virtual).toBe(true);
  });

  it('leaves real edges without the virtual flag', () => {
    const { flow } = flowFor([
      {
        name: 'products',
        columns: [{ name: 'product_id' }],
        constraints: [
          { type: 'foreign_key', columns: ['product_id'], to: "ref('customers')", toColumns: ['customer_id'] },
        ],
      },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
    ]);
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0].data.virtual).toBeUndefined();
  });
});
