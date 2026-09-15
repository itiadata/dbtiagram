import { describe, expect, it } from 'vitest';
import { applyEdit, EditError } from '../../../../src/dbt/edit';
import type { ModelDefinition } from '../../../../src/dbt/types';
import { readVirtualConstraints } from '../../../../src/dbt/virtual';

const names = (model: ModelDefinition): string[] => (model.columns ?? []).map((column) => column.name);

describe('column transfer edits', () => {
  it('reorders a source-order block within one model', () => {
    const models = [{ name: 'orders', columns: ['id', 'a', 'b', 'c'].map((name) => ({ name })) }];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'orders', destinationModel: 'orders', columns: ['b', 'a'], copy: false });
    expect(names(result.models[0])).toEqual(['id', 'c', 'a', 'b']);
  });

  it('moves complete column values before destination column', () => {
    const full = { name: 'full', dataType: 'int', description: 'desc', tests: ['legacy'], dataTests: ['unique'], config: { tags: ['x'] }, meta: { a: 1 }, extra: { quote: true } };
    const models: ModelDefinition[] = [{ name: 'source', columns: [full] }, { name: 'destination', columns: [{ name: 'x' }, { name: 'z' }] }];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['full'], before: 'z', copy: false });
    expect(result.models[0].columns).toEqual([]);
    expect(result.models[1].columns).toEqual([{ name: 'x' }, full, { name: 'z' }]);
  });

  it('copies without changing source or foreign keys', () => {
    const models: ModelDefinition[] = [
      { name: 'source', columns: [{ name: 'parent_id' }], constraints: [{ type: 'foreign_key', columns: ['parent_id'], to: "ref('parent')", toColumns: ['id'] }] },
      { name: 'parent', columns: [{ name: 'id' }] },
      { name: 'destination', columns: [] },
    ];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['parent_id'], copy: true });
    expect(result.models[0]).toBe(models[0]);
    expect(result.models[2].constraints).toBeUndefined();
  });

  it('allocates repeated moved and copied suffixes', () => {
    const destination = { name: 'destination', columns: ['id', 'id_MOVED', 'id_MOVED_2', 'id_COPIED'].map((name) => ({ name })) };
    const base = [{ name: 'source', columns: [{ name: 'id' }] }, destination];
    expect(names(applyEdit(base, { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['id'], copy: false }).models[1])).toContain('id_MOVED_3');
    expect(names(applyEdit(base, { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['id'], copy: true }).models[1])).toContain('id_COPIED_2');
  });

  it('splits an outgoing composite real FK', () => {
    const models: ModelDefinition[] = [
      { name: 'child', columns: [{ name: 'a' }, { name: 'b' }], constraints: [{ type: 'foreign_key', name: 'child_parent', columns: ['a', 'b'], to: "ref('parent')", toColumns: ['x', 'y'] }] },
      { name: 'parent', columns: [{ name: 'x' }, { name: 'y' }] },
      { name: 'archive', columns: [] },
    ];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'child', destinationModel: 'archive', columns: ['b'], copy: false }).models;
    expect(result[0].constraints).toContainEqual(expect.objectContaining({ name: 'child_parent', columns: ['a'], toColumns: ['x'] }));
    expect(result[2].constraints).toContainEqual({ type: 'foreign_key', columns: ['b'], to: "ref('parent')", toColumns: ['y'] });
  });

  it('splits and redirects an incoming virtual FK', () => {
    const child: ModelDefinition = { name: 'child', columns: [{ name: 'a' }, { name: 'b' }], config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "ref('parent')", columns: ['a', 'b'], to_columns: ['x', 'y'] }] } } } } };
    const models: ModelDefinition[] = [child, { name: 'parent', columns: [{ name: 'x' }, { name: 'y' }] }, { name: 'archive', columns: [] }];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'parent', destinationModel: 'archive', columns: ['y'], copy: false }).models;
    expect(readVirtualConstraints(result[0]).foreignKeys).toEqual([
      { to: "ref('parent')", columns: ['a'], toColumns: ['x'] },
      { to: "ref('archive')", columns: ['b'], toColumns: ['y'] },
    ]);
  });

  it('redirects both ends of a moved self-reference pair', () => {
    const models: ModelDefinition[] = [
      { name: 'source', columns: [{ name: 'id' }, { name: 'parent_id' }], constraints: [{ type: 'foreign_key', columns: ['parent_id'], to: "ref('source')", toColumns: ['id'] }] },
      { name: 'archive', columns: [] },
    ];
    const result = applyEdit(models, { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'archive', columns: ['id', 'parent_id'], copy: false }).models;
    expect(result[1].constraints).toContainEqual({ type: 'foreign_key', columns: ['parent_id'], to: "ref('archive')", toColumns: ['id'] });
  });

  it('moves real PK membership and enabled unique tests', () => {
    const source: ModelDefinition = {
      name: 'source', columns: [{ name: 'id', dataTests: ['not_null'] }, { name: 'tenant', dataTests: ['not_null'] }],
      constraints: [{ type: 'primary_key', columns: ['id', 'tenant'] }],
      dataTests: [{ 'dbt_utils.unique_combination_of_columns': { arguments: { combination_of_columns: ['id', 'tenant'] } } }],
    };
    const result = applyEdit([source, { name: 'destination', columns: [] }], { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['tenant'], copy: false }).models;
    expect(result[0].constraints).toContainEqual({ type: 'primary_key', columns: ['id'] });
    expect(result[1].constraints).toContainEqual({ type: 'primary_key', columns: ['tenant'] });
    expect(result[1].columns?.[0].dataTests).toContain('not_null');
    expect(result[1].dataTests).toBeDefined();
  });

  it('copies PK membership while preserving source', () => {
    const source: ModelDefinition = { name: 'source', columns: [{ name: 'tenant', dataTests: ['not_null'] }], constraints: [{ type: 'primary_key', columns: ['tenant'] }] };
    const result = applyEdit([source, { name: 'destination', columns: [] }], { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['tenant'], copy: true }).models;
    expect(result[0]).toBe(source);
    expect(result[1].constraints).toContainEqual({ type: 'primary_key', columns: ['tenant'] });
  });

  it('destination PK settings win', () => {
    const source: ModelDefinition = { name: 'source', columns: [{ name: 'id', dataTests: ['not_null'] }], constraints: [{ type: 'primary_key', columns: ['id'] }] };
    const destination: ModelDefinition = { name: 'destination', columns: [{ name: 'existing' }], config: { meta: { dbtiagram: { virtual: { primary_key: { columns: ['existing'] } } } } } };
    const result = applyEdit([source, destination], { kind: 'transferColumns', sourceModel: 'source', destinationModel: 'destination', columns: ['id'], copy: false }).models[1];
    expect(readVirtualConstraints(result).primaryKey?.columns).toEqual(['existing', 'id']);
    expect(result.constraints).toBeUndefined();
    expect(result.columns?.[1].dataTests).toBeUndefined();
  });

  it('adds a trimmed named typed column at the end', () => {
    const result = applyEdit([{ name: 'orders', columns: [{ name: 'id' }] }], { kind: 'addColumn', model: 'orders', name: ' status ', dataType: ' varchar ' });
    expect(result.models[0].columns).toEqual([{ name: 'id' }, { name: 'status', dataType: 'varchar' }]);
  });

  it('rejects incomplete and duplicate new columns', () => {
    const models = [{ name: 'orders', columns: [{ name: 'id' }] }];
    expect(() => applyEdit(models, { kind: 'addColumn', model: 'orders', name: 'x', dataType: '' })).toThrowError(new EditError('Column name and data type are required'));
    expect(() => applyEdit(models, { kind: 'addColumn', model: 'orders', name: 'id', dataType: 'int' })).toThrowError(new EditError('A column named "id" already exists in model "orders"'));
  });
});
