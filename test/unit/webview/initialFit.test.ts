import { describe, expect, it } from 'vitest';
import { shouldRunInitialFit } from '../../../webview-ui/initial-fit';

describe('initial-fit', () => {
  it('does not fit before nodes are measured', () => {
    expect(shouldRunInitialFit(false, false, false)).toBe(false);
  });

  it('fits once nodes are measured', () => {
    expect(shouldRunInitialFit(true, false, false)).toBe(true);
  });

  it('does not fit twice', () => {
    expect(shouldRunInitialFit(true, true, false)).toBe(false);
  });

  it('does not fit after the user has touched the canvas', () => {
    expect(shouldRunInitialFit(true, false, true)).toBe(false);
  });
});
