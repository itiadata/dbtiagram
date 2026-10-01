import { describe, expect, it } from 'vitest';
import { shouldRequestPendingFit, shouldRunInitialFit, shouldRunPendingFit } from '../../../webview-ui/initial-fit';

describe('initial-fit', () => {
  describe('shouldRunInitialFit', () => {
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

  describe('shouldRunPendingFit', () => {
    it('runs an owed fit once nodes are measured', () => {
      expect(shouldRunPendingFit(true, true)).toBe(true);
    });

    it('waits for measurement', () => {
      expect(shouldRunPendingFit(false, true)).toBe(false);
    });

    it('does nothing when no fit is owed', () => {
      expect(shouldRunPendingFit(true, false)).toBe(false);
    });

    it('does nothing when neither holds', () => {
      expect(shouldRunPendingFit(false, false)).toBe(false);
    });
  });

  describe('shouldRequestPendingFit', () => {
    it('does not request a fit for an ordinary table-set change', () => {
      expect(shouldRequestPendingFit(false, false)).toBe(false);
    });
    it('requests a fit after Auto-layout', () => {
      expect(shouldRequestPendingFit(true, false)).toBe(true);
    });
    it('requests a fit after applying a saved layout', () => {
      expect(shouldRequestPendingFit(false, true)).toBe(true);
    });
  });
});
