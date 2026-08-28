/**
 * Pure column-display webview state (spec 24): the diagram-wide default mode
 * and per-table overrides. Held in webview memory (same lifecycle as unsaved
 * positions) until the diagram is first saved. No `vscode` import — this is a
 * plain reducer-style helper the `useColumnDisplay` hook wraps as React state.
 */
import { DEFAULT_COLUMN_DISPLAY, type ColumnDisplayMode } from '../src/diagram/columnDisplay';

export interface ColumnDisplayState {
  defaultMode: ColumnDisplayMode;
  overrides: Map<string, ColumnDisplayMode>;
}

/** Seeds state from an applied layout (or the defaults for a brand-new diagram). */
export function seedColumnDisplay(
  defaultMode: ColumnDisplayMode = DEFAULT_COLUMN_DISPLAY,
  overrides: Map<string, ColumnDisplayMode> = new Map(),
): ColumnDisplayState {
  return { defaultMode, overrides: new Map(overrides) };
}

/** Sets one table's individual override, leaving the default and other tables untouched. */
export function setTableOverride(
  state: ColumnDisplayState,
  table: string,
  mode: ColumnDisplayMode,
): ColumnDisplayState {
  const overrides = new Map(state.overrides);
  overrides.set(table, mode);
  return { ...state, overrides };
}

/**
 * Sets the diagram-wide default AND clears every table's individual override
 * (spec 24, design decision 2), so the whole diagram uses the new default
 * uniformly — including a table added afterward — until overridden again.
 */
export function setDefaultMode(_state: ColumnDisplayState, mode: ColumnDisplayMode): ColumnDisplayState {
  return { defaultMode: mode, overrides: new Map() };
}

/** The mode a table actually renders with: its override, or the diagram default. */
export function effectiveMode(state: ColumnDisplayState, table: string): ColumnDisplayMode {
  return state.overrides.get(table) ?? state.defaultMode;
}
