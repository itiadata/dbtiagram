import { describe, expect, it } from 'vitest';
import { cellsInSelection, extendSelection, startSelection } from '../../../webview-ui/matrix-selection';

describe('startSelection', () => {
  it('creates a single-cell selection', () => {
    const selection = startSelection({ row: 0, columnIndex: 0 });
    expect(cellsInSelection(selection)).toEqual([{ row: 0, columnIndex: 0 }]);
  });
});

describe('extendSelection', () => {
  it('keeps the anchor and moves the focus', () => {
    const selection = startSelection({ row: 1, columnIndex: 1 });
    const extended = extendSelection(selection, { row: 3, columnIndex: 2 });
    const cells = cellsInSelection(extended);
    expect(cells).toHaveLength(6);
    expect(cells).toEqual(
      expect.arrayContaining([
        { row: 1, columnIndex: 1 },
        { row: 1, columnIndex: 2 },
        { row: 2, columnIndex: 1 },
        { row: 2, columnIndex: 2 },
        { row: 3, columnIndex: 1 },
        { row: 3, columnIndex: 2 },
      ]),
    );
  });
});
