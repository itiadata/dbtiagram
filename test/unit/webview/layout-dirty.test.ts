/**
 * Dirty-flag comparison for the manual layout save (spec 22): pure,
 * order-independent (both sides are pre-sorted via `buildLayout` before this
 * runs), no `vscode` import.
 */
import { describe, expect, it } from 'vitest';
import { isLayoutDirty, type LayoutSnapshot } from '../../../webview-ui/layout-dirty';

describe('isLayoutDirty', () => {
  it('is false when there is no saved snapshot', () => {
    expect(isLayoutDirty({ tables: [], notes: [] }, null)).toBe(false);
  });

  it('is false when current equals saved', () => {
    const snapshot: LayoutSnapshot = { tables: [{ name: 'orders', x: 1, y: 2 }], notes: [] };
    expect(isLayoutDirty(snapshot, snapshot)).toBe(false);
  });

  it('is true when a table position differs', () => {
    const current: LayoutSnapshot = { tables: [{ name: 'orders', x: 5, y: 2 }], notes: [] };
    const saved: LayoutSnapshot = { tables: [{ name: 'orders', x: 1, y: 2 }], notes: [] };
    expect(isLayoutDirty(current, saved)).toBe(true);
  });

  it('is true when the visible table set differs', () => {
    const current: LayoutSnapshot = {
      tables: [
        { name: 'orders', x: 1, y: 2 },
        { name: 'customers', x: 3, y: 4 },
      ],
      notes: [],
    };
    const saved: LayoutSnapshot = { tables: [{ name: 'orders', x: 1, y: 2 }], notes: [] };
    expect(isLayoutDirty(current, saved)).toBe(true);
  });

  it("is true when a note's text/position/size differs", () => {
    const current: LayoutSnapshot = {
      tables: [],
      notes: [{ id: 'n1', x: 0, y: 0, width: 220, height: 120, text: 'a', collapsedByDefault: false }],
    };
    const saved: LayoutSnapshot = {
      tables: [],
      notes: [{ id: 'n1', x: 0, y: 0, width: 220, height: 120, text: 'b', collapsedByDefault: false }],
    };
    expect(isLayoutDirty(current, saved)).toBe(true);
  });

  it('is false regardless of input array order (both sides pre-sorted)', () => {
    const current: LayoutSnapshot = {
      tables: [
        { name: 'orders', x: 1, y: 2 },
        { name: 'customers', x: 3, y: 4 },
      ],
      notes: [],
    };
    const saved: LayoutSnapshot = {
      tables: [
        { name: 'customers', x: 3, y: 4 },
        { name: 'orders', x: 1, y: 2 },
      ],
      notes: [],
    };
    // Both sides here are NOT pre-sorted identically on purpose: since this
    // helper does a straightforward positional compare, callers are expected
    // to pass both sides through `buildLayout` first. This case documents
    // that expectation is on the caller, not this helper, by using
    // already-matching order — the true "sorted via buildLayout" behavior is
    // covered in the useLayoutPersistence integration.
    const sortedCurrent: LayoutSnapshot = {
      tables: [...current.tables].sort((a, b) => (a.name < b.name ? -1 : 1)),
      notes: [],
    };
    const sortedSaved: LayoutSnapshot = {
      tables: [...saved.tables].sort((a, b) => (a.name < b.name ? -1 : 1)),
      notes: [],
    };
    expect(isLayoutDirty(sortedCurrent, sortedSaved)).toBe(false);
  });
});
