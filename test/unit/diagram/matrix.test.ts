import { describe, expect, it } from 'vitest';
import { buildMatrixRows, discoverMetaKeys } from '../../../src/diagram/matrix';
import type { TableNode } from '../../../src/diagram/graph';

function node(overrides: Partial<TableNode>): TableNode {
  return {
    id: overrides.id ?? 'model',
    label: overrides.label ?? overrides.id ?? 'model',
    columns: overrides.columns ?? [],
    foreignKeys: overrides.foreignKeys ?? [],
    foreignKeyColumns: overrides.foreignKeyColumns ?? [],
    ...overrides,
  };
}

describe('discoverMetaKeys', () => {
  it('unions and dedupes keys across nodes, alphabetical', () => {
    const nodeA = node({ id: 'a', columns: [{ name: 'x', meta: { b: '1' } }] });
    const nodeB = node({ id: 'b', columns: [{ name: 'y', meta: { a: '2', b: '3' } }] });
    expect(discoverMetaKeys([nodeA, nodeB])).toEqual(['a', 'b']);
  });
});

describe('buildMatrixRows', () => {
  it('fills missing meta keys with undefined', () => {
    const nodeA = node({
      id: 'a',
      columns: [{ name: 'x', meta: { confidentiality: 'internal' } }],
    });
    const rows = buildMatrixRows([nodeA], ['confidentiality', 'GDPR']);
    expect(rows).toHaveLength(1);
    expect(rows[0].meta).toEqual({ confidentiality: 'internal', GDPR: undefined });
  });

  it('marks primary key rows and carries the model virtual flag', () => {
    const nodeA = node({
      id: 'a',
      columns: [{ name: 'id' }, { name: 'name' }],
      primaryKey: { columns: ['id'], virtual: true, uniqueTest: false },
    });
    const rows = buildMatrixRows([nodeA], []);
    const idRow = rows.find((r) => r.column === 'id');
    const nameRow = rows.find((r) => r.column === 'name');
    expect(idRow).toMatchObject({ isPrimaryKey: true, virtualPrimaryKey: true });
    expect(nameRow).toMatchObject({ isPrimaryKey: false });
  });
});
