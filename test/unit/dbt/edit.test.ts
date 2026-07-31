import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../src/dbt/edit';
import type { ModelDefinition } from '../../../src/dbt/types';

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
});
