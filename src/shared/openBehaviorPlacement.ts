/**
 * Pure decision logic for where a new diagram panel should be placed, given
 * the user's "Open new diagrams" setting (spec 23). No VS Code imports — the
 * vscode-facing wrapper (`src/vscode/openBehaviorWindows.ts`) supplies the
 * live "is there a reusable separate window?" lookup and turns this decision
 * into real `ViewColumn` values / commands.
 */
import type { OpenBehavior } from './openBehavior';

/** A previously-tracked separate window's tab group, if one is still open. */
export interface ReuseTarget {
  /** The tab group's current view column, to target it directly. */
  viewColumn: number;
}

export type PlacementDecision =
  /** Open in the active editor group. */
  | { kind: 'active'; shouldTrack: false }
  /** Open beside the active editor group (today's default). */
  | { kind: 'beside'; shouldTrack: false }
  /** Open directly into a previously-tracked separate window's group. */
  | { kind: 'column'; viewColumn: number; shouldTrack: false }
  /**
   * Create normally, then move to a brand-new separate window.
   * `shouldTrack` says whether to remember the resulting group for future
   * "Separate window (reuse)" opens.
   */
  | { kind: 'newWindow'; shouldTrack: boolean };

/**
 * Decides placement for `behavior`. `reuseTarget` is the tracked separate
 * window's group, if `resolvePlacement`'s caller found one still open —
 * only consulted for `'reuseWindow'`.
 */
export function decidePlacement(
  behavior: OpenBehavior,
  reuseTarget: ReuseTarget | undefined,
): PlacementDecision {
  switch (behavior) {
    case 'newTab':
      return { kind: 'active', shouldTrack: false };
    case 'splitTab':
      return { kind: 'beside', shouldTrack: false };
    case 'newWindow':
      return { kind: 'newWindow', shouldTrack: false };
    case 'reuseWindow':
      if (reuseTarget !== undefined) {
        return { kind: 'column', viewColumn: reuseTarget.viewColumn, shouldTrack: false };
      }
      return { kind: 'newWindow', shouldTrack: true };
  }
}
