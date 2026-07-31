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
