import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_BEHAVIOR, OPEN_BEHAVIOR_OPTIONS } from '../../../src/shared/openBehavior';

describe('OPEN_BEHAVIOR_OPTIONS', () => {
  it('has all four values in order', () => {
    expect(OPEN_BEHAVIOR_OPTIONS.map((option) => option.value)).toEqual([
      'newTab',
      'splitTab',
      'reuseWindow',
      'newWindow',
    ]);
  });

  it('gives each option a non-empty label and description', () => {
    for (const option of OPEN_BEHAVIOR_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_OPEN_BEHAVIOR', () => {
  it('matches spec 14 current behavior (splitTab)', () => {
    expect(DEFAULT_OPEN_BEHAVIOR).toBe('splitTab');
  });
});
