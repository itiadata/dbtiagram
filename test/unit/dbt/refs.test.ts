import { describe, expect, it } from 'vitest';
import { parseRef } from '../../../src/dbt/refs';

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
