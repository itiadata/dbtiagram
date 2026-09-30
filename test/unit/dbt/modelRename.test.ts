import { describe, expect, it } from 'vitest';
import { planModelRename } from '../../../src/dbt/modelRename';

const base = {
  oldName: 'orders', newName: 'sales_orders', targetModelFilePath: '/sample/models/schema.yml',
  targetProjectRoot: '/sample', targetPackage: 'sample', destinationExists: false,
  workspaceProjects: [{ root: '/sample', name: 'sample' }],
  modelFiles: [{ path: '/sample/models/schema.yml', projectRoot: '/sample', text: `version: 2\nmodels:\n  - name: orders\n    meta_note: "{{ ref('orders') }}"\n` }],
  sqlFiles: [
    { path: '/sample/models/use.sql', projectRoot: '/sample', text: `{{ ref('orders') }}`, kind: 'model' as const },
    { path: '/other/models/use.sql', projectRoot: '/other', text: `{{ ref('orders') }} {{ ref('sample', 'orders') }} {{ ref('other', 'orders') }}`, kind: 'model' as const },
  ], matchingModelSqlPaths: ['/sample/models/orders.sql'],
};

describe('model rename planning', () => {
  it('rewrites local and matching qualified refs', () => {
    const plan = planModelRename(base);
    expect(plan.textFiles.find((file) => file.path.startsWith('/sample') && file.path.endsWith('use.sql'))?.after).toBe(`{{ ref('sales_orders') }}`);
    expect(plan.textFiles.find((file) => file.path.startsWith('/other'))?.after).toBe(`{{ ref('orders') }} {{ ref('sample', 'sales_orders') }} {{ ref('other', 'orders') }}`);
  });
  it('rewrites only parsed YAML identities and FK refs', () => {
    const after = planModelRename(base).textFiles.find((file) => file.path.endsWith('schema.yml'))?.after;
    expect(after).toContain('name: sales_orders'); expect(after).toContain(`meta_note: "{{ ref('orders') }}"`);
  });
  it('permits no model SQL', () => expect(planModelRename({ ...base, matchingModelSqlPaths: [] }).sqlRename).toBeUndefined());
  it('rejects multiple model SQL files', () => expect(() => planModelRename({ ...base, matchingModelSqlPaths: ['a/orders.sql', 'b/orders.sql'] })).toThrow('Cannot rename model "orders": multiple model SQL files were found'));
  it('rejects an existing destination', () => expect(() => planModelRename({ ...base, destinationExists: true })).toThrow('Cannot rename model "orders": sales_orders.sql already exists'));
  it('rejects duplicate target package names', () => expect(() => planModelRename({ ...base, workspaceProjects: [...base.workspaceProjects, { root: '/other', name: 'sample' }] })).toThrow('Cannot rename model: multiple open dbt projects are named "sample"'));
});
