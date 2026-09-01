import { describe, it, expect } from 'vitest';
import {
  sqlGlobForModelGlob,
  modelNameFromSqlPath,
  indexSqlPaths,
  DEFAULT_SQL_GLOB,
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
