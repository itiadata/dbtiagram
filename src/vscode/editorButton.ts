/**
 * Pure helpers for the editor title bar button. No VS Code imports — safe for
 * unit tests.
 */
import { isLayoutFilePath } from '../diagram/layoutFile';
import { parse } from 'yaml';
import type { DiagramMode } from '../shared/diagramMode';

/** Context key gating the editor/title menu item. */
export const modelFileContextKey = 'dbtiagram.isModelYml';
export const sourceFileContextKey = 'dbtiagram.isSourceYml';
export type DbtYmlKind = DiagramMode | 'none';

export function classifyDbtYml(content: string): DbtYmlKind {
  try {
    const raw: unknown = parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'none';
    const record = raw as Record<string, unknown>;
    if ('models' in record) return 'model';
    if ('sources' in record) return 'source';
    return 'none';
  } catch { return 'none'; }
}

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
