import { describe, expect, it } from 'vitest';
import { formatSourceRef, parseSourceRef } from '../../../src/dbt/sourceRefs';

describe('source references', () => {
  it('formats a qualified target', () => expect(formatSourceRef('finops.workspaces')).toBe("source('finops', 'workspaces')"));
  it('parses supported quote styles', () => {
    const expected = { source: 'finops', table: 'workspaces', id: 'finops.workspaces' };
    expect(parseSourceRef("source('finops', 'workspaces')")).toEqual(expected);
    expect(parseSourceRef('source("finops", "workspaces")')).toEqual(expected);
  });
  it.each(["ref('x')", "{{ source('a','b') }}", "source('a')"])('rejects %s', (value) => expect(parseSourceRef(value)).toBeNull());
});
