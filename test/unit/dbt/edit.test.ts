import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../src/dbt/edit';
import type { ModelDefinition } from '../../../src/dbt/types';

const models: ModelDefinition[] = [{ name: 'orders', columns: [{ name: 'id' }] }];

describe('applyEdit', () => {
  it('adds a column to a model', () => {
    const { models: next, changed } = applyEdit(models, {
      kind: 'addColumn',
      model: 'orders',
      column: { name: 'total_amount', dataType: 'numeric', description: 'Order total' },
    });

    expect(changed).toBe(true);
    expect(next[0].columns).toEqual([
      { name: 'id' },
      { name: 'total_amount', dataType: 'numeric', description: 'Order total' },
    ]);
  });

  it('does not mutate the input models', () => {
    applyEdit(models, {
      kind: 'addColumn',
      model: 'orders',
      column: { name: 'x' },
    });
    expect(models[0].columns).toEqual([{ name: 'id' }]);
  });

  it('rejects duplicate column names', () => {
    expect(() =>
      applyEdit(models, { kind: 'addColumn', model: 'orders', column: { name: 'id' } }),
    ).toThrow(EditError);
  });

  it('rejects empty column names', () => {
    expect(() =>
      applyEdit(models, { kind: 'addColumn', model: 'orders', column: { name: '  ' } }),
    ).toThrow(EditError);
  });

  it('throws when the model does not exist', () => {
    expect(() =>
      applyEdit(models, { kind: 'addColumn', model: 'missing', column: { name: 'x' } }),
    ).toThrow(EditError);
  });

  it('updates a column description', () => {
    const { models: next } = applyEdit(models, {
      kind: 'setColumnDescription',
      model: 'orders',
      column: 'id',
      description: 'Surrogate key',
    });
    expect(next[0].columns?.[0].description).toBe('Surrogate key');
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
