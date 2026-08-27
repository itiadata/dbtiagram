import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';

describe('applyEdit', () => {
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
