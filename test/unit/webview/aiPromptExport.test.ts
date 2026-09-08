import { describe, expect, it } from 'vitest';
import { copyAiRenameTypePrompt, type AiPromptExportHost } from '../../../src/webview/aiPromptExport';
import type { ModelDefinition } from '../../../src/dbt/types';

const imported: ModelDefinition = { name: 'costs_from_source', config: { meta: { source_name: 'costs' } }, columns: [{ name: 'id', meta: { source_name: 'id', source_datatype: 'integer' } }] };
interface TestHost extends AiPromptExportHost {
  clipboard: { copy: (text: string) => Promise<void>; calls: string[] };
}
function host(model: ModelDefinition | undefined): TestHost {
  const calls: string[] = [];
  return { findModel: () => model, clipboard: { copy: async (text) => { calls.push(text); }, calls } };
}

describe('copyAiRenameTypePrompt', () => {
  it('copies a generated prompt for a current model', async () => {
    const testHost = host(imported);
    await copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 });
    expect(testHost.clipboard.calls).toHaveLength(1);
    expect(testHost.clipboard.calls[0]).toContain('Batch 1 of 1');
  });
  it('does not copy for missing model or missing provenance', async () => {
    const missing = host(undefined);
    await expect(copyAiRenameTypePrompt(missing, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 })).rejects.toThrow('Model "costs_from_source" is no longer available.');
    const unprovenanced = host({ ...imported, config: undefined });
    await expect(copyAiRenameTypePrompt(unprovenanced, { model: 'costs_from_source', batchSize: 25, batchNumber: 1 })).rejects.toThrow('Model "costs_from_source" has no source provenance to export.');
    expect(missing.clipboard.calls).toHaveLength(0);
    expect(unprovenanced.clipboard.calls).toHaveLength(0);
  });
  it('does not copy an invalid batch', async () => {
    const testHost = host({ ...imported, columns: Array.from({ length: 60 }, (_, index) => ({ name: `c${index}`, meta: { source_name: `c${index}`, source_datatype: 'text' } })) });
    await expect(copyAiRenameTypePrompt(testHost, { model: 'costs_from_source', batchSize: 30, batchNumber: 3 })).rejects.toThrow('Batch number must be between 1 and 2.');
    expect(testHost.clipboard.calls).toHaveLength(0);
  });
});
