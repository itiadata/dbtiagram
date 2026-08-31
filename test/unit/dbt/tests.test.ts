import { describe, expect, it } from 'vitest';
import { dataTestName, columnTestNames } from '../../../src/dbt/tests';
import type { ModelColumn } from '../../../src/dbt/types';

describe('dataTestName', () => {
  it('names a bare string entry', () => {
    expect(dataTestName('unique')).toBe('unique');
  });

  it('names a mapping entry by its first key', () => {
    expect(dataTestName({ accepted_values: { values: ['a'] } })).toBe('accepted_values');
  });

  it('returns undefined for an empty mapping', () => {
    expect(dataTestName({})).toBeUndefined();
  });

  it('returns undefined for an empty string entry', () => {
    expect(dataTestName('')).toBeUndefined();
  });
});

describe('columnTestNames', () => {
  it('concatenates legacy tests then data_tests', () => {
    const column: ModelColumn = {
      name: 'c',
      tests: ['not_null'],
      dataTests: ['unique'],
    };
    expect(columnTestNames(column, false)).toEqual(['not_null', 'unique']);
  });

  it('collapses duplicates keeping the first', () => {
    const column: ModelColumn = {
      name: 'c',
      tests: ['unique'],
      dataTests: ['unique'],
    };
    expect(columnTestNames(column, false)).toEqual(['unique']);
  });

  it('drops the PK-owned not_null', () => {
    const column: ModelColumn = {
      name: 'c',
      dataTests: ['not_null'],
    };
    expect(columnTestNames(column, true)).toEqual([]);
  });

  it('keeps other tests on a PK column', () => {
    const column: ModelColumn = {
      name: 'c',
      dataTests: ['not_null', 'unique'],
    };
    expect(columnTestNames(column, true)).toEqual(['unique']);
  });

  it('keeps a second not_null on a PK column', () => {
    const column: ModelColumn = {
      name: 'c',
      dataTests: ['not_null', 'not_null'],
    };
    expect(columnTestNames(column, true)).toEqual(['not_null']);
  });

  it('keeps not_null on a non-PK column', () => {
    const column: ModelColumn = {
      name: 'c',
      dataTests: ['not_null'],
    };
    expect(columnTestNames(column, false)).toEqual(['not_null']);
  });

  it('skips unusable entries', () => {
    const column: ModelColumn = {
      name: 'c',
      dataTests: [{}, 'unique'],
    };
    expect(columnTestNames(column, false)).toEqual(['unique']);
  });
});
