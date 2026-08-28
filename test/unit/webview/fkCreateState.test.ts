import { describe, expect, it } from 'vitest';
import {
  FK_CREATE_IDLE,
  cancelFkCreate,
  clickColumnForFk,
  startFkCreate,
  type FkCreateState,
} from '../../../webview-ui/fk-create-state';

describe('fk-create-state (spec 26)', () => {
  it('starts idle', () => {
    expect(FK_CREATE_IDLE).toEqual({ active: false });
  });

  it('startFkCreate begins with no source', () => {
    expect(startFkCreate()).toEqual({ active: true, source: null });
  });

  it('cancelFkCreate returns idle', () => {
    expect(cancelFkCreate()).toEqual({ active: false });
  });

  it('first click picks the source, no completion', () => {
    const state: FkCreateState = { active: true, source: null };
    const outcome = clickColumnForFk(state, { model: 'order_items', column: 'order_id' });
    expect(outcome).toEqual({
      state: { active: true, source: { model: 'order_items', column: 'order_id' } },
    });
    expect(outcome.completed).toBeUndefined();
  });

  it('re-clicking the same column is a no-op', () => {
    const state: FkCreateState = {
      active: true,
      source: { model: 'order_items', column: 'order_id' },
    };
    const outcome = clickColumnForFk(state, { model: 'order_items', column: 'order_id' });
    expect(outcome.state).toEqual(state);
    expect(outcome.completed).toBeUndefined();
  });

  it('second click on a different column completes the pair and returns to idle', () => {
    const state: FkCreateState = {
      active: true,
      source: { model: 'order_items', column: 'order_id' },
    };
    const outcome = clickColumnForFk(state, { model: 'orders', column: 'order_id' });
    expect(outcome).toEqual({
      state: { active: false },
      completed: {
        source: { model: 'order_items', column: 'order_id' },
        target: { model: 'orders', column: 'order_id' },
      },
    });
  });

  it('a self-referencing pair completes like a cross-table one', () => {
    const state: FkCreateState = {
      active: true,
      source: { model: 'categories', column: 'parent_id' },
    };
    const outcome = clickColumnForFk(state, { model: 'categories', column: 'category_id' });
    expect(outcome.completed).toEqual({
      source: { model: 'categories', column: 'parent_id' },
      target: { model: 'categories', column: 'category_id' },
    });
  });

  it('clicking while inactive is a no-op', () => {
    const outcome = clickColumnForFk({ active: false }, { model: 'x', column: 'y' });
    expect(outcome).toEqual({ state: { active: false } });
    expect(outcome.completed).toBeUndefined();
  });
});
