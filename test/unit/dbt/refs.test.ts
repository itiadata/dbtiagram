import { describe, expect, it } from 'vitest';
import { parseRef, renameRefTarget } from '../../../src/dbt/refs';

describe('parseRef', () => {
  it('parses a single-argument ref', () => {
    expect(parseRef("ref('customers')")).toEqual({ name: 'customers' });
    expect(parseRef('ref("customers")')).toEqual({ name: 'customers' });
  });

  it('parses a two-argument ref with a package', () => {
    expect(parseRef("ref('s_pp', 'audit_result')")).toEqual({
      package: 's_pp',
      name: 'audit_result',
    });
  });

  it('tolerates surrounding whitespace and mixed quotes', () => {
    expect(parseRef('  ref( \'a\' , "b" )  ')).toEqual({ package: 'a', name: 'b' });
    expect(parseRef("ref('pkg',\"model\")")).toEqual({ package: 'pkg', name: 'model' });
  });

  it('returns null for malformed input', () => {
    expect(parseRef('')).toBeNull();
    expect(parseRef('customers')).toBeNull();
    expect(parseRef('ref()')).toBeNull();
    expect(parseRef('ref(customers)')).toBeNull();
    expect(parseRef("ref('a', 'b', 'c')")).toBeNull();
    expect(parseRef("ref('a') trailing")).toBeNull();
    expect(parseRef("ref('a',)")).toBeNull();
  });

  it('returns null for empty names', () => {
    expect(parseRef("ref('')")).toBeNull();
    expect(parseRef("ref('a', '')")).toBeNull();
    expect(parseRef("ref('', 'a')")).toBeNull();
  });
});

describe('renameRefTarget', () => {
  it('re-points a single-argument ref at the new name', () => {
    expect(renameRefTarget("ref('orders')", 'orders', 'orders_v2')).toBe("ref('orders_v2')");
  });

  it('preserves double quotes', () => {
    expect(renameRefTarget('ref("orders")', 'orders', 'orders_v2')).toBe('ref("orders_v2")');
  });

  it('re-points the model argument of a two-argument ref', () => {
    expect(renameRefTarget("ref('s_pp', 'orders')", 'orders', 'orders_v2')).toBe(
      "ref('s_pp', 'orders_v2')",
    );
  });

  it('never rewrites the package argument', () => {
    expect(renameRefTarget("ref('orders', 'audit_result')", 'orders', 'orders_v2')).toBeNull();
    // Even when the package and model names are identical, only the second
    // argument (the model) is re-pointed.
    expect(renameRefTarget("ref('orders', 'orders')", 'orders', 'orders_v2')).toBe(
      "ref('orders', 'orders_v2')",
    );
  });

  it('preserves inner whitespace and mixed quotes', () => {
    expect(renameRefTarget("ref( 'orders' )", 'orders', 'orders_v2')).toBe("ref( 'orders_v2' )");
    expect(renameRefTarget("ref('a' , \"orders\")", 'orders', 'orders_v2')).toBe(
      "ref('a' , \"orders_v2\")",
    );
  });

  it('returns null when the ref names a different model', () => {
    expect(renameRefTarget("ref('customers')", 'orders', 'orders_v2')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(renameRefTarget('customers', 'orders', 'orders_v2')).toBeNull();
    expect(renameRefTarget('ref()', 'orders', 'orders_v2')).toBeNull();
    expect(renameRefTarget('ref(orders)', 'orders', 'orders_v2')).toBeNull();
  });

  it('returns the same string when the target name is unchanged', () => {
    expect(renameRefTarget("ref('orders')", 'orders', 'orders')).toBe("ref('orders')");
  });
});
