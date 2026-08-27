import { describe, expect, it } from 'vitest';
import {
  advanceDetailsVisibility,
  initialDetailsVisibility,
  nextDetailsVisible,
  selectionKey,
} from '../../../webview-ui/details-visibility';
import type { Selection } from '../../../webview-ui/hooks/useSelection';

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

describe('details-visibility transition', () => {
  const orders: Selection = { kind: 'table', id: 'orders' };
  const customers: Selection = { kind: 'table', id: 'customers' };
  const ordersId: Selection = { kind: 'column', model: 'orders', column: 'id' };

  it('starts collapsed with no selection', () => {
    expect(initialDetailsVisibility(null)).toEqual({ visible: false, key: null });
  });

  it('starts collapsed even when a selection is present', () => {
    expect(initialDetailsVisibility(orders)).toEqual({ visible: false, key: 'table:orders' });
  });

  it('opens when the selection changes to a table', () => {
    expect(advanceDetailsVisibility({ visible: false, key: null }, orders)).toEqual({
      visible: true,
      key: 'table:orders',
    });
  });

  it('stays open when the selection changes to a column', () => {
    expect(advanceDetailsVisibility({ visible: true, key: 'table:orders' }, ordersId)).toEqual({
      visible: true,
      key: 'column:orders.id',
    });
  });

  it('closes when the selection is cleared', () => {
    expect(advanceDetailsVisibility({ visible: true, key: 'table:orders' }, null)).toEqual({
      visible: false,
      key: null,
    });
  });

  it('keeps a manual collapse for an unchanged selection', () => {
    expect(advanceDetailsVisibility({ visible: false, key: 'table:orders' }, orders)).toEqual({
      visible: false,
      key: 'table:orders',
    });
  });

  it('returns the same object for an unchanged selection', () => {
    const state = { visible: true, key: 'table:orders' };
    expect(advanceDetailsVisibility(state, orders)).toBe(state);
  });

  it('re-opens after a manual collapse when a different table is selected', () => {
    expect(advanceDetailsVisibility({ visible: false, key: 'table:orders' }, customers)).toEqual({
      visible: true,
      key: 'table:customers',
    });
  });

  // Regression for the spec 19 wiring hazard: the previous key lived in a ref
  // that was overwritten before the lazy state updater read it, so every
  // transition looked like "selection unchanged" and the pane never opened.
  it('opens on each of two successive selections', () => {
    const states = [orders, null, customers].reduce<
      ReturnType<typeof initialDetailsVisibility>[]
    >(
      (acc, selection) => [
        ...acc,
        advanceDetailsVisibility(acc[acc.length - 1], selection),
      ],
      [initialDetailsVisibility(null)],
    );
    expect(states.slice(1)).toEqual([
      { visible: true, key: 'table:orders' },
      { visible: false, key: null },
      { visible: true, key: 'table:customers' },
    ]);
  });

  it('is idempotent when applied twice with the same selection', () => {
    const once = advanceDetailsVisibility({ visible: false, key: null }, orders);
    const twice = advanceDetailsVisibility(once, orders);
    expect(once).toEqual({ visible: true, key: 'table:orders' });
    expect(twice).toEqual({ visible: true, key: 'table:orders' });
  });
});
