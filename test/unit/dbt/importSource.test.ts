import { describe, expect, it } from 'vitest';
import { importSourceTables, nextImportedModelName } from '../../../src/dbt/importSource';
import type { QualifiedSourceTable } from '../../../src/dbt/sourceTypes';
import { readVirtualConstraints } from '../../../src/dbt/virtual';

function sourceTable(
  name: string,
  sourceName = 'finops',
  overrides: Partial<QualifiedSourceTable['table']> = {},
): QualifiedSourceTable {
  return { id: `${sourceName}.${name}`, sourceName, table: { name, ...overrides } };
}

describe('source table import', () => {
  it('uses the default imported name', () => {
    expect(nextImportedModelName('costs', new Set())).toBe('costs_from_source');
  });

  it('increments an occupied imported name', () => {
    expect(nextImportedModelName('costs', new Set(['costs_from_source', 'costs_from_source_1'])))
      .toBe('costs_from_source_2');
  });

  it('copies table and column properties but drops source properties', () => {
    const selected = sourceTable('costs', 'finops', {
      description: 'Costs',
      config: { tags: ['finance'] },
      extra: { identifier: 'RAW_COSTS', tags: ['daily'] },
      columns: [{ name: 'id', meta: { pii: false }, extra: { quote: true } }],
    });
    const result = importSourceTables({ version: 2, models: [] }, [selected], []);
    expect(result.destination.models[0]).toEqual({
      name: 'costs_from_source',
      description: 'Costs',
      config: { tags: ['finance'] },
      extra: { identifier: 'RAW_COSTS', tags: ['daily'] },
      columns: [{ name: 'id', meta: { pii: false }, extra: { quote: true } }],
    });
    expect(result.destination.models[0].extra).not.toHaveProperty('database');
    expect(result.destination.models[0]).not.toHaveProperty('source');
  });

  it('deep copies imported properties', () => {
    const selected = sourceTable('costs', 'finops', { config: { nested: { value: 'original' } } });
    const result = importSourceTables({ models: [] }, [selected], []);
    const nested = result.destination.models[0].config?.nested as { value: string };
    nested.value = 'changed';
    expect((selected.table.config?.nested as { value: string }).value).toBe('original');
  });

  it('imports a source primary key as real with tests', () => {
    const selected = sourceTable('costs', 'finops', {
      columns: [{ name: 'id' }],
      config: { meta: { dbtiagram: { virtual: { primary_key: { columns: ['id'] } } } } },
    });
    const model = importSourceTables({ models: [] }, [selected], []).destination.models[0];
    expect(readVirtualConstraints(model).primaryKey).toBeUndefined();
    expect(model.constraints).toEqual([{ type: 'primary_key', columns: ['id'] }]);
    expect(model.dataTests).toEqual([{
      'dbt_utils.unique_combination_of_columns': {
        arguments: { combination_of_columns: ['id'] },
      },
    }]);
    expect(model.columns?.[0]?.dataTests).toEqual(['not_null']);
  });

  it("rewrites an FK to the selected target's allocated name", () => {
    const costs = sourceTable('costs', 'finops', {
      config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "source('finops', 'workspaces')", columns: ['workspace_id'], to_columns: ['id'] }] } } } },
    });
    const result = importSourceTables(
      { models: [] },
      [costs, sourceTable('workspaces')],
      [{ name: 'workspaces_from_source' }],
    );
    expect(readVirtualConstraints(result.destination.models[0]).foreignKeys).toBeUndefined();
    expect(result.destination.models[0].constraints).toContainEqual({
      type: 'foreign_key',
      to: "ref('workspaces_from_source_1')",
      columns: ['workspace_id'],
      toColumns: ['id'],
    });
    expect(result.brokenForeignKeys).toEqual([]);
  });

  it('keeps and reports an unselected FK', () => {
    const costs = sourceTable('costs', 'finops', {
      config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "source('finops', 'workspaces')", columns: ['workspace_id'], to_columns: ['id'] }] } } } },
    });
    const result = importSourceTables({ models: [] }, [costs], []);
    expect(result.destination.models[0].constraints?.[0].to).toBe("ref('workspaces_from_source')");
    expect(result.brokenForeignKeys.map((fk) => fk.display)).toEqual([
      "costs_from_source.workspace_id -> ref('workspaces_from_source').id",
    ]);
  });

  it('does not report an existing unselected target', () => {
    const costs = sourceTable('costs', 'finops', {
      config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "source('finops', 'workspaces')", columns: [], to_columns: [] }] } } } },
    });
    const result = importSourceTables({ models: [] }, [costs], [{ name: 'workspaces_from_source' }]);
    expect(result.brokenForeignKeys).toEqual([]);
  });

  it('retains an invalid FK expression without reporting it', () => {
    const costs = sourceTable('costs', 'finops', {
      config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: 'custom_target', columns: [], to_columns: [] }] } } } },
    });
    const result = importSourceTables({ models: [] }, [costs], []);
    expect(result.destination.models[0].constraints?.[0].to).toBe('custom_target');
    expect(result.brokenForeignKeys).toEqual([]);
  });

  it('appends in source order', () => {
    const result = importSourceTables(
      { models: [{ name: 'existing' }] },
      [sourceTable('costs'), sourceTable('workspaces')],
      [{ name: 'existing' }],
    );
    expect(result.destination.models.map((model) => model.name)).toEqual([
      'existing', 'costs_from_source', 'workspaces_from_source',
    ]);
  });
});
