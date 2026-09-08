import { describe, expect, it } from 'vitest';
import { applySourceEdit } from '../../../src/dbt/sourceEdit';
import type { SourceDefinition } from '../../../src/dbt/sourceTypes';
const sources: SourceDefinition[] = [{ name: 'finops', tables: [{ name: 'costs', columns: [{ name: 'id' }, { name: 'workspace_id' }] }, { name: 'workspaces', columns: [{ name: 'id' }] }] }];
describe('applySourceEdit', () => {
  it('forces a virtual primary key', () => {
    const result = applySourceEdit(sources, { kind: 'setPrimaryKey', model: 'finops.costs', columns: ['id'], virtual: false, uniqueTest: true });
    expect(result.sources[0].tables[0].config?.meta).toEqual({ dbtiagram: { virtual: { primary_key: { columns: ['id'] } } } });
  });
  it('creates a canonical virtual source FK', () => {
    const result = applySourceEdit(sources, { kind: 'createForeignKey', model: 'finops.costs', target: 'finops.workspaces', columns: ['workspace_id'], toColumns: ['id'], virtual: false });
    expect(result.sources[0].tables[0].config?.meta).toEqual({ dbtiagram: { virtual: { foreign_keys: [{ to: "source('finops', 'workspaces')", columns: ['workspace_id'], to_columns: ['id'] }] } } });
  });
  it('rejects read-only edits', () => expect(() => applySourceEdit(sources, { kind: 'setModelName', model: 'finops.costs', name: 'x' })).toThrow('This field is read-only in source mode'));
});
