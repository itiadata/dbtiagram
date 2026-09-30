import { describe, expect, it } from 'vitest';
import { lineageAncestors, lineageDescendants, lineageId } from '../../../src/diagram/lineage';

describe('lineage', () => {
  it('builds package-qualified ids', () => {
    expect(lineageId({ package: 'sample', name: 'orders' })).toBe('model:sample:orders');
  });

  it('returns complete ancestors once', () => {
    expect(lineageAncestors([
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'c' },
      { parent: 'a', child: 'c' },
    ], 'c')).toEqual(['a', 'b']);
  });

  it('returns complete descendants and terminates a cycle', () => {
    expect(lineageDescendants([
      { parent: 'a', child: 'b' },
      { parent: 'b', child: 'a' },
    ], 'a')).toEqual(['b']);
  });
});
