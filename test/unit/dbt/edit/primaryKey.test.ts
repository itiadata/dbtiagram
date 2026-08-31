import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';

describe('applyEdit', () => {
  describe('setPrimaryKey (real)', () => {
    const target: ModelDefinition[] = [
      {
        name: 'products',
        columns: [{ name: 'product_id' }, { name: 'name' }],
      },
    ];

    it('writes all three constructs when adding a real PK', () => {
      const { models: next } = applyEdit(target, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
        uniqueTest: true,
      });
      const product = next[0];
      expect(product.dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['product_id'] },
          },
        },
      ]);
      expect(product.constraints).toEqual([{ type: 'primary_key', columns: ['product_id'] }]);
      expect(product.columns?.[0]).toMatchObject({ name: 'product_id', dataTests: ['not_null'] });
      expect(product.columns?.[1]).toEqual({ name: 'name' });
    });

    it('updates the three constructs in place when the PK grows', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id', dataTests: ['not_null'] }, { name: 'name' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['product_id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id', 'name'],
        virtual: false,
      });
      const product = next[0];
      expect(product.dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['product_id', 'name'] },
          },
        },
      ]);
      expect(product.constraints).toEqual([
        { type: 'primary_key', columns: ['product_id', 'name'] },
      ]);
      expect(product.columns?.[0].dataTests).toEqual(['not_null']);
      expect(product.columns?.[1].dataTests).toEqual(['not_null']);
    });

    it('moves not_null off a column that leaves the PK', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [
            { name: 'product_id', dataTests: ['not_null'] },
            { name: 'name', dataTests: ['not_null'] },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id', 'name'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
      });
      const product = next[0];
      expect(product.columns?.[0].dataTests).toEqual(['not_null']);
      expect(product.columns?.[1].dataTests).toBeUndefined();
      expect(product.constraints).toEqual([{ type: 'primary_key', columns: ['product_id'] }]);
    });

    it('removes all three constructs when the PK is cleared, preserving other tests', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [
            { name: 'product_id', dataTests: ['not_null', 'accepted_values: [1]'] },
          ],
          dataTests: [
            { 'dbt_utils.unique_combination_of_columns': { arguments: { combination_of_columns: ['product_id'] } } },
            'some_other_test',
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: [],
        virtual: false,
      });
      const product = next[0];
      expect(product.dataTests).toEqual(['some_other_test']);
      expect(product.constraints).toBeUndefined();
      expect(product.columns?.[0].dataTests).toEqual(['accepted_values: [1]']);
    });

    it('never duplicates the constructs when re-adding the same PK', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id', dataTests: ['not_null'] }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['product_id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
      });
      const product = next[0];
      expect(product.dataTests).toHaveLength(1);
      expect(product.constraints).toHaveLength(1);
      expect(product.columns?.[0].dataTests?.filter((t) => t === 'not_null')).toHaveLength(1);
    });

    it('preserves the unique test entry and constraint other keys', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                enabled: false,
                arguments: { combination_of_columns: ['product_id'], extra: 'keep' },
              },
              custom: 'sibling',
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'], name: 'pk_products', warn_unenforced: true }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
      });
      const product = next[0];
      expect(product.dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            enabled: false,
            arguments: { combination_of_columns: ['product_id'], extra: 'keep' },
          },
          custom: 'sibling',
        },
      ]);
      expect(product.constraints).toEqual([
        { type: 'primary_key', columns: ['product_id'], name: 'pk_products', warn_unenforced: true },
      ]);
    });

    it('replaces a bare-string unique test entry with the mapping form', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          dataTests: ['dbt_utils.unique_combination_of_columns'],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
      });
      expect(next[0].dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['product_id'] },
          },
        },
      ]);
    });

    it('is a no-op (identity) when the state is unchanged', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id', dataTests: ['not_null'] }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['product_id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
      });
      expect(next[0]).toBe(withPk[0]);
    });

    it('throws when a PK column does not exist on the model', () => {
      expect(() =>
        applyEdit(target, {
          kind: 'setPrimaryKey',
          model: 'products',
          columns: ['nope'],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('trims and dedupes the column list', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: [' product_id ', 'product_id'],
        virtual: false,
      });
      expect(next[0].constraints).toEqual([{ type: 'primary_key', columns: ['product_id'] }]);
    });
  });

  describe('setPrimaryKey (virtual)', () => {
    it('writes meta only for a virtual PK', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: true,
      });
      const product = next[0];
      expect(product.config).toEqual({
        meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
      });
      expect(product.dataTests).toBeUndefined();
      expect(product.constraints).toBeUndefined();
      expect(product.columns?.[0].dataTests).toBeUndefined();
    });

    it('converts a real PK to virtual, removing the real artifacts', () => {
      const withPk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id', dataTests: ['not_null'] }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['product_id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      const { models: next } = applyEdit(withPk, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: true,
      });
      const product = next[0];
      expect(product.config).toEqual({
        meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
      });
      expect(product.dataTests).toBeUndefined();
      expect(product.constraints).toBeUndefined();
      expect(product.columns?.[0].dataTests).toBeUndefined();
    });

    it('converts a virtual PK back to real, clearing the meta block', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
        uniqueTest: true,
      });
      const product = next[0];
      expect(product.config).toBeUndefined();
      expect(product.constraints).toEqual([{ type: 'primary_key', columns: ['product_id'] }]);
      expect(product.dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['product_id'] },
          },
        },
      ]);
      expect(product.columns?.[0].dataTests).toEqual(['not_null']);
    });

    it('clearing a virtual PK removes it from meta (empty columns)', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: [],
        virtual: true,
      });
      expect(next[0].config).toBeUndefined();
    });

    it('is a no-op (identity) when the virtual state is unchanged', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: true,
      });
      expect(next[0]).toBe(models[0]);
    });

    it('the displayed (virtual) state wins over a coexisting real PK (c)', () => {
      const both: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: { dbtiagram: { virtual: { primary_key: { columns: ['product_id'] } } } },
          },
          constraints: [{ type: 'primary_key', columns: ['product_id'] }],
        },
      ];
      // The UI shows the virtual state; converting it to real aligns the file.
      const { models: next } = applyEdit(both, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['product_id'],
        virtual: false,
        uniqueTest: true,
      });
      const product = next[0];
      expect(product.config).toBeUndefined();
      expect(product.constraints).toEqual([{ type: 'primary_key', columns: ['product_id'] }]);
      expect(product.dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['product_id'] },
          },
        },
      ]);
    });
  });

  describe('setPrimaryKey uniqueTest flag (spec 33)', () => {
    it('creates the test when uniqueTest is true', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['id'] },
          },
        },
      ]);
    });

    it('removes the test when uniqueTest is false', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
        uniqueTest: false,
      });
      expect(next[0].dataTests).toBeUndefined();
      expect(next[0].constraints).toEqual([{ type: 'primary_key', columns: ['id'] }]);
    });

    it('keeps not_null when the test is removed', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id', dataTests: ['not_null'] }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
        uniqueTest: false,
      });
      expect(next[0].columns?.[0].dataTests).toEqual(['not_null']);
    });

    it('preserves sibling keys when updating an existing test', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }, { name: 'line' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                enabled: true,
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id', 'line'],
        virtual: false,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            enabled: true,
            arguments: { combination_of_columns: ['id', 'line'] },
          },
        },
      ]);
    });

    it('does not create the test when uniqueTest is omitted', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
      });
      expect(next[0].dataTests).toBeUndefined();
    });

    it('updates an existing test when uniqueTest is omitted', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }, { name: 'line' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id', 'line'],
        virtual: false,
      });
      const value = (next[0].dataTests?.[0] as Record<string, { arguments: { combination_of_columns: string[] } }>)[
        'dbt_utils.unique_combination_of_columns'
      ];
      expect(value.arguments.combination_of_columns).toEqual(['id', 'line']);
    });

    it('removes the test when the PK is cleared even with uniqueTest true', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: [],
        virtual: false,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toBeUndefined();
    });

    it('a virtual PK ignores uniqueTest', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          dataTests: [
            {
              'dbt_utils.unique_combination_of_columns': {
                arguments: { combination_of_columns: ['id'] },
              },
            },
          ],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: true,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toBeUndefined();
      expect(next[0].config).toEqual({
        meta: { dbtiagram: { virtual: { primary_key: { columns: ['id'] } } } },
      });
    });

    it('upgrades a bare-string entry', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
          dataTests: ['dbt_utils.unique_combination_of_columns'],
          constraints: [{ type: 'primary_key', columns: ['id'] }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['id'] },
          },
        },
      ]);
    });

    it('toggling the flag on a model with no PK still applies', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'id' }],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setPrimaryKey',
        model: 'products',
        columns: ['id'],
        virtual: false,
        uniqueTest: true,
      });
      expect(next[0].dataTests).toEqual([
        {
          'dbt_utils.unique_combination_of_columns': {
            arguments: { combination_of_columns: ['id'] },
          },
        },
      ]);
    });
  });

  describe('hasUniqueCombinationTest', () => {
    it('detects both forms', async () => {
      const { hasUniqueCombinationTest } = await import('../../../../src/dbt/edit/primaryKey');
      const bare: ModelDefinition = {
        name: 'products',
        dataTests: ['dbt_utils.unique_combination_of_columns'],
      };
      const mapping: ModelDefinition = {
        name: 'products',
        dataTests: [
          {
            'dbt_utils.unique_combination_of_columns': {
              arguments: { combination_of_columns: ['id'] },
            },
          },
        ],
      };
      const neither: ModelDefinition = { name: 'products' };
      expect(hasUniqueCombinationTest(bare)).toBe(true);
      expect(hasUniqueCombinationTest(mapping)).toBe(true);
      expect(hasUniqueCombinationTest(neither)).toBe(false);
    });
  });
});
