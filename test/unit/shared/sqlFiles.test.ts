import { describe, it, expect } from 'vitest';
import {
  sqlGlobForModelGlob,
  modelNameFromSqlPath,
  indexSqlPaths,
  DEFAULT_SQL_GLOB,
  resolveSqlDiagram,
  sqlDiagramResolutionError,
} from '../../../src/shared/sqlFiles';

describe('sqlGlobForModelGlob', () => {
  it('swaps a .yml tail for .sql', () => {
    expect(sqlGlobForModelGlob('**/models/**/*.yml')).toBe('**/models/**/*.sql');
  });

  it('swaps a .yaml tail', () => {
    expect(sqlGlobForModelGlob('**/models/**/*.yaml')).toBe('**/models/**/*.sql');
  });

  it('is case-insensitive on the extension', () => {
    expect(sqlGlobForModelGlob('**/models/**/*.YML')).toBe('**/models/**/*.sql');
  });

  it('falls back for an unrecognised glob', () => {
    expect(sqlGlobForModelGlob('**/schema_*')).toBe(DEFAULT_SQL_GLOB);
  });
});

describe('resolveSqlDiagram', () => {
  const files = [
    { uri: 'a.yml', models: ['customers'] },
    { uri: 'b.yml', models: ['orders', 'items'] },
  ];

  it('resolves a SQL path to its one declaring YAML file', () => {
    expect(resolveSqlDiagram('C:/repo/models/orders.sql', files)).toEqual({ kind: 'resolved', modelName: 'orders', modelYmlPath: 'b.yml' });
  });

  it('reports a missing YAML definition', () => {
    const result = resolveSqlDiagram('orphan.sql', files);
    expect(result).toEqual({ kind: 'notFound', modelName: 'orphan' });
    if (result.kind !== 'resolved') expect(sqlDiagramResolutionError(result)).toBe('Cannot open dbt Diagram for "orphan": no model YAML definition was found.');
  });

  it('rejects multiple declaring YAML files deterministically', () => {
    const result = resolveSqlDiagram('duplicate.sql', [
      { uri: '/repo/b/schema.yml', models: ['duplicate'] },
      { uri: '/repo/a/schema.yml', models: ['duplicate'] },
    ]);
    expect(result).toEqual({ kind: 'ambiguous', modelName: 'duplicate', modelYmlPaths: ['/repo/a/schema.yml', '/repo/b/schema.yml'] });
    if (result.kind !== 'resolved') expect(sqlDiagramResolutionError(result)).toBe('Cannot open dbt Diagram for "duplicate": multiple model YAML files define it: /repo/a/schema.yml, /repo/b/schema.yml.');
  });

  it('rejects a non-SQL path', () => {
    const result = resolveSqlDiagram('orders.py', files);
    expect(result).toEqual({ kind: 'invalidSqlPath' });
    if (result.kind !== 'resolved') expect(sqlDiagramResolutionError(result)).toBe('Open a dbt model SQL file first.');
  });
});

describe('modelNameFromSqlPath', () => {
  it('reads the base name (posix)', () => {
    expect(modelNameFromSqlPath('/repo/models/marts/orders.sql')).toBe('orders');
  });

  it('reads the base name (windows)', () => {
    expect(modelNameFromSqlPath('C:\\repo\\models\\marts\\orders.sql')).toBe('orders');
  });

  it('rejects a non-sql path', () => {
    expect(modelNameFromSqlPath('/repo/models/marts/orders.yml')).toBeNull();
  });

  it('accepts an uppercase extension', () => {
    expect(modelNameFromSqlPath('/repo/models/ORDERS.SQL')).toBe('ORDERS');
  });
});

describe('indexSqlPaths', () => {
  it('maps names to paths', () => {
    expect(indexSqlPaths(['/a/orders.sql', '/b/customers.sql'])).toEqual(
      new Map([
        ['orders', '/a/orders.sql'],
        ['customers', '/b/customers.sql'],
      ]),
    );
  });

  it('keeps the first path for a duplicated name', () => {
    expect(indexSqlPaths(['/a/orders.sql', '/b/orders.sql'])).toEqual(
      new Map([['orders', '/a/orders.sql']]),
    );
  });

  it('skips non-sql paths', () => {
    expect(indexSqlPaths(['/a/orders.yml', '/a/orders.sql'])).toEqual(
      new Map([['orders', '/a/orders.sql']]),
    );
  });
});
