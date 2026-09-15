import type { ModelEdit } from '../src/dbt/edit';

export interface ColumnRef { model: string; column: string }
export interface ColumnSelection { model: string; anchor: string; focus: string; columns: string[] }
export type ColumnClipboard =
  | { operation: 'copy' | 'cut'; sourceModel: string; columns: string[] }
  | null;
export interface ColumnInsertTarget { model: string; before?: string }

export function selectColumn(
  current: ColumnSelection | null,
  model: string,
  column: string,
  orderedColumns: readonly string[],
  extend: boolean,
): ColumnSelection {
  if (!extend || current?.model !== model) {
    return { model, anchor: column, focus: column, columns: [column] };
  }
  const anchorIndex = orderedColumns.indexOf(current.anchor);
  const focusIndex = orderedColumns.indexOf(column);
  if (anchorIndex === -1 || focusIndex === -1) {
    return { model, anchor: column, focus: column, columns: [column] };
  }
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return { model, anchor: current.anchor, focus: column, columns: orderedColumns.slice(start, end + 1) };
}

export function selectionContains(selection: ColumnSelection | null, ref: ColumnRef): boolean {
  return selection?.model === ref.model && selection.columns.includes(ref.column);
}

export function copySelection(selection: ColumnSelection | null): ColumnClipboard {
  return selection === null ? null : { operation: 'copy', sourceModel: selection.model, columns: [...selection.columns] };
}

export function cutSelection(selection: ColumnSelection | null): ColumnClipboard {
  return selection === null ? null : { operation: 'cut', sourceModel: selection.model, columns: [...selection.columns] };
}

export function clipboardEdit(
  clipboard: Exclude<ColumnClipboard, null>,
  target: ColumnInsertTarget,
): ModelEdit | null {
  if (clipboard.sourceModel === target.model) return null;
  return {
    kind: 'transferColumns',
    sourceModel: clipboard.sourceModel,
    destinationModel: target.model,
    columns: [...clipboard.columns],
    before: target.before,
    copy: clipboard.operation === 'copy',
  };
}

export function afterPaste(clipboard: ColumnClipboard): ColumnClipboard {
  return clipboard?.operation === 'cut' ? null : clipboard;
}
