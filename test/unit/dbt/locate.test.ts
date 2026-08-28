import { describe, it, expect } from 'vitest';
import { findModelDeclaration, findColumnDeclaration } from '../../../src/dbt/locate';

const TWO_MODELS =
  'version: 2\nmodels:\n  - name: orders\n    description: Orders\n  - name: order_items\n    columns:\n      - name: id\n';

describe('findModelDeclaration', () => {
  it('finds the first model', () => {
    expect(findModelDeclaration(TWO_MODELS, 'orders')).toEqual({
      line: 2,
      column: 10,
      length: 6,
    });
  });

  it('finds a later model, not its columns', () => {
    expect(findModelDeclaration(TWO_MODELS, 'order_items')).toEqual({
      line: 4,
      column: 10,
      length: 11,
    });
  });

  it('includes single quotes in the token', () => {
    expect(findModelDeclaration("models:\n  - name: 'orders'\n", 'orders')).toEqual({
      line: 1,
      column: 10,
      length: 8,
    });
  });

  it('includes double quotes in the token', () => {
    expect(findModelDeclaration('models:\n  - name: "orders"\n', 'orders')).toEqual({
      line: 1,
      column: 10,
      length: 8,
    });
  });

  it('handles keys written before name', () => {
    expect(
      findModelDeclaration('models:\n  - description: Orders table\n    name: orders\n', 'orders'),
    ).toEqual({ line: 2, column: 10, length: 6 });
  });

  it('handles CRLF line endings', () => {
    expect(findModelDeclaration('version: 2\r\nmodels:\r\n  - name: orders\r\n', 'orders')).toEqual({
      line: 2,
      column: 10,
      length: 6,
    });
  });

  it('returns null for an unknown model', () => {
    expect(findModelDeclaration(TWO_MODELS, 'ghost')).toBeNull();
  });

  it('returns null when there is no models key', () => {
    expect(findModelDeclaration('version: 2\nsources: []\n', 'orders')).toBeNull();
  });

  it('returns null when models is not a sequence', () => {
    expect(findModelDeclaration('models: orders\n', 'orders')).toBeNull();
  });

  it('returns null for a non-mapping root', () => {
    expect(findModelDeclaration('- a\n- b\n', 'orders')).toBeNull();
  });

  it('returns null for malformed YAML instead of throwing', () => {
    expect(findModelDeclaration('models:\n  - name: [unclosed\n', 'orders')).toBeNull();
  });
});

describe('findColumnDeclaration', () => {
  it('finds a column on the matching model', () => {
    const text =
      'models:\n  - name: orders\n    columns:\n      - name: id\n      - name: customer_id\n';
    expect(findColumnDeclaration(text, 'orders', 'customer_id')).toEqual({
      line: 4,
      column: 14,
      length: 11,
    });
  });

  it('does not match a same-named column on a different model', () => {
    const text =
      'models:\n  - name: orders\n    columns:\n      - name: id\n  - name: order_items\n    columns:\n      - name: id\n';
    expect(findColumnDeclaration(text, 'order_items', 'id')).toEqual({
      line: 6,
      column: 14,
      length: 2,
    });
  });

  it('returns null when the model cannot be located', () => {
    expect(findColumnDeclaration(TWO_MODELS, 'ghost', 'id')).toBeNull();
  });

  it('returns null when columns is missing', () => {
    expect(findColumnDeclaration('models:\n  - name: orders\n', 'orders', 'id')).toBeNull();
  });

  it('returns null when columns is not a sequence', () => {
    expect(
      findColumnDeclaration('models:\n  - name: orders\n    columns: id\n', 'orders', 'id'),
    ).toBeNull();
  });

  it('returns null for an unknown column name', () => {
    const text = 'models:\n  - name: orders\n    columns:\n      - name: id\n';
    expect(findColumnDeclaration(text, 'orders', 'ghost')).toBeNull();
  });
});
