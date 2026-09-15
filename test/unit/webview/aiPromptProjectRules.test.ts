import { describe, expect, it } from 'vitest';
import {
  loadAiRenamingRulesFromProject,
  type AiPromptProjectRulesHost,
} from '../../../src/webview/aiPromptProjectRules';

function host(files: Record<string, string | undefined>, existing: readonly string[] = Object.keys(files)): AiPromptProjectRulesHost & { checks: string[]; parentCalls: string[]; reads: string[] } {
  const checks: string[] = [];
  const parentCalls: string[] = [];
  const reads: string[] = [];
  return {
    checks,
    parentCalls,
    reads,
    parent: (uri) => {
      parentCalls.push(uri);
      const index = uri.lastIndexOf('/');
      return index <= 0 ? undefined : uri.slice(0, index);
    },
    join: (base, ...segments) => `${base}/${segments.join('/')}`,
    sameUri: (left, right) => left === right,
    isFile: async (uri) => { checks.push(uri); return existing.includes(uri); },
    readText: async (uri) => { reads.push(uri); return files[uri]; },
  };
}

describe('loadAiRenamingRulesFromProject', () => {
  it('uses rules from the nearest dbt project root', async () => {
    const testHost = host({
      '/workspace/outer/dbt_project.yml': 'outer marker',
      '/workspace/outer/.dbtiagram/ai_renaming_rules.md': 'outer rules',
      '/workspace/outer/nested/dbt_project.yml': 'nested marker',
      '/workspace/outer/nested/.dbtiagram/ai_renaming_rules.md': 'nested rules',
    });
    await expect(loadAiRenamingRulesFromProject(testHost, '/workspace/outer/nested/models/orders.yml', '/workspace')).resolves.toBe('nested rules');
    expect(testHost.reads).toEqual(['/workspace/outer/nested/.dbtiagram/ai_renaming_rules.md']);
  });

  it('stops after inspecting the workspace root', async () => {
    const testHost = host({});
    await expect(loadAiRenamingRulesFromProject(testHost, '/workspace/models/orders.yml', '/workspace')).resolves.toBeUndefined();
    expect(testHost.parentCalls).not.toContain('/workspace');
    expect(testHost.checks).not.toContain('/dbt_project.yml');
  });

  it('treats missing blank and unreadable rules as unavailable', async () => {
    const missing = host({ '/workspace/dbt_project.yml': 'marker' });
    const blank = host({ '/workspace/dbt_project.yml': 'marker', '/workspace/.dbtiagram/ai_renaming_rules.md': ' \n ' });
    const unreadable = host(
      { '/workspace/dbt_project.yml': 'marker', '/workspace/.dbtiagram/ai_renaming_rules.md': undefined },
      ['/workspace/dbt_project.yml', '/workspace/.dbtiagram/ai_renaming_rules.md'],
    );
    await expect(loadAiRenamingRulesFromProject(missing, '/workspace/models/orders.yml', '/workspace')).resolves.toBeUndefined();
    await expect(loadAiRenamingRulesFromProject(blank, '/workspace/models/orders.yml', '/workspace')).resolves.toBeUndefined();
    await expect(loadAiRenamingRulesFromProject(unreadable, '/workspace/models/orders.yml', '/workspace')).resolves.toBeUndefined();
  });
});
