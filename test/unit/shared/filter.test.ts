import { describe, expect, it } from 'vitest';
import type { DiagramGraph } from '../../../src/diagram/graph';
import {
  computeVisibleModels,
  filterGraph,
  matchesSearch,
  reconcileSelection,
} from '../../../src/shared/filter';
import type { DiagramModelFile } from '../../../src/shared/protocol';

const files: DiagramModelFile[] = [
  { uri: 'C:/repo/models/orders.yml', label: 'orders.yml', models: ['orders', 'order_items'] },
  { uri: 'C:/repo/models/products.yml', label: 'products.yml', models: ['products'] },
];

const allFileUris = new Set(files.map((file) => file.uri));
const allModelNames = new Set(['orders', 'order_items', 'products']);

describe('matchesSearch', () => {
  it('matches everything for an empty or whitespace query', () => {
    expect(matchesSearch('anything', '')).toBe(true);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });

  it('matches substrings case-insensitively', () => {
    expect(matchesSearch('Orders.yml', 'orders')).toBe(true);
    expect(matchesSearch('Orders.yml', 'ORDERS')).toBe(true);
    expect(matchesSearch('order_items.yml', 'item')).toBe(true);
    expect(matchesSearch('products.yml', 'order')).toBe(false);
  });
});

describe('reconcileSelection', () => {
  it('selects everything on the first reconciliation', () => {
    const result = reconcileSelection([], ['a', 'b'], new Set());
    expect([...result].sort()).toEqual(['a', 'b']);
  });

  it('keeps the users unchecked choices on later updates', () => {
    const result = reconcileSelection(['a', 'b'], ['a', 'b'], new Set(['b']));
    expect([...result]).toEqual(['b']);
  });

  it('adds brand-new items as checked', () => {
    const result = reconcileSelection(['a', 'b'], ['a', 'b', 'c'], new Set(['a']));
    expect([...result].sort()).toEqual(['a', 'c']);
  });

  it('drops items that left the universe', () => {
    const result = reconcileSelection(['a', 'b'], ['a'], new Set(['a', 'b']));
    expect([...result]).toEqual(['a']);
  });
});

describe('computeVisibleModels', () => {
  it('shows every model when everything is selected', () => {
    const visible = computeVisibleModels(files, allFileUris, allModelNames);
    expect([...visible].sort()).toEqual(['order_items', 'orders', 'products']);
  });

  it('hides all models of an unchecked file', () => {
    const visible = computeVisibleModels(
      files,
      new Set(['C:/repo/models/orders.yml']),
      allModelNames,
    );
    expect([...visible].sort()).toEqual(['order_items', 'orders']);
  });

  it('hides a selected model when its file is unchecked (file precedence)', () => {
    const visible = computeVisibleModels(
      files,
      new Set(['C:/repo/models/products.yml']),
      allModelNames,
    );
    expect([...visible]).toEqual(['products']);
  });

  it('narrows within checked files via the model selection', () => {
    const visible = computeVisibleModels(files, allFileUris, new Set(['order_items']));
    expect([...visible]).toEqual(['order_items']);
  });

  it('shows nothing when no file is checked', () => {
    const visible = computeVisibleModels(files, new Set(), allModelNames);
    expect(visible.size).toBe(0);
  });
});

describe('filterGraph', () => {
  const graph: DiagramGraph = {
    nodes: [
      { id: 'orders', label: 'orders', columns: [] },
      { id: 'products', label: 'products', columns: [] },
    ],
    edges: [
      {
        source: 'orders',
        target: 'products',
        sourceColumns: ['order_id'],
        targetColumns: ['id'],
      },
    ],
  };

  it('keeps nodes whose id is visible', () => {
    const filtered = filterGraph(graph, new Set(['orders']));
    expect(filtered.nodes.map((node) => node.id)).toEqual(['orders']);
    expect(filtered.edges).toEqual([]);
  });

  it('drops an edge when either endpoint is hidden', () => {
    const filtered = filterGraph(graph, new Set(['orders']));
    expect(filtered.edges).toEqual([]);
  });

  it('keeps edges between two visible nodes', () => {
    const filtered = filterGraph(graph, new Set(['orders', 'products']));
    expect(filtered.nodes).toHaveLength(2);
    expect(filtered.edges).toHaveLength(1);
    expect(filtered.edges[0].source).toBe('orders');
    expect(filtered.edges[0].target).toBe('products');
  });

  it('does not mutate the input graph', () => {
    const snapshot = JSON.stringify(graph);
    filterGraph(graph, new Set(['orders']));
    expect(JSON.stringify(graph)).toBe(snapshot);
  });
});
