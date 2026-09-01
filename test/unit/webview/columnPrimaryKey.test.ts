import { describe, it, expect } from 'vitest';
import { isPrimaryKeyColumn, toggleColumnPrimaryKey } from '../../../webview-ui/columnPrimaryKey';
import type { TableNode } from '../../../src/diagram/graph';

function makeNode(overrides: Partial<TableNode> = {}): TableNode {
  return {
    id: 'orders',
    label: 'orders',
    columns: [],
    foreignKeys: [],
    foreignKeyColumns: [],
    ...overrides,
  };
}

describe('isPrimaryKeyColumn', () => {
  it('reports membership in the primary key', () => {
    const node = makeNode({ primaryKey: { columns: ['id'], virtual: false, uniqueTest: true } });
    expect(isPrimaryKeyColumn(node, 'id')).toBe(true);
    expect(isPrimaryKeyColumn(node, 'name')).toBe(false);
  });

  it('reports no membership when the table has no primary key', () => {
    const node = makeNode();
    expect(isPrimaryKeyColumn(node, 'id')).toBe(false);
  });
});

describe('toggleColumnPrimaryKey', () => {
  it('creates a real primary key with the unique test when none exists', () => {
    const node = makeNode();
    expect(toggleColumnPrimaryKey(node, 'id')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: ['id'],
      virtual: false,
      uniqueTest: true,
    });
  });

  it('appends a column to an existing primary key', () => {
    const node = makeNode({
      primaryKey: { columns: ['order_id'], virtual: false, uniqueTest: true },
    });
    expect(toggleColumnPrimaryKey(node, 'line_no')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: ['order_id', 'line_no'],
      virtual: false,
      uniqueTest: true,
    });
  });

  it('removes a column from the primary key', () => {
    const node = makeNode({
      primaryKey: { columns: ['order_id', 'line_no'], virtual: false, uniqueTest: true },
    });
    expect(toggleColumnPrimaryKey(node, 'line_no')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: ['order_id'],
      virtual: false,
      uniqueTest: true,
    });
  });

  it('clears the primary key when the last column is removed', () => {
    const node = makeNode({ primaryKey: { columns: ['id'], virtual: false, uniqueTest: true } });
    expect(toggleColumnPrimaryKey(node, 'id')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: [],
      virtual: false,
      uniqueTest: true,
    });
  });

  it('preserves the virtual flag', () => {
    const node = makeNode({ primaryKey: { columns: ['id'], virtual: true, uniqueTest: false } });
    expect(toggleColumnPrimaryKey(node, 'code')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: ['id', 'code'],
      virtual: true,
      uniqueTest: false,
    });
  });

  it('preserves an omitted unique test on a real key', () => {
    const node = makeNode({ primaryKey: { columns: ['id'], virtual: false, uniqueTest: false } });
    expect(toggleColumnPrimaryKey(node, 'code')).toEqual({
      kind: 'setPrimaryKey',
      model: 'orders',
      columns: ['id', 'code'],
      virtual: false,
      uniqueTest: false,
    });
  });

  it('does not mutate the node', () => {
    const node = makeNode({ primaryKey: { columns: ['id'], virtual: false, uniqueTest: true } });
    toggleColumnPrimaryKey(node, 'code');
    expect(node.primaryKey?.columns).toEqual(['id']);
  });
});
