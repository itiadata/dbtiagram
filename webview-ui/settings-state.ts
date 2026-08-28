/**
 * Pure state helpers for the settings overlay hook (spec 23), kept apart from
 * `useSettings.ts` so tests can import them without pulling in `host.ts`'s
 * module-load-time `acquireVsCodeApi()` call.
 */
import type { OpenBehavior } from '../src/shared/openBehavior';

export interface SettingsPanelState {
  open: boolean;
  openBehavior: OpenBehavior;
}

/**
 * Pure reducer for the `settings:current` host message: only ever changes
 * `openBehavior`, and never `open` — a value pushed from another panel must
 * not pop this one's overlay open.
 */
export function applySettingsCurrent(
  state: SettingsPanelState,
  value: OpenBehavior,
): SettingsPanelState {
  return { open: state.open, openBehavior: value };
}
