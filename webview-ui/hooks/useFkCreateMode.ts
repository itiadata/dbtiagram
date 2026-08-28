/**
 * React wrapper around the pure FK-create gesture state (spec 26): tracks the
 * two-click sequence, listens for Escape while active, and derives the hint
 * banner text.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FK_CREATE_IDLE,
  cancelFkCreate,
  clickColumnForFk,
  startFkCreate,
  type FkClickOutcome,
  type FkCreateState,
} from '../fk-create-state';

export interface FkCreateModeState {
  state: FkCreateState;
  /** Hint banner text, or null while idle. */
  hint: string | null;
  start: () => void;
  cancel: () => void;
  /** Feeds a column click through the gesture; returns whether the mode
   * consumed the click (so callers skip their normal column-select handling). */
  handleColumnClick: (model: string, column: string) => FkClickOutcome | null;
}

export function useFkCreateMode(): FkCreateModeState {
  const [state, setState] = useState<FkCreateState>(FK_CREATE_IDLE);

  const start = useCallback((): void => {
    setState(startFkCreate());
  }, []);

  const cancel = useCallback((): void => {
    setState(cancelFkCreate());
  }, []);

  const handleColumnClick = useCallback(
    (model: string, column: string): FkClickOutcome | null => {
      if (!state.active) {
        return null;
      }
      const outcome = clickColumnForFk(state, { model, column });
      setState(outcome.state);
      return outcome;
    },
    [state],
  );

  useEffect(() => {
    if (!state.active) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setState(cancelFkCreate());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.active]);

  const hint = !state.active
    ? null
    : state.source === null
      ? 'Click a column to start a foreign key (Esc to cancel)'
      : `Click the target column for ${state.source.model}.${state.source.column} (Esc to cancel)`;

  return { state, hint, start, cancel, handleColumnClick };
}
