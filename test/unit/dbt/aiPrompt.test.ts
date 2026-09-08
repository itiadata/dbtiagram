import { describe, expect, it } from 'vitest';
import { aiPromptBatch, buildAiRenameTypePrompt, eligibleAiPromptColumns } from '../../../src/dbt/aiPrompt';
import type { ModelDefinition } from '../../../src/dbt/types';

function model(columns: ModelDefinition['columns']): ModelDefinition {
  return { name: 'costs_from_source', config: { meta: { source_name: 'costs' } }, columns };
}

describe('AI rename/type prompt', () => {
  it('selects only columns with source name and data type provenance', () => {
    expect(eligibleAiPromptColumns(model([{ name: 'id', meta: { source_name: 'id', source_datatype: 'integer' } }, { name: 'notes' }]))).toEqual([{ sourceName: 'id', currentName: 'id', sourceDataType: 'integer', currentDataType: undefined, description: undefined, sampleValues: undefined, sourceLength: undefined, sourceMaxLength: undefined }]);
  });
  it('builds compact JSONL evidence and strict response instructions', () => {
    const prompt = buildAiRenameTypePrompt(aiPromptBatch(model([{ name: 'id', dataType: 'integer', description: 'Raw cost identifier', meta: { source_name: 'id', source_datatype: 'integer', source_sample_values: [1, 2, 3], source_length: 10, source_max_length: 3 } }]), { model: 'costs_from_source', batchSize: 25, batchNumber: 1 }));
    expect(prompt).toContain('{"s":"id","n":"id","t":"integer","d":"Raw cost identifier","st":"integer","v":[1,2,3],"l":10,"m":3}');
    expect(prompt).toContain('source_name, new_name, and data_type');
  });
  it('selects the final partial batch in model order', () => {
    const columns = Array.from({ length: 101 }, (_, index) => ({ name: `c${index + 1}`, meta: { source_name: `c${index + 1}`, source_datatype: 'text' } }));
    expect(aiPromptBatch(model(columns), { model: 'costs_from_source', batchSize: 50, batchNumber: 3 })).toMatchObject({ number: 3, total: 3, columns: [{ sourceName: 'c101' }] });
  });
  it('normalizes non-JSON metadata without invalid JSONL', () => {
    const prompt = buildAiRenameTypePrompt(aiPromptBatch(model([{ name: 'id', meta: { source_name: 'id', source_datatype: 'integer', source_sample_values: [{ code: 'A' }, Infinity], source_length: { value: 10 } } }]), { model: 'costs_from_source', batchSize: 25, batchNumber: 1 }));
    const line = JSON.parse(prompt.split('\n').find((value) => value.startsWith('{"s"')) ?? '');
    expect(line).toMatchObject({ v: ['{"code":"A"}', 'Infinity'], l: '{"value":10}' });
  });
  it('rejects invalid batch requests', () => {
    const columns = Array.from({ length: 60 }, (_, index) => ({ name: `c${index}`, meta: { source_name: `c${index}`, source_datatype: 'text' } }));
    expect(() => aiPromptBatch(model(columns), { model: 'costs_from_source', batchSize: 0, batchNumber: 1 })).toThrow('Batch size must be a positive integer.');
    expect(() => aiPromptBatch(model(columns), { model: 'costs_from_source', batchSize: 30, batchNumber: 3 })).toThrow('Batch number must be between 1 and 2.');
  });
});
