/**
 * Pure per-table column display modes (spec 24): which columns a table card
 * renders. A diagram-layout concern, not a `model.yml` concern — this module
 * never touches dbt model data itself. MUST NOT import `vscode`.
 */
import type { TableNode, TableNodeColumn } from './graph';

/** The four fixed table-level column visibility modes. */
export type ColumnDisplayMode = 'nameOnly' | 'pkOnly' | 'pkAndFk' | 'all';

/** Every table reads this mode until it has a layout-stored override. */
export const DEFAULT_COLUMN_DISPLAY: ColumnDisplayMode = 'all';

export interface ColumnDisplayOption {
  value: ColumnDisplayMode;
  label: string;
}

/** Ordered options for every UI surface (context menu, sidebar, toolbar). */
export const COLUMN_DISPLAY_OPTIONS: readonly ColumnDisplayOption[] = [
  { value: 'nameOnly', label: 'Table name only' },
  { value: 'pkOnly', label: 'Primary keys only' },
  { value: 'pkAndFk', label: 'Primary + foreign keys' },
  { value: 'all', label: 'All columns' },
];

const VALID_MODES: ReadonlySet<string> = new Set(
  COLUMN_DISPLAY_OPTIONS.map((option) => option.value),
);

/** True when `value` is a valid `ColumnDisplayMode`. */
export function isColumnDisplayMode(value: unknown): value is ColumnDisplayMode {
  return typeof value === 'string' && VALID_MODES.has(value);
}

/**
 * The columns a table card renders in `mode`, in the node's original column
 * order (never re-sorted): `nameOnly` -> none; `pkOnly` -> primary key
 * columns; `pkAndFk` -> primary key columns union `foreignKeyColumns`;
 * `all` -> every column, unchanged.
 */
export function displayedColumns(node: TableNode, mode: ColumnDisplayMode): TableNodeColumn[] {
  if (mode === 'all') {
    return node.columns;
  }
  if (mode === 'nameOnly') {
    return [];
  }
  const pk = new Set(node.primaryKey?.columns ?? []);
  if (mode === 'pkOnly') {
    return node.columns.filter((column) => pk.has(column.name));
  }
  // pkAndFk
  const fk = new Set(node.foreignKeyColumns);
  return node.columns.filter((column) => pk.has(column.name) || fk.has(column.name));
}
