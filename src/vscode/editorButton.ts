/**
 * Pure helpers for the editor title bar button. No VS Code imports — safe for
 * unit tests.
 */
import { isLayoutFilePath } from '../diagram/layoutFile';

/** Context key gating the editor/title menu item. */
export const modelFileContextKey = 'dbtiagram.isModelYml';

/** Context key gating the "Open dbt Diagram" item for saved layout files. */
export const layoutFileContextKey = 'dbtiagram.isDiagramLayout';

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

/**
 * Whether the active editor holds a saved diagram layout file (spec 13). This
 * is a pure path test, so no workspace scan is needed.
 */
export function isDiagramLayoutFile(activePath: string | undefined): boolean {
  return isLayoutFilePath(activePath);
}

