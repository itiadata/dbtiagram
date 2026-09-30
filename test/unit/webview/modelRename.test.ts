import { describe, expect, it } from 'vitest';
import { executeModelRename, formatModelRenameImpact, type ModelRenameFileHost } from '../../../src/webview/modelRename';
import type { ModelRenamePlan } from '../../../src/dbt/modelRename';

function fake(initial: Record<string, string>, failWrite?: number, failRestore = false): { host: ModelRenameFileHost; files: Map<string, string>; log: string[] } {
  const files = new Map(Object.entries(initial)); const log: string[] = []; let writes = 0;
  return { files, log, host: {
    readText: async (path) => { const value = files.get(path); if (value === undefined) throw new Error('missing'); return value; },
    exists: async (path) => files.has(path),
    writeText: async (path, text) => { writes += 1; log.push(`write:${path}`); if (writes === failWrite || (failRestore && text === 'a0')) throw new Error(failRestore && text === 'a0' ? 'restore failed' : 'write failed'); files.set(path, text); },
    rename: async (from, to) => { const value = files.get(from); if (value === undefined) throw new Error('missing'); files.delete(from); files.set(to, value); log.push(`rename:${from}->${to}`); },
  } };
}
const plan: ModelRenamePlan = { textFiles: [{ path: '/b', before: 'b0', after: 'b1' }, { path: '/a', before: 'a0', after: 'a1' }], sqlRename: { from: '/orders.sql', to: '/sales_orders.sql' } };

describe('model rename transaction', () => {
  it('formats renamed-file impact', () => {
    expect(formatModelRenameImpact({
      textFiles: [
        { path: '/project/models/a.yml', before: 'a', after: 'b' },
        { path: '/project/models/orders.sql', before: 'a', after: 'b' },
      ],
      sqlRename: { from: '/project/models/orders.sql', to: '/project/models/sales_orders.sql' },
    })).toBe('Updated files:\n/project/models/a.yml\n/project/models/orders.sql\n\nRenamed: /project/models/orders.sql -> /project/models/sales_orders.sql');
  });
  it('formats YAML-only impact', () => {
    expect(formatModelRenameImpact({ textFiles: [{ path: '/project/models/schema.yml', before: 'a', after: 'b' }] })).toBe(
      'Updated files:\n/project/models/schema.yml\n\nNo model SQL file was renamed',
    );
  });
  it('writes text in path order then renames the SQL path', async () => {
    const f = fake({ '/a': 'a0', '/b': 'b0', '/orders.sql': 'sql' }); await executeModelRename(f.host, plan);
    expect(f.log).toEqual(['write:/a', 'write:/b', 'rename:/orders.sql->/sales_orders.sql']);
  });
  it('rolls back every completed operation', async () => {
    const f = fake({ '/a': 'a0', '/b': 'b0', '/orders.sql': 'sql' }, 2); await expect(executeModelRename(f.host, plan)).rejects.toThrow('write failed'); expect(f.files.get('/a')).toBe('a0');
  });
  it('reports incomplete rollback', async () => {
    const f = fake({ '/a': 'a0', '/b': 'b0', '/orders.sql': 'sql' }, 2, true); await expect(executeModelRename(f.host, plan)).rejects.toThrow(/^Model rename failed and rollback was incomplete:/);
  });
  it('refuses divergent history state', async () => {
    const f = fake({ '/a': 'changed', '/b': 'b0', '/orders.sql': 'sql' }); await expect(executeModelRename(f.host, plan)).rejects.toThrow('Cannot restore model rename: /a no longer matches the recorded state'); expect(f.log).toEqual([]);
  });
});
