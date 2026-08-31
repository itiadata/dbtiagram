/**
 * Pure helpers for resolving a column's displayable data-test names.
 * MUST NOT import `vscode`.
 */
import type { DataTestEntry, ModelColumn } from './types';

/**
 * The display name of a data test entry: the string itself for the bare form,
 * or the single key of the mapping form. `undefined` for an unusable entry
 * (an empty mapping, or a mapping whose first key is the empty string).
 */
export function dataTestName(entry: DataTestEntry): string | undefined {
  if (typeof entry === 'string') {
    return entry.length > 0 ? entry : undefined;
  }
  const keys = Object.keys(entry);
  if (keys.length === 0) return undefined;
  const first = keys[0];
  return first.length > 0 ? first : undefined;
}

/**
 * Every test name declared on a column, `tests` first then `dataTests`, in
 * declaration order, duplicates collapsed (first wins).
 * When `isPrimaryKeyColumn` is true, a single `not_null` entry is dropped
 * because the PK editor owns it (`syncColumnNotNull`).
 */
export function columnTestNames(
  column: ModelColumn,
  isPrimaryKeyColumn: boolean,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let pkNotNullDropped = false;

  const addName = (name: string | undefined): void => {
    if (name === undefined) return;
    if (isPrimaryKeyColumn && !pkNotNullDropped && name === 'not_null') {
      pkNotNullDropped = true;
      return;
    }
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  };

  // Legacy `tests` key first, then `data_tests`.
  for (const entry of column.tests ?? []) {
    addName(entry);
  }
  for (const entry of column.dataTests ?? []) {
    addName(dataTestName(entry));
  }

  return result;
}
