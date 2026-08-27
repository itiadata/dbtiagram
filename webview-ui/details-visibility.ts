/**
 * Pure visibility policy for the details (properties) sidebar (spec 19).
 *
 * The sidebar starts collapsed, opens whenever the selection changes to an
 * entity, closes whenever the selection changes to nothing, and otherwise
 * (selection unchanged) keeps whatever visibility it currently has — so a
 * manual collapse sticks until the user selects something else.
 */
import type { Selection } from './hooks/useSelection';

/**
 * Stable identity of the current selection: `null` when nothing is selected,
 * `table:<model>` for a table, `column:<model>.<column>` for a column.
 */
export type SelectionKey = string | null;

/** Builds the selection key from the current selection. */
export function selectionKey(selection: Selection): SelectionKey {
  if (selection === null) return null;
  if (selection.kind === 'table') return `table:${selection.id}`;
  return `column:${selection.model}.${selection.column}`;
}

/**
 * The details sidebar's next visibility.
 * - selection unchanged  -> `previous` (a manual collapse sticks)
 * - selection changed to null -> false
 * - selection changed to an entity -> true
 */
export function nextDetailsVisible(
  previous: boolean,
  key: SelectionKey,
  previousKey: SelectionKey,
): boolean {
  if (key === previousKey) return previous;
  return key !== null;
}
