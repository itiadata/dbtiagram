import { describe, expect, it } from 'vitest';
import {
  afterPaste,
  clipboardEdit,
  copySelection,
  cutSelection,
  selectColumn,
} from '../../../webview-ui/column-transfer-state';

describe('column transfer state', () => {
  it('shift selection follows table order in either direction', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(selectColumn(selectColumn(null, 'A', 'b', order, false), 'A', 'd', order, true)).toEqual({
      model: 'A', anchor: 'b', focus: 'd', columns: ['b', 'c', 'd'],
    });
    expect(selectColumn(selectColumn(null, 'A', 'd', order, false), 'A', 'b', order, true).columns)
      .toEqual(['b', 'c', 'd']);
  });

  it('shift click in another model starts a new selection', () => {
    const current = selectColumn(null, 'A', 'a', ['a'], false);
    expect(selectColumn(current, 'B', 'x', ['x'], true)).toEqual({
      model: 'B', anchor: 'x', focus: 'x', columns: ['x'],
    });
  });

  it('cut clears only after paste while copy remains', () => {
    const selection = selectColumn(null, 'A', 'a', ['a'], false);
    expect(afterPaste(cutSelection(selection))).toBeNull();
    expect(afterPaste(copySelection(selection))).toEqual(copySelection(selection));
  });

  it('paste builds exact before-position transfer edit', () => {
    expect(clipboardEdit({ operation: 'cut', sourceModel: 'A', columns: ['b', 'c'] }, { model: 'B', before: 'y' }))
      .toEqual({ kind: 'transferColumns', sourceModel: 'A', destinationModel: 'B', columns: ['b', 'c'], before: 'y', copy: false });
  });
});
