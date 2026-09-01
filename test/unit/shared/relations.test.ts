import { describe, expect, it } from 'vitest';
import type { DiagramGraph, RelationEdge, TableNode } from '../../../src/diagram/graph';
import type { DiagramModelFile } from '../../../src/shared/protocol';
import { filesDeclaring, relatedModels } from '../../../src/shared/relations';

function node(id: string): TableNode {
  return { id, label: id, columns: [], foreignKeys: [], foreignKeyColumns: [] };
}

function edge(
  source: string,
  target: string,
  overrides: Partial<RelationEdge> = {},
): RelationEdge {
  return {
    source,
    target,
    sourceColumns: [`${source}_id`],
    targetColumns: ['id'],
    virtual: false,
    ...overrides,
  };
}

function graphOf(edges: RelationEdge[]): DiagramGraph {
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.source);
    ids.add(e.target);
  }
  return { nodes: [...ids].map(node), edges };
}

describe('relatedModels', () => {
  it('returns outgoing FK targets', () => {
    const graph = graphOf([edge('orders', 'customers')]);
    expect(relatedModels(graph, 'orders')).toEqual(['customers']);
  });

  it('returns incoming FK sources', () => {
    const graph = graphOf([edge('orders', 'customers')]);
    expect(relatedModels(graph, 'customers')).toEqual(['orders']);
  });

  it('returns both directions', () => {
    const graph = graphOf([edge('orders', 'customers'), edge('order_items', 'orders')]);
    expect(relatedModels(graph, 'orders')).toEqual(['customers', 'order_items']);
  });

  it('stops after one hop', () => {
    const graph = graphOf([edge('order_items', 'orders'), edge('orders', 'customers')]);
    expect(relatedModels(graph, 'order_items')).toEqual(['orders']);
  });

  it('collapses duplicate edges', () => {
    const graph = graphOf([
      edge('orders', 'customers', { sourceColumns: ['a'], targetColumns: ['x'] }),
      edge('orders', 'customers', { sourceColumns: ['b'], targetColumns: ['y'] }),
    ]);
    expect(relatedModels(graph, 'orders')).toEqual(['customers']);
  });

  it('returns an empty list for an unrelated model', () => {
    const graph = graphOf([edge('orders', 'customers')]);
    expect(relatedModels(graph, 'date_spine')).toEqual([]);
  });
});

describe('filesDeclaring', () => {
  const files: DiagramModelFile[] = [
    { uri: 'a.yml', label: 'a', models: ['orders'] },
    { uri: 'b.yml', label: 'b', models: ['customers'] },
  ];

  it('returns the uris declaring the models', () => {
    expect(filesDeclaring(files, ['customers'])).toEqual(['b.yml']);
  });

  it('collapses a file declaring several of the models', () => {
    const merged: DiagramModelFile[] = [
      { uri: 'a.yml', label: 'a', models: ['orders', 'customers'] },
    ];
    expect(filesDeclaring(merged, ['orders', 'customers'])).toEqual(['a.yml']);
  });

  it('ignores models no file declares', () => {
    expect(filesDeclaring(files, ['ghost'])).toEqual([]);
  });
});
