import { describe, expect, it } from 'vitest';
import { importAiRenameTypeClipboardResponse, type AiPromptImportHost } from '../../../src/webview/aiPromptImport';
import type { ModelDefinition } from '../../../src/dbt/types';

const model: ModelDefinition = { name: 'costs_from_source', columns: [{ name: 'id', meta: { source_name: 'id' } }] };
function host(text: string): AiPromptImportHost & { edits: unknown[]; completedCalls: [number, number][]; failures: string[] } {
  const edits: unknown[] = []; const completedCalls: [number, number][] = []; const failures: string[] = [];
  return { findModel: () => model, loadRules: async () => 'rules', clipboard: { paste: async () => text }, notifier: { completed: async (updated, rejected) => { completedCalls.push([updated, rejected]); }, failed: async (message) => { failures.push(message); } }, applyAndPersist: async (edit) => { edits.push(edit); }, edits, completedCalls, failures };
}
describe('importAiRenameTypeClipboardResponse', () => {
  it('persists accepted results and reports clean completion', async () => {
    const testHost = host(JSON.stringify({ model: 'costs_from_source', batch: { number: 1, total: 1 }, columns: [{ source_name: 'id', new_name: 'ID_COST', data_type: 'INTEGER' }] }));
    await importAiRenameTypeClipboardResponse(testHost, 'costs_from_source');
    expect(testHost.edits).toEqual([{ kind: 'applyAiPromptImport', model: 'costs_from_source', columns: [{ sourceName: 'id', newName: 'ID_COST', dataType: 'INTEGER' }] }]);
    expect(testHost.completedCalls).toEqual([[1, 0]]);
  });
  it('rejects unavailable rules before reading the clipboard', async () => {
    const testHost = host('unused');
    let clipboardCalls = 0;
    testHost.loadRules = async () => undefined;
    testHost.clipboard.paste = async () => { clipboardCalls += 1; return 'unused'; };
    await expect(importAiRenameTypeClipboardResponse(testHost, 'costs_from_source')).rejects.toThrow('AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.');
    expect(clipboardCalls).toBe(0);
    expect(testHost.edits).toHaveLength(0);
    expect(testHost.completedCalls).toHaveLength(0);
  });
  it('reports partial completion without applying rejected results', async () => {
    const testHost = host(JSON.stringify({ model: 'costs_from_source', batch: { number: 1, total: 1 }, columns: [{ source_name: 'id', new_name: 'ID_COST', data_type: 'INTEGER' }, { source_name: 'missing', new_name: 'MISSING', data_type: 'INTEGER' }] }));
    await importAiRenameTypeClipboardResponse(testHost, 'costs_from_source');
    expect(testHost.edits).toHaveLength(1); expect(testHost.completedCalls).toEqual([[1, 1]]);
  });
  it('reports invalid clipboard without persisting', async () => {
    const testHost = host('not JSON');
    await importAiRenameTypeClipboardResponse(testHost, 'costs_from_source');
    expect(testHost.edits).toHaveLength(0); expect(testHost.failures).toEqual(['clipboard content is not valid JSON.']);
  });
});
