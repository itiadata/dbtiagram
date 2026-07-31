/**
 * Pure helpers for the editor title bar button. No VS Code imports — safe for
 * unit tests.
 */

/** Context key gating the editor/title menu item. */
export const modelFileContextKey = 'dbtiagram.isModelYml';

/**
 * Whether the editor title bar button should be visible: true only when the
 * active editor file is one of the known model files.
 */
export function shouldShowButton(
  activePath: string | undefined,
  modelPaths: ReadonlySet<string>,
): boolean {
  if (activePath === undefined || activePath === '') {
    return false;
  }
  return modelPaths.has(activePath);
}
