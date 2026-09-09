import { describe, expect, it } from 'vitest';
import { planAiRenameTypeImport } from '../../../src/dbt/aiPromptImport';
import type { ModelDefinition } from '../../../src/dbt/types';

const model: ModelDefinition = { name: 'costs_from_source', columns: [{ name: 'id', meta: { source_name: 'id' } }, { name: 'category', meta: { source_name: 'category' } }] };
const response = (columns: unknown, name = 'costs_from_source') => JSON.stringify({ model: name, batch: { number: 1, total: 1 }, columns });

describe('AI prompt import planning', () => {
  it('plans provenance-matched valid response items', () => {
    expect(planAiRenameTypeImport(model, response([{ source_name: 'id', new_name: 'ID_COST', data_type: 'INTEGER' }, { source_name: 'category', new_name: 'TYP_COST_CATEGORY', data_type: 'VARCHAR' }]))).toEqual({ accepted: [{ sourceName: 'id', newName: 'ID_COST', dataType: 'INTEGER' }, { sourceName: 'category', newName: 'TYP_COST_CATEGORY', dataType: 'VARCHAR' }], rejected: [] });
  });
  it('rejects malformed JSON and a mismatching response model', () => {
    expect(() => planAiRenameTypeImport(model, 'not JSON')).toThrow('clipboard content is not valid JSON.');
    expect(() => planAiRenameTypeImport(model, response([], 'other_model'))).toThrow('response model "other_model" does not match current model "costs_from_source".');
  });
  it('retains valid items while rejecting unknown blank and duplicate results', () => {
    const result = planAiRenameTypeImport(model, response([{ source_name: 'id', new_name: 'ID_COST', data_type: 'INTEGER' }, { source_name: 'missing', new_name: 'MISSING', data_type: 'INTEGER' }, { source_name: 'category', new_name: ' ', data_type: 'VARCHAR' }, { source_name: 'category', new_name: 'CATEGORY', data_type: 'VARCHAR' }]));
    expect(result.accepted).toEqual([{ sourceName: 'id', newName: 'ID_COST', dataType: 'INTEGER' }]);
    expect(result.rejected).toHaveLength(3);
  });
  it('filters proposals that collide with an unchanged column', () => {
    const result = planAiRenameTypeImport(model, response([{ source_name: 'id', new_name: 'category', data_type: 'INTEGER' }, { source_name: 'category', new_name: 'TYP_CATEGORY', data_type: 'VARCHAR' }]));
    expect(result.accepted).toEqual([{ sourceName: 'category', newName: 'TYP_CATEGORY', dataType: 'VARCHAR' }]);
    expect(result.rejected).toHaveLength(1);
  });
});
