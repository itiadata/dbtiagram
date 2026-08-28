/**
 * Pure rectangular multi-cell selection over a `(rowIndex, columnIndex)` grid
 * (spec 27). Used by the fields matrix's click-drag / shift-click selection.
 */

export interface CellRef {
  row: number;
  columnIndex: number;
}

export interface MatrixSelection {
  anchor: CellRef;
  focus: CellRef;
}

/** Starts a new single-cell selection at `cell`. */
export function startSelection(cell: CellRef): MatrixSelection {
  return { anchor: cell, focus: cell };
}

/** Extends the selection's focus corner to `cell`, keeping the anchor fixed. */
export function extendSelection(selection: MatrixSelection, cell: CellRef): MatrixSelection {
  return { anchor: selection.anchor, focus: cell };
}

/** Every cell in the rectangle spanned by `selection`'s anchor and focus corners. */
export function cellsInSelection(selection: MatrixSelection): CellRef[] {
  const rowStart = Math.min(selection.anchor.row, selection.focus.row);
  const rowEnd = Math.max(selection.anchor.row, selection.focus.row);
  const colStart = Math.min(selection.anchor.columnIndex, selection.focus.columnIndex);
  const colEnd = Math.max(selection.anchor.columnIndex, selection.focus.columnIndex);

  const cells: CellRef[] = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let columnIndex = colStart; columnIndex <= colEnd; columnIndex += 1) {
      cells.push({ row, columnIndex });
    }
  }
  return cells;
}
