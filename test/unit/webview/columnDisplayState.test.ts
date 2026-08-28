import { describe, expect, it } from 'vitest';
import {
  effectiveMode,
  seedColumnDisplay,
  setDefaultMode,
  setTableOverride,
} from '../../../webview-ui/column-display-state';

describe('column-display-state (spec 24)', () => {
  it('seeds the default mode and per-table overrides', () => {
    const state = seedColumnDisplay('pkAndFk', new Map([['orders', 'pkOnly']]));
    expect(state.defaultMode).toBe('pkAndFk');
    expect(effectiveMode(state, 'orders')).toBe('pkOnly');
    expect(effectiveMode(state, 'customers')).toBe('pkAndFk');
  });

  it('seeds "all" and no overrides by default', () => {
    const state = seedColumnDisplay();
    expect(state.defaultMode).toBe('all');
    expect(state.overrides.size).toBe(0);
  });

  it('setTableOverride only changes the named table', () => {
    const state = setTableOverride(seedColumnDisplay('all'), 'orders', 'pkOnly');
    expect(effectiveMode(state, 'orders')).toBe('pkOnly');
    expect(effectiveMode(state, 'customers')).toBe('all');
  });

  it('setDefaultMode clears every table override', () => {
    const withOverride = setTableOverride(seedColumnDisplay('all'), 'orders', 'pkOnly');
    const state = setDefaultMode(withOverride, 'nameOnly');
    expect(state.overrides.size).toBe(0);
    expect(effectiveMode(state, 'orders')).toBe('nameOnly');
  });

  it('a table added after setDefaultMode reads the current default', () => {
    const state = setDefaultMode(seedColumnDisplay('all'), 'pkOnly');
    expect(effectiveMode(state, 'brand_new_table')).toBe('pkOnly');
  });
});
