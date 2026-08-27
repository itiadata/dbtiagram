import { describe, expect, it } from 'vitest';
import { nextDetailsVisible, selectionKey } from '../../../webview-ui/details-visibility';

describe('details-visibility', () => {
  it('builds a selection key for a table', () => {
    expect(selectionKey({ kind: 'table', id: 'orders' })).toBe('table:orders');
  });

  it('builds a selection key for a column', () => {
    expect(selectionKey({ kind: 'column', model: 'orders', column: 'id' })).toBe(
      'column:orders.id',
    );
  });

  it('builds a null key for no selection', () => {
    expect(selectionKey(null)).toBeNull();
  });

  it('opens the pane when a selection appears', () => {
    expect(nextDetailsVisible(false, 'table:orders', null)).toBe(true);
  });

  it('opens the pane when the selection changes', () => {
    expect(nextDetailsVisible(false, 'column:orders.id', 'table:orders')).toBe(true);
  });

  it('closes the pane when the selection is cleared', () => {
    expect(nextDetailsVisible(true, null, 'table:orders')).toBe(false);
  });

  it('keeps a manual collapse while the selection is unchanged', () => {
    expect(nextDetailsVisible(false, 'table:orders', 'table:orders')).toBe(false);
  });

  it('keeps an open pane while the selection is unchanged', () => {
    expect(nextDetailsVisible(true, 'table:orders', 'table:orders')).toBe(true);
  });

  it('stays closed with no selection at all', () => {
    expect(nextDetailsVisible(false, null, null)).toBe(false);
  });
});
