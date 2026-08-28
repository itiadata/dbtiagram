/**
 * Grid column definitions for the "fields matrix" (spec 27) and helpers for
 * showing/hiding, reordering, and persisting them. Shared between the webview
 * (rendering/editing the grid) and the extension host (typing what it
 * persists) — MUST NOT import `vscode`.
 */

export type MatrixScope = 'model' | 'global';

export type MatrixColumnId =
  | 'model'
  | 'name'
  | 'dataType'
  | 'description'
  | 'primaryKey'
  | 'virtualPrimaryKey'
  | { meta: string };

export interface MatrixColumnDef {
  id: MatrixColumnId;
  label: string;
  visible: boolean;
  /** Batch multi-cell apply offered for this column kind. */
  batchEditable: boolean;
}

/** What the host persists per scope: order is array order. */
export interface StoredMatrixColumnPref {
  id: MatrixColumnId;
  visible: boolean;
}

function matrixColumnIdKey(id: MatrixColumnId): string {
  return typeof id === 'string' ? id : `meta:${id.meta}`;
}

function matrixColumnIdsEqual(a: MatrixColumnId, b: MatrixColumnId): boolean {
  return matrixColumnIdKey(a) === matrixColumnIdKey(b);
}

/** Builds the default column set for a scope, given the discovered meta keys. */
export function defaultMatrixColumns(
  metaKeys: readonly string[],
  scope: MatrixScope,
): MatrixColumnDef[] {
  const base: MatrixColumnDef[] = [];
  if (scope === 'global') {
    base.push({ id: 'model', label: 'Model', visible: true, batchEditable: false });
  }
  base.push(
    { id: 'name', label: 'Column', visible: true, batchEditable: false },
    { id: 'dataType', label: 'Data type', visible: true, batchEditable: true },
    { id: 'description', label: 'Description', visible: true, batchEditable: true },
    { id: 'primaryKey', label: 'Primary key', visible: true, batchEditable: true },
    { id: 'virtualPrimaryKey', label: 'Virtual PK', visible: true, batchEditable: true },
  );
  for (const key of metaKeys) {
    base.push({ id: { meta: key }, label: key, visible: true, batchEditable: true });
  }
  return base;
}

/** Flips one column's visibility without affecting the others. */
export function toggleColumnVisible(
  columns: MatrixColumnDef[],
  id: MatrixColumnId,
): MatrixColumnDef[] {
  return columns.map((column) =>
    matrixColumnIdsEqual(column.id, id) ? { ...column, visible: !column.visible } : column,
  );
}

/** Moves the column at `fromIndex` to `toIndex`, shifting the others. */
export function reorderColumn(
  columns: MatrixColumnDef[],
  fromIndex: number,
  toIndex: number,
): MatrixColumnDef[] {
  const next = [...columns];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return columns;
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Merges stored preferences onto a freshly computed default column set:
 * columns whose id appears in `stored` take that order (first) and that
 * `visible` flag; columns from `defaults` not mentioned in `stored` (e.g. a
 * meta key discovered for the first time) are appended afterwards, in their
 * default relative order, visible by default. Ids in `stored` no longer
 * present in `defaults` (e.g. a meta key that no longer exists in scope) are
 * dropped silently.
 */
export function applyStoredPrefs(
  defaults: MatrixColumnDef[],
  stored: readonly StoredMatrixColumnPref[] | undefined,
): MatrixColumnDef[] {
  if (stored === undefined) return defaults;
  const byKey = new Map(defaults.map((column) => [matrixColumnIdKey(column.id), column]));
  const used = new Set<string>();
  const ordered: MatrixColumnDef[] = [];
  for (const pref of stored) {
    const key = matrixColumnIdKey(pref.id);
    const match = byKey.get(key);
    if (match === undefined) continue;
    used.add(key);
    ordered.push({ ...match, visible: pref.visible });
  }
  for (const column of defaults) {
    const key = matrixColumnIdKey(column.id);
    if (used.has(key)) continue;
    ordered.push(column);
  }
  return ordered;
}

/** Converts the current column defs to the shape persisted per scope. */
export function toStoredPrefs(columns: readonly MatrixColumnDef[]): StoredMatrixColumnPref[] {
  return columns.map((column) => ({ id: column.id, visible: column.visible }));
}

/**
 * Merges a freshly written preference set (`next`, from the currently open
 * scope/model) with the previously persisted one (`previous`), so a column
 * this model/scope doesn't currently show (e.g. a meta key only some models
 * have) is never dropped from what gets persisted: `next`'s entries take
 * priority and order for the ids they contain; every `previous` entry whose
 * id is not in `next` is appended afterward, preserving its old relative
 * order. This is what lets column visibility/order for a meta key survive
 * switching to a model that doesn't have that key and back (spec 27).
 */
export function mergeStoredPrefs(
  next: readonly StoredMatrixColumnPref[],
  previous: readonly StoredMatrixColumnPref[] | undefined,
): StoredMatrixColumnPref[] {
  if (previous === undefined) return [...next];
  const nextKeys = new Set(next.map((pref) => matrixColumnIdKey(pref.id)));
  const carried = previous.filter((pref) => !nextKeys.has(matrixColumnIdKey(pref.id)));
  return [...next, ...carried];
}
