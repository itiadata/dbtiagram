import { describe, expect, it } from 'vitest';
import { copyAiRenameTypePrompt, type AiPromptExportHost } from '../../../src/webview/aiPromptExport';
import type { ModelDefinition } from '../../../src/dbt/types';

const imported: ModelDefinition = { name: 'costs_from_source', config: { meta: { source_name: 'costs' } }, columns: [{ name: 'id', meta: { source_name: 'id', source_datatype: 'integer' } }] };
interface TestHost extends AiPromptExportHost {
  clipboard: { copy: (text: string) => Promise<void>; calls: string[] };
  ruleCalls: string[];
}
function host(model: ModelDefinition | undefined): TestHost {
  const calls: string[] = [];
  const ruleCalls: string[] = [];
  return { findModel: () => model, loadRules: async (name) => { ruleCalls.push(name); return 'Use ACME vocabulary.'; }, clipboard: { copy: async (text) => { calls.push(text); }, calls }, ruleCalls };
}

describe('copyAiRenameTypePrompt', () => {
  it('copies a generated prompt for a current model', async () => {
    const testHost = host(imported);
    const result = await copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 });
    expect(testHost.clipboard.calls).toHaveLength(1);
    expect(testHost.clipboard.calls[0]).toContain('Batch 1 of 1');
    expect(testHost.clipboard.calls[0]?.startsWith('Rename each input column and choose its data type. The JSONL input describes the current dbt model columns and their source metadata. Apply the project-specific naming and data-type rules below.\n\nUse ACME vocabulary.')).toBe(true);
    expect(testHost.ruleCalls).toEqual(['costs_from_source']);
    expect(result).toMatchObject({ model: 'costs_from_source', number: 1, total: 1 });
  });
  it('rejects missing or blank project rules before copying', async () => {
    const testHost = host(imported);
    testHost.loadRules = async () => undefined;
    await expect(copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 })).rejects.toThrow('AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.');
    testHost.loadRules = async () => ' \n ';
    await expect(copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 })).rejects.toThrow('AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.');
    expect(testHost.clipboard.calls).toHaveLength(0);
  });
  it('uses the model name when model provenance is absent', async () => {
    const missing = host(undefined);
    await expect(copyAiRenameTypePrompt(missing, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 })).rejects.toThrow('Model "costs_from_source" is no longer available.');
    const unprovenanced = host({ ...imported, config: undefined });
    await copyAiRenameTypePrompt(unprovenanced, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 });
    expect(missing.clipboard.calls).toHaveLength(0);
    expect(missing.ruleCalls).toHaveLength(0);
    expect(unprovenanced.clipboard.calls[0]).toContain('Source table: costs_from_source');
  });
  it('does not copy an invalid batch', async () => {
    const testHost = host({ ...imported, columns: Array.from({ length: 60 }, (_, index) => ({ name: `c${index}`, meta: { source_name: `c${index}`, source_datatype: 'text' } })) });
    await expect(copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 30, batchNumber: 3 })).rejects.toThrow('Batch number must be between 1 and 2.');
    expect(testHost.clipboard.calls).toHaveLength(0);
  });
});
