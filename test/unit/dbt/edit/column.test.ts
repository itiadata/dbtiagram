import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';
import { models, virtualFks } from '../../helpers/models';

describe('applyEdit', () => {
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
      // A to value that is not a parseable ref cannot name the target â€” untouched.
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

});
