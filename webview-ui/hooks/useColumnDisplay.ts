/**
 * React state wrapper around `column-display-state.ts` (spec 24): the
 * diagram-wide default column-display mode and per-table overrides, held in
 * webview memory (same lifecycle as unsaved positions) until first save.
 */
import { useCallback, useState } from 'react';
import type { ColumnDisplayMode } from '../../src/diagram/columnDisplay';
import {
  effectiveMode as effectiveModeOf,
  seedColumnDisplay,
  setDefaultMode as setDefaultModeOf,
  setTableOverride,
  type ColumnDisplayState,
} from '../column-display-state';

export interface ColumnDisplayHookState {
  defaultMode: ColumnDisplayMode;
  effectiveMode: (table: string) => ColumnDisplayMode;
  setTableMode: (table: string, mode: ColumnDisplayMode) => void;
  setDefaultMode: (mode: ColumnDisplayMode) => void;
  /** Seeds state from an opened layout (spec 13/24), replacing any current state. */
  applySeed: (defaultMode: ColumnDisplayMode, overrides: Map<string, ColumnDisplayMode>) => void;
  overrides: Map<string, ColumnDisplayMode>;
}

export function useColumnDisplay(): ColumnDisplayHookState {
  const [state, setState] = useState<ColumnDisplayState>(() => seedColumnDisplay());

  const setTableMode = useCallback((table: string, mode: ColumnDisplayMode): void => {
    setState((current) => setTableOverride(current, table, mode));
  }, []);

  const setDefaultMode = useCallback((mode: ColumnDisplayMode): void => {
    setState((current) => setDefaultModeOf(current, mode));
  }, []);

  const applySeed = useCallback(
    (defaultMode: ColumnDisplayMode, overrides: Map<string, ColumnDisplayMode>): void => {
      setState(seedColumnDisplay(defaultMode, overrides));
    },
    [],
  );

  const effectiveMode = useCallback(
    (table: string): ColumnDisplayMode => effectiveModeOf(state, table),
    [state],
  );

  return {
    defaultMode: state.defaultMode,
    effectiveMode,
    setTableMode,
    setDefaultMode,
    applySeed,
    overrides: state.overrides,
  };
}
