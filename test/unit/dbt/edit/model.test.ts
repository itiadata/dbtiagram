import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';
import { models, virtualFks } from '../../helpers/models';

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

});
