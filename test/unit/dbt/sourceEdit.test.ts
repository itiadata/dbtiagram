import { describe, expect, it } from 'vitest';
import { applySourceEdit } from '../../../src/dbt/sourceEdit';
import type { ModelEdit } from '../../../src/dbt/edit';
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
  it('sets source column meta without changing sibling fields', () => {
    const input: SourceDefinition[] = [{ name: 'finops', tables: [{ name: 'costs', config: { tags: ['daily'] }, columns: [{ name: 'id', config: { tags: ['key'] }, meta: { owner: 'data' } }] }, { name: 'other', columns: [{ name: 'id' }] }] }];
    const result = applySourceEdit(input, { kind: 'setColumnMeta', model: 'finops.costs', column: 'id', key: 'confidentiality', value: ' restricted ' });
    expect(result.sources[0].tables[0].columns?.[0].meta).toEqual({ owner: 'data', confidentiality: 'restricted' });
    expect(result.sources[0].tables[0].config).toEqual({ tags: ['daily'] });
    expect(result.sources[0].tables[0].columns?.[0].config).toEqual({ tags: ['key'] });
    expect(result.sources[0].tables[1]).toBe(input[0].tables[1]);
  });

  it('keeps existing source meta key when cleared', () => {
    const input: SourceDefinition[] = [{ name: 'finops', tables: [{ name: 'costs', columns: [{ name: 'id', meta: { confidentiality: 'restricted' } }] }] }];
    const result = applySourceEdit(input, { kind: 'setColumnMeta', model: 'finops.costs', column: 'id', key: 'confidentiality', value: '   ' });
    expect(result.sources[0].tables[0].columns?.[0].meta).toEqual({ confidentiality: '' });
  });

  it('rejects source column structural edits', () => {
    const edits: ModelEdit[] = [
      { kind: 'setColumnName', model: 'finops.costs', column: 'id', name: 'renamed' },
      { kind: 'setColumnDataType', model: 'finops.costs', column: 'id', dataType: 'text' },
      { kind: 'addColumn', model: 'finops.costs', name: 'added', dataType: 'text' },
      { kind: 'transferColumns', sourceModel: 'finops.costs', destinationModel: 'finops.costs', columns: ['id'], copy: false },
    ];
    for (const edit of edits) expect(() => applySourceEdit(sources, edit)).toThrow('This field is read-only in source mode');
  });
});
