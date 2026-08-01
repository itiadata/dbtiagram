import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../src/dbt/edit';
import { readVirtualConstraints } from '../../../src/dbt/virtual';
import type { ForeignKeyDescriptor, ModelDefinition } from '../../../src/dbt/types';

/** The virtual FK list of a model via the pure read API (or [] when absent). */
function virtualFks(model: ModelDefinition): unknown[] {
  return readVirtualConstraints(model).foreignKeys ?? [];
}

const models: ModelDefinition[] = [
  { name: 'orders', columns: [{ name: 'id' }, { name: 'customer_id' }] },
  { name: 'customers', columns: [{ name: 'id' }] },
];

describe('applyEdit', () => {
  describe('setModelName', () => {
    it('renames a model', () => {
      const { models: next, changed } = applyEdit(models, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });

      expect(changed).toBe(true);
      expect(next.map((m) => m.name)).toEqual(['orders_v2', 'customers']);
      // Rename keeps the model's columns.
      expect(next[0].columns).toEqual([{ name: 'id' }, { name: 'customer_id' }]);
    });

    it('rejects renaming to another existing model name', () => {
      expect(() =>
        applyEdit(models, { kind: 'setModelName', model: 'orders', name: 'customers' }),
      ).toThrow(EditError);
    });

    it('rejects empty model names', () => {
      expect(() =>
        applyEdit(models, { kind: 'setModelName', model: 'orders', name: '   ' }),
      ).toThrow(EditError);
    });

    it('is a no-op when the name is unchanged and keeps object identity', () => {
      const { models: next, changed } = applyEdit(models, {
        kind: 'setModelName',
        model: 'orders',
        name: ' orders ',
      });
      expect(changed).toBe(true);
      expect(next[0]).toBe(models[0]);
    });

    it('throws when the model does not exist', () => {
      expect(() =>
        applyEdit(models, { kind: 'setModelName', model: 'missing', name: 'x' }),
      ).toThrow(EditError);
    });

    it('re-points FK constraints that reference the renamed model', () => {
      const withFk: ModelDefinition[] = [
        { name: 'orders' },
        {
          name: 'order_items',
          constraints: [
            { type: 'foreign_key', columns: ['order_id'], to: "ref('orders')", toColumns: ['id'] },
          ],
        },
        { name: 'customers', constraints: [{ type: 'primary_key', columns: ['id'] }] },
      ];
      const { models: next } = applyEdit(withFk, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      expect(next[1].constraints?.[0].to).toBe("ref('orders_v2')");
      // The rest of the constraint is untouched.
      expect(next[1].constraints?.[0].columns).toEqual(['order_id']);
      expect(next[1].constraints?.[0].toColumns).toEqual(['id']);
      // Non-FK constraints and unrelated models keep object identity.
      expect(next[2]).toBe(withFk[2]);
    });

    it('re-points self-referencing FK constraints', () => {
      const withSelfFk: ModelDefinition[] = [
        {
          name: 'orders',
          constraints: [
            {
              type: 'foreign_key',
              columns: ['parent_id'],
              to: "ref('orders')",
              toColumns: ['id'],
            },
          ],
        },
      ];
      const { models: next } = applyEdit(withSelfFk, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      expect(next[0].constraints?.[0].to).toBe("ref('orders_v2')");
    });

    it('re-points package-qualified refs and leaves others untouched', () => {
      const withFks: ModelDefinition[] = [
        { name: 'orders' },
        {
          name: 'audit',
          constraints: [
            { type: 'foreign_key', columns: ['a'], to: "ref('s_pp', 'orders')", toColumns: ['b'] },
            { type: 'foreign_key', columns: ['c'], to: 'orders', toColumns: ['d'] },
            { type: 'foreign_key', columns: ['e'], to: "ref('customers')", toColumns: ['f'] },
          ],
        },
      ];
      const { models: next } = applyEdit(withFks, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      expect(next[1].constraints?.[0].to).toBe("ref('s_pp', 'orders_v2')");
      // Unparseable to string cannot be re-pointed.
      expect(next[1].constraints?.[1].to).toBe('orders');
      // Ref to a different model is untouched.
      expect(next[1].constraints?.[2].to).toBe("ref('customers')");
    });

    it('re-points virtual FK refs in the meta block (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        { name: 'orders' },
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['order_id'], to_columns: ['id'] }],
                },
              },
            },
          },
        },
        { name: 'customers', config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "ref('customers')", columns: ['x'], to_columns: ['y'] }] } } } } },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      // The virtual FK pointing at the renamed model is re-pointed; its
      // columns/to_columns are untouched.
      expect(virtualFks(next[1])).toEqual([
        { to: "ref('orders_v2')", columns: ['order_id'], toColumns: ['id'] },
      ]);
      // An unrelated model keeps object identity.
      expect(next[2]).toBe(withVirtual[2]);
    });

    it('re-points a self-referencing virtual FK on the renamed model (spec 08 fix (j))', () => {
      const withSelfVirtual: ModelDefinition[] = [
        {
          name: 'orders',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['parent_id'], to_columns: ['id'] }],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withSelfVirtual, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      expect(next[0].name).toBe('orders_v2');
      expect(virtualFks(next[0])).toEqual([
        { to: "ref('orders_v2')", columns: ['parent_id'], toColumns: ['id'] },
      ]);
    });

    it('leaves unparseable virtual FK to refs untouched on a model rename (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        { name: 'orders' },
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: { foreign_keys: [{ to: 'orders', columns: ['order_id'], to_columns: ['id'] }] },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setModelName',
        model: 'orders',
        name: 'orders_v2',
      });
      expect(virtualFks(next[1])).toEqual([
        { to: 'orders', columns: ['order_id'], toColumns: ['id'] },
      ]);
    });
  });

  describe('setModelDescription', () => {
    it('sets a description stored as typed', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setModelDescription',
        model: 'orders',
        description: 'One row per order',
      });
      expect(next[0].description).toBe('One row per order');
    });

    it('keeps internal whitespace as typed', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setModelDescription',
        model: 'orders',
        description: '  Two spaces  ',
      });
      expect(next[0].description).toBe('  Two spaces  ');
    });

    it('clears the key on a whitespace-only description', () => {
      const withDescription: ModelDefinition[] = [
        { name: 'orders', description: 'One row per order' },
      ];
      const { models: next } = applyEdit(withDescription, {
        kind: 'setModelDescription',
        model: 'orders',
        description: '   ',
      });
      expect(next[0].description).toBeUndefined();
    });

    it('is a no-op when clearing an absent description', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setModelDescription',
        model: 'orders',
        description: '',
      });
      expect(next[0]).toBe(models[0]);
    });
  });

  describe('setColumnName', () => {
    it('renames a column', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'id',
        name: 'order_id',
      });
      expect(next[0].columns?.map((c) => c.name)).toEqual(['order_id', 'customer_id']);
    });

    it('rejects renaming to another column name in the same model', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setColumnName',
          model: 'orders',
          column: 'id',
          name: 'customer_id',
        }),
      ).toThrow(EditError);
    });

    it('rejects empty column names', () => {
      expect(() =>
        applyEdit(models, { kind: 'setColumnName', model: 'orders', column: 'id', name: '  ' }),
      ).toThrow(EditError);
    });

    it('throws when the column does not exist', () => {
      expect(() =>
        applyEdit(models, { kind: 'setColumnName', model: 'orders', column: 'nope', name: 'x' }),
      ).toThrow(EditError);
    });

    it('allows renaming a column to a name used in another model', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'id',
        name: 'id',
      });
      expect(next[0].columns?.[0].name).toBe('id');
    });

    it('keeps object identity when the column rename is a no-op', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'id',
        name: ' id ',
      });
      expect(next[0]).toBe(models[0]);
    });

    it('re-points FK to_columns that target the renamed column', () => {
      const withFk: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'order_id' }] },
        {
          name: 'staging_orders',
          constraints: [
            {
              type: 'foreign_key',
              columns: ['order_id'],
              to: "ref('orders')",
              toColumns: ['order_id'],
            },
          ],
        },
      ];
      const { models: next } = applyEdit(withFk, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(next[0].columns?.map((c) => c.name)).toEqual(['order_key']);
      expect(next[1].constraints?.[0].toColumns).toEqual(['order_key']);
      // The other model's own (source) columns are untouched.
      expect(next[1].constraints?.[0].columns).toEqual(['order_id']);
    });

    it('re-points FK source columns declared on the renamed model', () => {
      const withFk: ModelDefinition[] = [
        {
          name: 'orders',
          columns: [{ name: 'customer_id' }],
          constraints: [
            {
              type: 'foreign_key',
              columns: ['customer_id'],
              to: "ref('customers')",
              toColumns: ['id'],
            },
          ],
        },
        { name: 'customers', columns: [{ name: 'id' }] },
      ];
      const { models: next } = applyEdit(withFk, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'customer_id',
        name: 'customer_key',
      });
      expect(next[0].constraints?.[0].columns).toEqual(['customer_key']);
      expect(next[0].constraints?.[0].toColumns).toEqual(['id']);
      // Unrelated model keeps object identity.
      expect(next[1]).toBe(withFk[1]);
    });

    it('re-points both sides of a self-referencing FK', () => {
      const withSelfFk: ModelDefinition[] = [
        {
          name: 'orders',
          columns: [{ name: 'order_id' }],
          constraints: [
            {
              type: 'foreign_key',
              columns: ['order_id'],
              to: "ref('orders')",
              toColumns: ['order_id'],
            },
          ],
        },
      ];
      const { models: next } = applyEdit(withSelfFk, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(next[0].constraints?.[0].columns).toEqual(['order_key']);
      expect(next[0].constraints?.[0].toColumns).toEqual(['order_key']);
    });

    it('leaves non-FK and unparseable-target constraints untouched on a column rename', () => {
      const withFk: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'order_id' }] },
        {
          name: 'order_items',
          constraints: [
            {
              type: 'foreign_key',
              columns: ['order_id'],
              to: "ref('orders')",
              toColumns: ['order_id'],
            },
            { type: 'primary_key', columns: ['order_id'] },
            { type: 'foreign_key', columns: ['x'], to: 'orders', toColumns: ['order_id'] },
          ],
        },
      ];
      const { models: next } = applyEdit(withFk, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      const constraints = next[1].constraints ?? [];
      expect(constraints[0].toColumns).toEqual(['order_key']);
      expect(constraints[1]).toEqual({ type: 'primary_key', columns: ['order_id'] });
      // A to value that is not a parseable ref cannot name the target — untouched.
      expect(constraints[2].toColumns).toEqual(['order_id']);
    });

    it('re-points virtual FK to_columns on the target model rename (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'order_id' }] },
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] }],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(next[0].columns?.map((c) => c.name)).toEqual(['order_key']);
      // The virtual FK's to_columns follow the renamed target column; its own
      // (source) columns are untouched.
      expect(virtualFks(next[1])).toEqual([
        { to: "ref('orders')", columns: ['order_id'], toColumns: ['order_key'] },
      ]);
    });

    it('re-points virtual FK source columns declared on the renamed model (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        {
          name: 'order_items',
          columns: [{ name: 'order_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['order_id'], to_columns: ['id'] }],
                },
              },
            },
          },
        },
        { name: 'orders', columns: [{ name: 'id' }] },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setColumnName',
        model: 'order_items',
        column: 'order_id',
        name: 'item_key',
      });
      expect(virtualFks(next[0])).toEqual([
        { to: "ref('orders')", columns: ['item_key'], toColumns: ['id'] },
      ]);
      // Unrelated model keeps object identity.
      expect(next[1]).toBe(withVirtual[1]);
    });

    it('re-points both sides of a self-referencing virtual FK (spec 08 fix (j))', () => {
      const withSelfVirtual: ModelDefinition[] = [
        {
          name: 'orders',
          columns: [{ name: 'order_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] }],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withSelfVirtual, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(virtualFks(next[0])).toEqual([
        { to: "ref('orders')", columns: ['order_key'], toColumns: ['order_key'] },
      ]);
    });

    it('leaves virtual FK to_columns untouched when the to ref is unparseable (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'order_id' }] },
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: 'orders', columns: ['order_id'], to_columns: ['order_id'] }],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(virtualFks(next[1])).toEqual([
        { to: 'orders', columns: ['order_id'], toColumns: ['order_id'] },
      ]);
    });

    it('keeps object identity when no virtual FK references the renamed column (spec 08 fix (j))', () => {
      const withVirtual: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'order_id' }] },
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('customers')", columns: ['customer_id'], to_columns: ['id'] }],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(withVirtual, {
        kind: 'setColumnName',
        model: 'orders',
        column: 'order_id',
        name: 'order_key',
      });
      expect(next[1]).toBe(withVirtual[1]);
    });
  });

  describe('setColumnDataType', () => {
    it('sets a data type', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setColumnDataType',
        model: 'orders',
        column: 'id',
        dataType: 'bigint',
      });
      expect(next[0].columns?.[0].dataType).toBe('bigint');
    });

    it('trims the value and clears the key on whitespace-only input', () => {
      const withType: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'id', dataType: 'integer' }] },
      ];
      const { models: next } = applyEdit(withType, {
        kind: 'setColumnDataType',
        model: 'orders',
        column: 'id',
        dataType: '   ',
      });
      expect(next[0].columns?.[0].dataType).toBeUndefined();
    });

    it('throws when the column does not exist', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setColumnDataType',
          model: 'orders',
          column: 'nope',
          dataType: 'numeric',
        }),
      ).toThrow(EditError);
    });
  });

  describe('setColumnDescription', () => {
    it('sets a description stored as typed', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setColumnDescription',
        model: 'orders',
        column: 'id',
        description: 'Surrogate key',
      });
      expect(next[0].columns?.[0].description).toBe('Surrogate key');
    });

    it('clears the key on a whitespace-only description', () => {
      const withDescription: ModelDefinition[] = [
        { name: 'orders', columns: [{ name: 'id', description: 'Primary key' }] },
      ];
      const { models: next } = applyEdit(withDescription, {
        kind: 'setColumnDescription',
        model: 'orders',
        column: 'id',
        description: '   ',
      });
      expect(next[0].columns?.[0].description).toBeUndefined();
    });

    it('throws when updating a missing column', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setColumnDescription',
          model: 'orders',
          column: 'nope',
          description: 'x',
        }),
      ).toThrow(EditError);
    });
  });

  it('does not mutate the input models', () => {
    applyEdit(models, { kind: 'setModelName', model: 'orders', name: 'orders_v2' });
    expect(models[0].name).toBe('orders');
    expect(models[0].columns).toEqual([{ name: 'id' }, { name: 'customer_id' }]);
  });

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

  describe('setForeignKeyTarget', () => {
    const models: ModelDefinition[] = [
      {
        name: 'order_items',
        columns: [{ name: 'order_id' }, { name: 'customer_id' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['order_id'],
            to: "ref('orders')",
            toColumns: ['order_id'],
          },
        ],
      },
      { name: 'orders', columns: [{ name: 'order_id' }] },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
    ];

    const fk: ForeignKeyDescriptor = {
      target: 'orders',
      to: "ref('orders')",
      columns: ['order_id'],
      toColumns: ['order_id'],
      virtual: false,
    };

    it('rewrites a real FK target to the canonical ref', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyTarget',
        model: 'order_items',
        fk,
        target: 'customers',
      });
      expect(next[0].constraints?.[0]).toEqual({
        type: 'foreign_key',
        columns: ['order_id'],
        to: "ref('customers')",
        toColumns: ['order_id'],
      });
      expect(next[1]).toBe(models[1]);
    });

    it('rewrites a virtual FK target in the meta block', () => {
      const virtual: ModelDefinition[] = [
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [
                    { to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] },
                  ],
                },
              },
            },
          },
        },
        { name: 'orders' },
        { name: 'customers' },
      ];
      const { models: next } = applyEdit(virtual, {
        kind: 'setForeignKeyTarget',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: true },
        target: 'customers',
      });
      expect(next[0].config).toEqual({
        meta: {
          dbtiagram: {
            virtual: {
              foreign_keys: [
                { to: "ref('customers')", columns: ['order_id'], to_columns: ['order_id'] },
              ],
            },
          },
        },
      });
    });

    it('throws when the target model does not exist', () => {
      expect(() =>
        applyEdit(models, { kind: 'setForeignKeyTarget', model: 'order_items', fk, target: 'ghost' }),
      ).toThrow(EditError);
    });

    it('is a no-op (identity) when the target is unchanged', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyTarget',
        model: 'order_items',
        fk,
        target: 'orders',
      });
      expect(next[0]).toBe(models[0]);
    });
  });

  describe('setForeignKeyColumns', () => {
    const models: ModelDefinition[] = [
      {
        name: 'order_items',
        columns: [{ name: 'order_id' }, { name: 'customer_id' }, { name: 'product_id' }],
        constraints: [
          {
            type: 'foreign_key',
            columns: ['order_id'],
            to: "ref('orders')",
            toColumns: ['order_id'],
          },
        ],
      },
      { name: 'orders', columns: [{ name: 'order_id' }, { name: 'customer_id' }] },
    ];

    const fk: ForeignKeyDescriptor = {
      target: 'orders',
      to: "ref('orders')",
      columns: ['order_id'],
      toColumns: ['order_id'],
      virtual: false,
    };

    it('sets the pair arrays on a real FK', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyColumns',
        model: 'order_items',
        fk,
        columns: ['order_id', 'customer_id'],
        toColumns: ['order_id', 'customer_id'],
      });
      expect(next[0].constraints?.[0]).toEqual({
        type: 'foreign_key',
        columns: ['order_id', 'customer_id'],
        to: "ref('orders')",
        toColumns: ['order_id', 'customer_id'],
      });
    });

    it('sets the pair arrays on a virtual FK', () => {
      const virtual: ModelDefinition[] = [
        {
          name: 'order_items',
          columns: [{ name: 'order_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [
                    { to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] },
                  ],
                },
              },
            },
          },
        },
        { name: 'orders', columns: [{ name: 'order_id' }] },
      ];
      const { models: next } = applyEdit(virtual, {
        kind: 'setForeignKeyColumns',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: true },
        columns: ['order_id'],
        toColumns: ['order_id'],
      });
      expect(next[0].config).toEqual({
        meta: {
          dbtiagram: {
            virtual: { foreign_keys: [{ to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] }] },
          },
        },
      });
    });

    it('rejects emptying the pair arrays (spec 09 merged)', () => {
      const models: ModelDefinition[] = [
        {
          name: 'order_items',
          columns: [{ name: 'order_id' }],
          constraints: [
            {
              type: 'foreign_key',
              columns: ['order_id'],
              to: "ref('orders')",
              toColumns: ['order_id'],
            },
          ],
        },
        { name: 'orders', columns: [{ name: 'order_id' }] },
      ];
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyColumns',
          model: 'order_items',
          fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: false },
          columns: [],
          toColumns: [],
        }),
      ).toThrow(EditError);
    });

    it('throws when the pair arrays have different lengths', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyColumns',
          model: 'order_items',
          fk,
          columns: ['order_id'],
          toColumns: ['order_id', 'customer_id'],
        }),
      ).toThrow(EditError);
    });

    it('throws when a source column does not exist', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyColumns',
          model: 'order_items',
          fk,
          columns: ['nope'],
          toColumns: ['order_id'],
        }),
      ).toThrow(EditError);
    });

    it('throws when a target column does not exist on the target model', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyColumns',
          model: 'order_items',
          fk,
          columns: ['order_id'],
          toColumns: ['nope'],
        }),
      ).toThrow(EditError);
    });

    it('throws when the FK target is unparseable', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyColumns',
          model: 'order_items',
          fk: { target: undefined, to: 'not a ref', columns: ['order_id'], toColumns: ['order_id'], virtual: false },
          columns: ['order_id'],
          toColumns: ['order_id'],
        }),
      ).toThrow(EditError);
    });

    it('is a no-op (identity) when nothing changed', () => {
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyColumns',
        model: 'order_items',
        fk,
        columns: ['order_id'],
        toColumns: ['order_id'],
      });
      expect(next[0]).toBe(models[0]);
    });
  });

  describe('setForeignKeyVirtual', () => {
    it('converts a real FK to a virtual meta entry', () => {
      const models: ModelDefinition[] = [
        {
          name: 'order_items',
          constraints: [
            {
              type: 'foreign_key',
              columns: ['order_id'],
              to: "ref('orders')",
              toColumns: ['order_id'],
            },
          ],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyVirtual',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: false },
        virtual: true,
      });
      expect(next[0].constraints).toBeUndefined();
      expect(next[0].config).toEqual({
        meta: {
          dbtiagram: {
            virtual: {
              foreign_keys: [
                { to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] },
              ],
            },
          },
        },
      });
    });

    it('converts a virtual FK back to a real constraint', () => {
      const models: ModelDefinition[] = [
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [
                    { to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] },
                  ],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'setForeignKeyVirtual',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: true },
        virtual: false,
      });
      expect(next[0].config).toBeUndefined();
      expect(next[0].constraints).toEqual([
        {
          type: 'foreign_key',
          columns: ['order_id'],
          to: "ref('orders')",
          toColumns: ['order_id'],
        },
      ]);
    });

    it('rejects converting a zero-pair real FK (spec 09 merged)', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          constraints: [{ type: 'foreign_key', columns: [], to: "ref('customers')", toColumns: [] }],
        },
      ];
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyVirtual',
          model: 'products',
          fk: { target: 'customers', to: "ref('customers')", columns: [], toColumns: [], virtual: false },
          virtual: true,
        }),
      ).toThrow(EditError);
    });

    it('rejects converting a zero-pair virtual FK (spec 09 merged)', () => {
      const models: ModelDefinition[] = [
        {
          name: 'products',
          config: {
            meta: {
              dbtiagram: {
                virtual: { foreign_keys: [{ to: "ref('customers')", columns: [], to_columns: [] }] },
              },
            },
          },
        },
      ];
      expect(() =>
        applyEdit(models, {
          kind: 'setForeignKeyVirtual',
          model: 'products',
          fk: { target: 'customers', to: "ref('customers')", columns: [], toColumns: [], virtual: true },
          virtual: false,
        }),
      ).toThrow(EditError);
    });
  });

  describe('createForeignKey', () => {
    const models: ModelDefinition[] = [
      {
        name: 'products',
        columns: [{ name: 'product_id' }, { name: 'name' }],
      },
      { name: 'customers', columns: [{ name: 'customer_id' }] },
    ];

    it('appends a real FK constraint with the initial column pairs', () => {
      const { models: next } = applyEdit(models, {
        kind: 'createForeignKey',
        model: 'products',
        target: 'customers',
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: false,
      });
      expect(next[0].constraints).toEqual([
        { type: 'foreign_key', columns: ['product_id'], to: "ref('customers')", toColumns: ['customer_id'] },
      ]);
    });

    it('appends a virtual FK to the meta block, creating it when absent', () => {
      const { models: next } = applyEdit(models, {
        kind: 'createForeignKey',
        model: 'products',
        target: 'customers',
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: true,
      });
      expect(next[0].constraints).toBeUndefined();
      expect(next[0].config).toEqual({
        meta: {
          dbtiagram: {
            virtual: {
              foreign_keys: [{ to: "ref('customers')", columns: ['product_id'], to_columns: ['customer_id'] }],
            },
          },
        },
      });
    });

    it('appends a second virtual FK to an existing meta block', () => {
      const withOne: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [{ to: "ref('orders')", columns: ['product_id'], to_columns: ['order_id'] }],
                },
              },
            },
          },
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
        { name: 'orders', columns: [{ name: 'order_id' }] },
      ];
      const { models: next } = applyEdit(withOne, {
        kind: 'createForeignKey',
        model: 'products',
        target: 'customers',
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: true,
      });
      expect(next[0].config).toEqual({
        meta: {
          dbtiagram: {
            virtual: {
              foreign_keys: [
                { to: "ref('orders')", columns: ['product_id'], to_columns: ['order_id'] },
                { to: "ref('customers')", columns: ['product_id'], to_columns: ['customer_id'] },
              ],
            },
          },
        },
      });
    });

    it('rejects zero column pairs', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'createForeignKey',
          model: 'products',
          target: 'customers',
          columns: [],
          toColumns: [],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('rejects unequal pair lengths', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'createForeignKey',
          model: 'products',
          target: 'customers',
          columns: ['product_id', 'name'],
          toColumns: ['customer_id'],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('rejects an unknown target model', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'createForeignKey',
          model: 'products',
          target: 'ghost',
          columns: ['product_id'],
          toColumns: ['customer_id'],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('rejects a source column that does not exist on the model', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'createForeignKey',
          model: 'products',
          target: 'customers',
          columns: ['nope'],
          toColumns: ['customer_id'],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('rejects a target column that does not exist on the target model', () => {
      expect(() =>
        applyEdit(models, {
          kind: 'createForeignKey',
          model: 'products',
          target: 'customers',
          columns: ['product_id'],
          toColumns: ['nope'],
          virtual: false,
        }),
      ).toThrow(EditError);
    });

    it('is a no-op (identity) when an identical FK already exists', () => {
      const withFk: ModelDefinition[] = [
        {
          name: 'products',
          columns: [{ name: 'product_id' }],
          constraints: [
            { type: 'foreign_key', columns: ['product_id'], to: "ref('customers')", toColumns: ['customer_id'] },
          ],
        },
        { name: 'customers', columns: [{ name: 'customer_id' }] },
      ];
      const { models: next } = applyEdit(withFk, {
        kind: 'createForeignKey',
        model: 'products',
        target: 'customers',
        columns: ['product_id'],
        toColumns: ['customer_id'],
        virtual: false,
      });
      expect(next[0]).toBe(withFk[0]);
    });
  });

  describe('removeForeignKey', () => {
    it('removes a matching real FK and leaves others', () => {
      const models: ModelDefinition[] = [
        {
          name: 'order_items',
          constraints: [
            { type: 'foreign_key', columns: ['order_id'], to: "ref('orders')", toColumns: ['order_id'] },
            { type: 'foreign_key', columns: ['product_id'], to: "ref('products')", toColumns: ['product_id'] },
          ],
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'removeForeignKey',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: false },
      });
      expect(next[0].constraints).toEqual([
        { type: 'foreign_key', columns: ['product_id'], to: "ref('products')", toColumns: ['product_id'] },
      ]);
    });

    it('removes a matching virtual FK from the meta block', () => {
      const models: ModelDefinition[] = [
        {
          name: 'order_items',
          config: {
            meta: {
              dbtiagram: {
                virtual: {
                  foreign_keys: [
                    { to: "ref('orders')", columns: ['order_id'], to_columns: ['order_id'] },
                  ],
                },
              },
            },
          },
        },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'removeForeignKey',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: true },
      });
      expect(next[0].config).toBeUndefined();
    });

    it('is a no-op (identity) when nothing matches', () => {
      const models: ModelDefinition[] = [
        { name: 'order_items', constraints: [] },
      ];
      const { models: next } = applyEdit(models, {
        kind: 'removeForeignKey',
        model: 'order_items',
        fk: { target: 'orders', to: "ref('orders')", columns: ['order_id'], toColumns: ['order_id'], virtual: false },
      });
      expect(next[0]).toBe(models[0]);
    });
  });
});
