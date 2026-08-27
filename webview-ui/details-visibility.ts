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

/**
 * Details-sidebar visibility paired with the selection key it was decided for.
 *
 * Keeping the two together as one value is what makes the transition below safe
 * inside a React state updater: spec 19 originally kept the previous key in a
 * ref that was overwritten *before* the lazy updater ran, so the updater always
 * saw "selection unchanged" and the pane never opened (spec 21).
 */
export interface DetailsVisibility {
  readonly visible: boolean;
  readonly key: SelectionKey;
}

/** Starting state: collapsed, anchored to the selection present at mount. */
export function initialDetailsVisibility(selection: Selection): DetailsVisibility {
  return { visible: false, key: selectionKey(selection) };
}

/**
 * Advances the state for the current selection. Pure and idempotent: applying
 * it twice with the same selection yields the same state, so it is safe inside
 * a React state updater and under StrictMode double-invocation. An unchanged
 * selection returns `previous` itself, so a no-op update cannot re-render.
 */
export function advanceDetailsVisibility(
  previous: DetailsVisibility,
  selection: Selection,
): DetailsVisibility {
  const key = selectionKey(selection);
  if (key === previous.key) return previous;
  return { visible: nextDetailsVisible(previous.visible, key, previous.key), key };
}
