/**
 * Shared type for the "Open new diagrams" setting (spec 23). Pure — MUST NOT
 * import `vscode`.
 */

export type OpenBehavior = 'newTab' | 'splitTab' | 'reuseWindow' | 'newWindow';

/** Default is "always separate window" (spec 23 fix). */
export const DEFAULT_OPEN_BEHAVIOR: OpenBehavior = 'newWindow';

export interface OpenBehaviorOption {
  value: OpenBehavior;
  label: string;
  description: string;
}

export const OPEN_BEHAVIOR_OPTIONS: readonly OpenBehaviorOption[] = [
  {
    value: 'newTab',
    label: 'New tab',
    description: 'Opens in the same editor group as the last focused tab.',
  },
  {
    value: 'splitTab',
    label: 'Split and new tab',
    description: 'Opens beside the last focused tab.',
  },
  {
    value: 'reuseWindow',
    label: 'Separate window (reuse)',
    description:
      'Opens in its own window the first time; later diagrams are added as tabs to that same window while it stays open.',
  },
  {
    value: 'newWindow',
    label: 'Always separate window',
    description: 'Every diagram always opens in its own new window (default).',
  },
];
