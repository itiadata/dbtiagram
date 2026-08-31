import { describe, expect, it } from 'vitest';
import {
  COLUMN_KEY_ORDER,
  MODEL_KEY_ORDER,
  insertionIndex,
} from '../../../../src/dbt/merge/order';

describe('insertionIndex (model level)', () => {
  it('inserts data_tests after description', () => {
    expect(
      insertionIndex(['name', 'description', 'tags', 'columns'], 'data_tests', MODEL_KEY_ORDER),
    ).toBe(2);
  });

  it('inserts constraints after data_tests', () => {
    expect(
      insertionIndex(
        ['name', 'description', 'data_tests', 'tags', 'columns'],
        'constraints',
        MODEL_KEY_ORDER,
      ),
    ).toBe(3);
  });

  it('pins columns last', () => {
    expect(insertionIndex(['name', 'tags'], 'columns', MODEL_KEY_ORDER)).toBe(2);
  });

  it('places an unknown model key before columns', () => {
    expect(insertionIndex(['name', 'columns'], 'config', MODEL_KEY_ORDER)).toBe(1);
  });

  it('places a preferred key before a later preferred key when nothing precedes it', () => {
    expect(insertionIndex(['constraints', 'columns'], 'description', MODEL_KEY_ORDER)).toBe(0);
  });
});

describe('insertionIndex (column level)', () => {
  it('inserts data_type between name and description', () => {
    expect(
      insertionIndex(['name', 'description', 'custom_tag'], 'data_type', COLUMN_KEY_ORDER),
    ).toBe(1);
  });

  it('appends an unmanaged column key', () => {
    expect(insertionIndex(['name', 'description'], 'data_tests', COLUMN_KEY_ORDER)).toBe(2);
  });
});
