/**
 * "Reveal in diagram" state (spec 15). Kept out of `App.tsx` to hold it under
 * the size cap.
 *
 * Reveal is deliberately inert with respect to persistence: it selects a table
 * and asks the canvas to center on it, but never changes filter state and never
 * posts a message, so it can never trigger a layout-file write.
 */
import { useCallback, useState } from 'react';

export interface RevealTarget {
  name: string;
  /** Bumped on every request so revealing the same model twice still fires. */
  tick: number;
}

export interface RevealModelState {
  revealTarget: RevealTarget | null;
  revealModel: (name: string) => void;
}

/** `onRevealed` selects the table and shows the details sidebar. */
export function useRevealModel(onRevealed: (name: string) => void): RevealModelState {
  const [revealTarget, setRevealTarget] = useState<RevealTarget | null>(null);

  const revealModel = useCallback(
    (name: string): void => {
      onRevealed(name);
      setRevealTarget((current) => ({ name, tick: (current?.tick ?? 0) + 1 }));
    },
    [onRevealed],
  );

  return { revealTarget, revealModel };
}
