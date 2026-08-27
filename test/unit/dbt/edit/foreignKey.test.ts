import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ForeignKeyDescriptor, ModelDefinition } from '../../../../src/dbt/types';

describe('applyEdit', () => {
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

});
