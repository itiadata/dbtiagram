import { describe, expect, it } from 'vitest';
import { decidePlacement } from '../../../src/shared/openBehaviorPlacement';

describe('decidePlacement', () => {
  it('newTab opens in the active group', () => {
    expect(decidePlacement('newTab', undefined)).toEqual({ kind: 'active', shouldTrack: false });
  });

  it('splitTab opens beside the active group (default)', () => {
    expect(decidePlacement('splitTab', undefined)).toEqual({ kind: 'beside', shouldTrack: false });
  });

  it('newWindow always creates then moves, never tracking', () => {
    expect(decidePlacement('newWindow', undefined)).toEqual({ kind: 'newWindow', shouldTrack: false });
    expect(decidePlacement('newWindow', { viewColumn: 3 })).toEqual({
      kind: 'newWindow',
      shouldTrack: false,
    });
  });

  it('reuseWindow targets the tracked group directly when one is open', () => {
    expect(decidePlacement('reuseWindow', { viewColumn: 3 })).toEqual({
      kind: 'column',
      viewColumn: 3,
      shouldTrack: false,
    });
  });

  it('reuseWindow falls back to a fresh window (and tracks it) when none is open', () => {
    expect(decidePlacement('reuseWindow', undefined)).toEqual({ kind: 'newWindow', shouldTrack: true });
  });
});
