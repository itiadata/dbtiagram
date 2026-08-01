import { describe, expect, it } from 'vitest';
import { buildDiagram } from '../../../src/diagram/graph';
import { layoutDiagram } from '../../../src/diagram/layout';
import {
  EDGE_INTERACTION_WIDTH,
  HANDLE_SHARED_SIDE_OFFSET_PX,
  FK_EDGE_TYPE,
  buildFlowElements,
  columnSourceHandle,
  columnTargetHandle,
  routeEdges,
  sharesSideWithOppositeHandle,
  type HandleSide,
} from '../../../src/diagram/flow';
import type { ModelDefinition } from '../../../src/dbt/types';

function flowFor(models: ModelDefinition[]) {
  const graph = buildDiagram(models);
  const layout = layoutDiagram(graph);
  return { flow: buildFlowElements(graph, layout), layout };
}

/**
 * `routeEdges` with a column lookup that anchors every edge at the card's
 * vertical center (the row index is irrelevant to the side choice these tests
 * assert). Spec 12: sides come out of the router, not a center comparison.
 */
function routeEdgesFor(
  edges: Parameters<typeof routeEdges>[0],
  nodeRects: Parameters<typeof routeEdges>[1],
) {
  return routeEdges(edges, nodeRects, () => undefined);
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
      sourceHandle: columnSourceHandle('x1', 'right'),
      targetHandle: columnTargetHandle('y1', 'left'),
      type: FK_EDGE_TYPE,
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
      sourceHandle: columnSourceHandle('x2', 'right'),
      targetHandle: columnTargetHandle('y2', 'left'),
      interactionWidth: EDGE_INTERACTION_WIDTH,
      data: { title: 'a.x2 -> b.y2' },
    });
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

  it('dedupes identical FKs at the graph layer', () => {
    const { flow } = flowFor([
      {
        name: 'a',
        constraints: [
          { type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] },
          { type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] },
        ],
      },
      { name: 'b', columns: [{ name: 'y' }] },
    ]);

    expect(flow.edges).toHaveLength(1);
  });

  it('carries the interaction width on every edge', () => {
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
          {
            type: 'foreign_key',
            columns: ['x2'],
            to: "ref('c')",
            toColumns: ['z1'],
          },
        ],
      },
      { name: 'b', columns: [{ name: 'y1' }] },
      { name: 'c', columns: [{ name: 'z1' }] },
    ]);

    expect(flow.edges.length).toBeGreaterThan(0);
    for (const edge of flow.edges) {
      expect(edge.interactionWidth).toBe(EDGE_INTERACTION_WIDTH);
    }
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

describe('used handle dots (spec 09 merged)', () => {
  it('emits no edges and no handles for an FK with no column pairs', () => {
    const { flow } = flowFor([
      { name: 'a', constraints: [{ type: 'foreign_key', to: "ref('b')" }] },
      { name: 'b' },
    ]);
    expect(flow.edges).toEqual([]);
    expect(flow.nodes[0].data.handles).toBeUndefined();
    expect(flow.nodes[1].data.handles).toBeUndefined();
  });

  it('records only a target handle for a column that is only an FK target', () => {
    const { flow } = flowFor([
      {
        name: 'staging_orders',
        columns: [{ name: 'order_id' }],
        constraints: [
          { type: 'foreign_key', columns: ['order_id'], to: "ref('orders')", toColumns: ['order_id'] },
        ],
      },
      { name: 'orders', columns: [{ name: 'order_id' }, { name: 'total_amount' }] },
    ]);
    const orders = flow.nodes.find((n) => n.id === 'orders')!;
    // orders.order_id is the target; total_amount participates in no FK.
    expect(orders.data.handles).toEqual({
      [columnTargetHandle('order_id', 'left')]: 'left',
    });
    expect(orders.data.handles![columnTargetHandle('total_amount', 'left')]).toBeUndefined();
    expect(orders.data.handles![columnTargetHandle('total_amount', 'right')]).toBeUndefined();
  });

  it('records only a source handle for a column that is only an FK source', () => {
    const { flow } = flowFor([
      {
        name: 'orders',
        columns: [{ name: 'customer_id' }, { name: 'total_amount' }],
        constraints: [
          { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['customer_id'] },
        ],
      },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
    ]);
    const orders = flow.nodes.find((n) => n.id === 'orders')!;
    expect(orders.data.handles).toEqual({
      [columnSourceHandle('customer_id', 'right')]: 'right',
    });
    expect(orders.data.handles![columnTargetHandle('customer_id', 'left')]).toBeUndefined();
  });

  it('leaves an FK-unrelated column out of both handle lists', () => {
    const { flow } = flowFor([
      {
        name: 'orders',
        columns: [{ name: 'customer_id' }, { name: 'total_amount' }],
        constraints: [
          { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['customer_id'] },
        ],
      },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
    ]);
    const orders = flow.nodes.find((n) => n.id === 'orders')!;
    expect(orders.data.handles![columnSourceHandle('total_amount', 'left')]).toBeUndefined();
    expect(orders.data.handles![columnSourceHandle('total_amount', 'right')]).toBeUndefined();
    expect(orders.data.handles![columnTargetHandle('total_amount', 'left')]).toBeUndefined();
    expect(orders.data.handles![columnTargetHandle('total_amount', 'right')]).toBeUndefined();
  });

  it('records both a source and a target handle when a column is both', () => {
    // Two models referencing each other on the same column name (self-refs are
    // dropped by the graph, so the two-model form is the both-ways case).
    const { flow } = flowFor([
      {
        name: 'a',
        columns: [{ name: 'c' }],
        constraints: [{ type: 'foreign_key', columns: ['c'], to: "ref('b')", toColumns: ['c'] }],
      },
      {
        name: 'b',
        columns: [{ name: 'c' }],
        constraints: [{ type: 'foreign_key', columns: ['c'], to: "ref('a')", toColumns: ['c'] }],
      },
    ]);
    const a = flow.nodes.find((n) => n.id === 'a')!;
    const b = flow.nodes.find((n) => n.id === 'b')!;
    const keys = (handles: typeof a.data.handles): string[] => Object.keys(handles ?? {});
    // dagre places a left of b, so a's two edges attach on its right side and
    // b's on its left: each node has exactly one source and one target handle.
    expect(keys(a.data.handles).sort()).toEqual(
      [columnSourceHandle('c', 'right'), columnTargetHandle('c', 'right')].sort(),
    );
    expect(keys(b.data.handles).sort()).toEqual(
      [columnSourceHandle('c', 'left'), columnTargetHandle('c', 'left')].sort(),
    );
  });

  it('omits the handles field for a node with no edges', () => {
    const { flow } = flowFor([{ name: 'orphan', columns: [{ name: 'id' }] }]);
    expect(flow.nodes[0].data.handles).toBeUndefined();
  });

  it('dedupes handle ids when multiple edges share a column', () => {
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
    const a = flow.nodes.find((n) => n.id === 'a')!;
    expect(flow.edges).toHaveLength(3);
    expect(Object.keys(a.data.handles ?? {})).toEqual([
      columnSourceHandle('x1', 'right'),
      columnSourceHandle('x2', 'right'),
    ]);
  });

  it('chooses the sides dynamically: a back-edge attaches source-left/target-right', () => {
    // dagre ranks a before b in the cycle, so the b->a edge runs against the
    // layout direction (target left of source) and must flip sides.
    const { flow } = flowFor([
      {
        name: 'a',
        columns: [{ name: 'c' }],
        constraints: [{ type: 'foreign_key', columns: ['c'], to: "ref('b')", toColumns: ['c'] }],
      },
      {
        name: 'b',
        columns: [{ name: 'c' }],
        constraints: [{ type: 'foreign_key', columns: ['c'], to: "ref('a')", toColumns: ['c'] }],
      },
    ]);
    const forward = flow.edges.find((edge) => edge.source === 'a');
    const back = flow.edges.find((edge) => edge.source === 'b');
    expect(forward?.sourceHandle).toBe(columnSourceHandle('c', 'right'));
    expect(forward?.targetHandle).toBe(columnTargetHandle('c', 'left'));
    expect(back?.sourceHandle).toBe(columnSourceHandle('c', 'left'));
    expect(back?.targetHandle).toBe(columnTargetHandle('c', 'right'));
  });

  it('every emitted handle id matches the side recorded in the node handles', () => {
    const { flow } = flowFor([
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
          { type: 'foreign_key', columns: ['customer_id'], to: "ref('customers')", toColumns: ['customer_id'] },
        ],
      },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
      { name: 'products', columns: [{ name: 'product_id' }] },
    ]);

    for (const edge of flow.edges) {
      const byNode = new Map<string, Record<string, HandleSide>>(
        flow.nodes.map((node) => [node.id, node.data.handles ?? {}]),
      );
      expect(byNode.get(edge.source)?.[edge.sourceHandle ?? '']).toBeDefined();
      expect(byNode.get(edge.target)?.[edge.targetHandle ?? '']).toBeDefined();
    }
  });
});

describe('routeEdges (live drag geometry, spec 12)', () => {
  /** A flow with one FK a.x -> b.y (dagre lays a left of b initially). */
  const pairFlow = () =>
    flowFor([
      {
        name: 'a',
        columns: [{ name: 'x' }],
        constraints: [{ type: 'foreign_key', columns: ['x'], to: "ref('b')", toColumns: ['y'] }],
      },
      { name: 'b', columns: [{ name: 'y' }] },
    ]).flow;

  /** Two 240px-wide cards at the given left edges (heights are irrelevant to the side choice). */
  const rects = (aX: number, bX: number) => [
    { id: 'a', x: aX, y: 0, width: 240, height: 68 },
    { id: 'b', x: bX, y: 0, width: 240, height: 68 },
  ];

  it('keeps forward sides when the target stays at/right of the source', () => {
    const flow = pairFlow();
    const { edges: rebuilt, nodeHandles } = routeEdgesFor(flow.edges, rects(0, 400));
    expect(rebuilt[0]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: columnSourceHandle('x', 'right'),
      targetHandle: columnTargetHandle('y', 'left'),
    });
    expect(Object.fromEntries(nodeHandles.get('a')!)).toEqual({
      [columnSourceHandle('x', 'right')]: 'right',
    });
    expect(Object.fromEntries(nodeHandles.get('b')!)).toEqual({
      [columnTargetHandle('y', 'left')]: 'left',
    });
  });

  it('flips both endpoints and the dots when the target is dragged left of the source', () => {
    const flow = pairFlow();
    const { edges: rebuilt, nodeHandles } = routeEdgesFor(flow.edges, rects(400, 0));
    expect(rebuilt[0]).toMatchObject({
      sourceHandle: columnSourceHandle('x', 'left'),
      targetHandle: columnTargetHandle('y', 'right'),
    });
    expect(Object.fromEntries(nodeHandles.get('a')!)).toEqual({
      [columnSourceHandle('x', 'left')]: 'left',
    });
    expect(Object.fromEntries(nodeHandles.get('b')!)).toEqual({
      [columnTargetHandle('y', 'right')]: 'right',
    });
  });

  it('preserves edge ids, data payloads, and edge type across recomputation', () => {
    const flow = pairFlow();
    const { edges: rebuilt } = routeEdgesFor(flow.edges, rects(400, 0));
    expect(rebuilt[0].id).toBe(flow.edges[0].id);
    // The hover/tooltip payload survives; only the routed path is re-derived.
    const { points: _rebuiltPoints, ...rebuiltData } = rebuilt[0].data;
    const { points: _originalPoints, ...originalData } = flow.edges[0].data;
    expect(rebuiltData).toEqual(originalData);
    expect(rebuilt[0].data.points?.length).toBeGreaterThanOrEqual(2);
    expect(rebuilt[0].type).toBe(FK_EDGE_TYPE);
    expect(rebuilt[0].interactionWidth).toBe(EDGE_INTERACTION_WIDTH);
  });

  it('flips every pair of a multi-pair FK together and dedupes per column', () => {
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
    const { edges: rebuilt, nodeHandles } = routeEdgesFor(flow.edges, rects(400, 0));
    expect(rebuilt).toHaveLength(3);
    for (const edge of rebuilt) {
      expect(edge.sourceHandle).toBe(columnSourceHandle(edge.data.sourceColumn!, 'left'));
      expect(edge.targetHandle).toBe(columnTargetHandle(edge.data.targetColumn!, 'right'));
    }
    // Two edges share a.x1: the live map still holds one handle id per column.
    expect(Object.keys(Object.fromEntries(nodeHandles.get('a')!))).toEqual([
      columnSourceHandle('x1', 'left'),
      columnSourceHandle('x2', 'left'),
    ]);
  });

  it('omits nodes with no edges from the live handle map', () => {
    const { flow } = flowFor([{ name: 'orphan', columns: [{ name: 'id' }] }]);
    const { edges: rebuilt, nodeHandles } = routeEdgesFor(flow.edges, [
      { id: 'orphan', x: 0, y: 0, width: 240, height: 68 },
    ]);
    expect(rebuilt).toEqual([]);
    expect(nodeHandles.size).toBe(0);
  });

  it('falls back to the existing sides when an endpoint rect is missing (mount/rename gap)', () => {
    const flow = pairFlow();
    // Before React Flow has adopted any nodes (first render) or after a rename
    // (new edge endpoints, old rects) some endpoints are missing from the
    // rects; the edges must pass through untouched, never crash.
    const { edges: rebuilt, nodeHandles } = routeEdgesFor(flow.edges, []);
    expect(rebuilt).toEqual(flow.edges);
    expect(nodeHandles.size).toBe(0);

    // One endpoint missing is handled the same way.
    const { edges: partiallyRebuilt, nodeHandles: partialHandles } = routeEdgesFor(
      flow.edges,
      rects(0, 400).slice(0, 1),
    );
    expect(partiallyRebuilt).toEqual(flow.edges);
    expect(partialHandles.size).toBe(0);
  });
});

describe('sharesSideWithOppositeHandle (shared-side dot separation, spec 09 Manual Verify iteration)', () => {
  // products.product_id is both an FK target (from order_items) and an FK
  // source (to customers): after dragging products past both counterparts the
  // two edges must share the same side of the same column.
  const sharedHandles = () =>
    Object.fromEntries(
      routeEdgesFor(
        flowFor([
          {
            name: 'order_items',
            columns: [{ name: 'product_id' }],
            constraints: [
              {
                type: 'foreign_key',
                columns: ['product_id'],
                to: "ref('products')",
                toColumns: ['product_id'],
              },
            ],
          },
          {
            name: 'products',
            columns: [{ name: 'product_id' }],
            config: {
              meta: {
                dbtiagram: {
                  virtual: {
                    foreign_keys: [
                      { to: "ref('customers')", columns: ['product_id'], to_columns: ['customer_id'] },
                    ],
                  },
                },
              },
            },
          },
          { name: 'customers', columns: [{ name: 'customer_id' }] },
        ]).flow.edges,
        // Both counterparts left of products -> both FKs attach to products'
        // LEFT side: incoming target + outgoing source on product_id.
        [
          { id: 'order_items', x: 0, y: 0, width: 240, height: 68 },
          { id: 'customers', x: 200, y: 0, width: 240, height: 68 },
          { id: 'products', x: 600, y: 0, width: 240, height: 68 },
        ],
      ).nodeHandles.get('products')!,
    );

  it('reports true for both handle types when the column shares a side', () => {
    const handles = sharedHandles();
    expect(sharesSideWithOppositeHandle(handles, 'product_id', 'target', 'left')).toBe(true);
    expect(sharesSideWithOppositeHandle(handles, 'product_id', 'source', 'left')).toBe(true);
  });

  it('reports false for the opposite side, which only the source uses', () => {
    const handles = sharedHandles();
    // products emits LEFT (to customers) and receives LEFT (from order_items);
    // nothing uses the right side, so neither type reports a shared side there.
    expect(sharesSideWithOppositeHandle(handles, 'product_id', 'target', 'right')).toBe(false);
    expect(sharesSideWithOppositeHandle(handles, 'product_id', 'source', 'right')).toBe(false);
  });

  it('reports false for a column used only one way on a side', () => {
    const handles: Record<string, HandleSide> = {
      [columnTargetHandle('order_id', 'left')]: 'left',
    };
    expect(sharesSideWithOppositeHandle(handles, 'order_id', 'target', 'left')).toBe(false);
    expect(sharesSideWithOppositeHandle(handles, 'order_id', 'source', 'left')).toBe(false);
  });

  it('reports false when the two handle types sit on opposite sides', () => {
    const handles: Record<string, HandleSide> = {
      [columnTargetHandle('c', 'left')]: 'left',
      [columnSourceHandle('c', 'right')]: 'right',
    };
    expect(sharesSideWithOppositeHandle(handles, 'c', 'target', 'left')).toBe(false);
    expect(sharesSideWithOppositeHandle(handles, 'c', 'source', 'right')).toBe(false);
  });

  it('exposes a 5px offset that keeps two 8px dots apart inside a 24px row', () => {
    expect(HANDLE_SHARED_SIDE_OFFSET_PX).toBe(5);
    const dotSpan = 8;
    const gap = 2 * HANDLE_SHARED_SIDE_OFFSET_PX - dotSpan;
    expect(gap).toBe(2); // 2px of clear space between the two dots
  });
});
