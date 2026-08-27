/**
 * Primary-key edits (spec 08). Pure logic — MUST NOT import `vscode`.
 *
 * A real PK keeps three constructs in sync (the
 * `dbt_utils.unique_combination_of_columns` data test, the `primary_key`
 * constraint, and `not_null` on the PK columns); a virtual PK writes only the
 * `config.meta.dbtiagram.virtual` block.
 */
import { readVirtualConstraints, writeVirtualConstraints } from '../virtual';
import type { DataTestEntry, ModelColumn, ModelDefinition } from '../types';
import { EditError, arraysEqual, isRecord } from './internal';

/** The model-level data test the PK editor owns (spec 08). */
const UNIQUE_COMBINATION_TEST = 'dbt_utils.unique_combination_of_columns';

/** Trims and dedupes a list of names (used by `setPrimaryKey`). */
export function dedupeTrimmed(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Applies `setPrimaryKey` to one model. The three real constructs stay in sync
 * in this single atomic edit (spec 08, Confirm at Approval (a)/(e)); a virtual
 * PK writes only the `config.meta.dbtiagram.virtual` block. The no-op guard
 * compares against the *displayed* state (virtual-first, per Confirm at
 * Approval (c)) so an unchanged UI selection never rewrites the file.
 */
export function setPrimaryKeyOnModel(
  model: ModelDefinition,
  columns: string[],
  virtual: boolean,
): ModelDefinition {
  const existing = new Set((model.columns ?? []).map((c) => c.name));
  for (const column of columns) {
    if (!existing.has(column)) {
      throw new EditError(`Model "${model.name}" has no column named "${column}"`);
    }
  }

  const displayed = readDisplayedPrimaryKey(model);
  const resulting = columns.length === 0 ? undefined : { columns, virtual };
  if (displayed === undefined && resulting === undefined) return model;
  if (
    displayed !== undefined &&
    resulting !== undefined &&
    displayed.virtual === resulting.virtual &&
    arraysEqual(displayed.columns, resulting.columns)
  ) {
    return model;
  }

  const currentReal = readRealPrimaryKeyColumns(model);
  if (virtual) {
    let next = removeRealPrimaryKeyArtifacts(model, currentReal);
    const block = readVirtualConstraints(next);
    next = writeVirtualConstraints(next, {
      ...block,
      primaryKey: columns.length > 0 ? { columns } : undefined,
    });
    return next;
  }

  let next = writeVirtualConstraints(model, {
    ...readVirtualConstraints(model),
    primaryKey: undefined,
  });
  next = applyRealPrimaryKeySync(next, columns, currentReal);
  return next;
}

/** The PK the webview shows: the virtual block first, else the real constraint. */
function readDisplayedPrimaryKey(
  model: ModelDefinition,
): { columns: string[]; virtual: boolean } | undefined {
  const virtual = readVirtualConstraints(model);
  if (virtual.primaryKey !== undefined) {
    return { columns: virtual.primaryKey.columns, virtual: true };
  }
  const constraint = (model.constraints ?? []).find((c) => c.type === 'primary_key');
  if (constraint !== undefined) {
    return { columns: constraint.columns ?? [], virtual: false };
  }
  return undefined;
}

function readRealPrimaryKeyColumns(model: ModelDefinition): string[] {
  const constraint = (model.constraints ?? []).find((c) => c.type === 'primary_key');
  return constraint?.columns ?? [];
}

/** Syncs the real PK constructs: the data test, the constraint, and not_null. */
function applyRealPrimaryKeySync(
  model: ModelDefinition,
  columns: string[],
  currentReal: string[],
): ModelDefinition {
  let next = syncUniqueCombinationDataTest(model, columns);
  next = syncPrimaryKeyConstraint(next, columns);
  next = syncColumnNotNull(next, currentReal, columns);
  return next;
}

/**
 * Creates/updates/removes the `dbt_utils.unique_combination_of_columns`
 * model-level data test in place. The entry is found by its key; when the PK
 * is empty the entry is removed; other entries are preserved.
 */
function syncUniqueCombinationDataTest(
  model: ModelDefinition,
  columns: string[],
): ModelDefinition {
  const dataTests = model.dataTests;
  if (dataTests === undefined) {
    if (columns.length === 0) return model;
    return { ...model, dataTests: [buildUniqueTest(columns)] };
  }
  const index = dataTests.findIndex(isUniqueCombinationEntry);
  if (index === -1) {
    if (columns.length === 0) return model;
    return { ...model, dataTests: [...dataTests, buildUniqueTest(columns)] };
  }
  const next = [...dataTests];
  if (columns.length === 0) {
    next.splice(index, 1);
    return { ...model, dataTests: next.length > 0 ? next : undefined };
  }
  next[index] = buildUniqueTest(columns, dataTests[index]);
  return { ...model, dataTests: next };
}

function isUniqueCombinationEntry(entry: DataTestEntry): boolean {
  return entry === UNIQUE_COMBINATION_TEST || (isRecord(entry) && UNIQUE_COMBINATION_TEST in entry);
}

/**
 * Builds the mapping form `{ 'dbt_utils.unique_combination_of_columns': { …
 * arguments: { combination_of_columns: […], … } } }`, preserving the previous
 * entry's sibling keys (e.g. `enabled`) and the value's other `arguments` keys.
 */
function buildUniqueTest(columns: string[], previous?: DataTestEntry): DataTestEntry {
  const previousValue = isRecord(previous) ? previous[UNIQUE_COMBINATION_TEST] : undefined;
  const previousArguments = isRecord(previousValue) ? previousValue.arguments : undefined;
  const value: Record<string, unknown> = {
    ...(isRecord(previousValue) ? previousValue : {}),
    arguments: {
      ...(isRecord(previousArguments) ? previousArguments : {}),
      combination_of_columns: [...columns],
    },
  };
  if (isRecord(previous)) {
    return { ...previous, [UNIQUE_COMBINATION_TEST]: value };
  }
  return { [UNIQUE_COMBINATION_TEST]: value };
}

/** Creates/updates/removes the `type: primary_key` constraint in place. */
function syncPrimaryKeyConstraint(model: ModelDefinition, columns: string[]): ModelDefinition {
  const constraints = model.constraints;
  if (constraints === undefined) {
    if (columns.length === 0) return model;
    return { ...model, constraints: [{ type: 'primary_key', columns: [...columns] }] };
  }
  const index = constraints.findIndex((c) => c.type === 'primary_key');
  if (index === -1) {
    if (columns.length === 0) return model;
    return { ...model, constraints: [...constraints, { type: 'primary_key', columns: [...columns] }] };
  }
  const next = [...constraints];
  if (columns.length === 0) {
    next.splice(index, 1);
    return { ...model, constraints: next.length > 0 ? next : undefined };
  }
  next[index] = { ...constraints[index], columns: [...columns] };
  return { ...model, constraints: next };
}

/**
 * Moves `not_null` column-level data tests to match the PK: columns leaving
 * the old real PK lose it (the PK editor owns `not_null` on PK columns —
 * Confirm at Approval (e)), columns entering gain it exactly once. Only
 * `data_tests` is touched; legacy `tests` entries are left as-is.
 */
function syncColumnNotNull(
  model: ModelDefinition,
  oldRealPk: string[],
  newColumns: string[],
): ModelDefinition {
  const oldSet = new Set(oldRealPk);
  const newSet = new Set(newColumns);
  let changed = false;
  const nextColumns = (model.columns ?? []).map((column) => {
    const wasInPk = oldSet.has(column.name);
    const isInPk = newSet.has(column.name);
    if (wasInPk && !isInPk) {
      const next = removeNotNull(column);
      if (next !== column) changed = true;
      return next;
    }
    if (isInPk && !hasNotNull(column)) {
      changed = true;
      return { ...column, dataTests: [...(column.dataTests ?? []), 'not_null'] };
    }
    return column;
  });
  return changed ? { ...model, columns: nextColumns } : model;
}

function hasNotNull(column: ModelColumn): boolean {
  return (column.dataTests ?? []).some(isNotNullEntry);
}

function isNotNullEntry(entry: DataTestEntry): boolean {
  return entry === 'not_null' || (isRecord(entry) && 'not_null' in entry);
}

/** Removes every `not_null` entry from a column; drops `dataTests` when empty. */
function removeNotNull(column: ModelColumn): ModelColumn {
  const dataTests = column.dataTests;
  if (dataTests === undefined || !dataTests.some(isNotNullEntry)) return column;
  const next = dataTests.filter((entry) => !isNotNullEntry(entry));
  if (next.length === 0) {
    const { dataTests: _dropped, ...rest } = column;
    return rest;
  }
  return { ...column, dataTests: next };
}

/** Removes all three real PK constructs (used by the real -> virtual switch). */
function removeRealPrimaryKeyArtifacts(
  model: ModelDefinition,
  currentReal: string[],
): ModelDefinition {
  let next = syncUniqueCombinationDataTest(model, []);
  next = syncPrimaryKeyConstraint(next, []);
  next = syncColumnNotNull(next, currentReal, []);
  return next;
}
