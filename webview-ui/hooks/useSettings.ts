/**
 * Webview-side state for the "Open new diagrams" settings overlay (spec 23).
 * `applyCurrent` is driven by the host's `settings:current` message and never
 * forces the panel open — only the gear button does that.
 */
import { useCallback, useState } from 'react';
import { DEFAULT_OPEN_BEHAVIOR, type OpenBehavior } from '../../src/shared/openBehavior';
import { postToHost } from '../host';

export interface SettingsState {
  open: boolean;
  openBehavior: OpenBehavior;
  openPanel: () => void;
  closePanel: () => void;
  setOpenBehavior: (value: OpenBehavior) => void;
  applyCurrent: (value: OpenBehavior) => void;
}

export function useSettings(): SettingsState {
  const [open, setOpen] = useState(false);
  const [openBehavior, setOpenBehaviorState] = useState<OpenBehavior>(DEFAULT_OPEN_BEHAVIOR);

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  const setOpenBehavior = useCallback((value: OpenBehavior) => {
    setOpenBehaviorState(value);
    postToHost({ type: 'settings:setOpenBehavior', openBehavior: value });
  }, []);

  const applyCurrent = useCallback((value: OpenBehavior) => {
    // Never touches `open` — see applySettingsCurrent (settings-state.ts).
    setOpenBehaviorState(value);
  }, []);

  return { open, openBehavior, openPanel, closePanel, setOpenBehavior, applyCurrent };
}

