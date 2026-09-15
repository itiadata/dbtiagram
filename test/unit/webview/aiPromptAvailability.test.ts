import { describe, expect, it } from 'vitest';
import { availableAiRenamingModels } from '../../../src/webview/aiPromptAvailability';

describe('availableAiRenamingModels', () => {
  it('reports unique models only from files with rules', async () => {
    const calls: string[] = [];
    const rules = new Map([['outer.yml', 'rules'], ['nested.yml', '  '], ['repeat.yml', 'rules']]);
    const result = await availableAiRenamingModels([
      { uri: 'outer.yml', models: ['orders', 'customers'] },
      { uri: 'nested.yml', models: ['payments'] },
      { uri: 'repeat.yml', models: ['orders'] },
    ], { load: async (uri) => { calls.push(uri); return rules.get(uri); } });
    expect(result).toEqual(['orders', 'customers']);
    expect(calls).toEqual(['outer.yml', 'nested.yml', 'repeat.yml']);
  });
});
