/**
 * Diagram panel identity (spec 14): each source file gets its own diagram tab.
 *
 * Pure logic — MUST NOT import `vscode`, so the registry keying rules stay
 * unit-testable without an Electron host.
 */
import { stripLayoutSuffix } from '../diagram/layoutFile';

/** What a diagram tab was opened from. Its identity and title derive from this. */
export type DiagramSource =
  | { kind: 'layout'; fsPath: string }
  | { kind: 'model'; fsPath: string }
  | { kind: 'adhoc'; id: string };

/** Base title shared by every diagram tab. */
const BASE_TITLE = 'dbt Diagram';

/** Whether the host platform compares file paths case-insensitively. */
export function defaultCaseInsensitive(): boolean {
  return process.platform === 'win32';
}

/**
 * The registry key for a source. Two sources map to the same key exactly when
 * they should share a tab.
 *
 * `caseInsensitive` is a parameter rather than a `process.platform` read inside
 * the function so this module stays pure and testable on any platform.
 */
export function diagramPanelKey(
  source: DiagramSource,
  caseInsensitive: boolean = defaultCaseInsensitive(),
): string {
  if (source.kind === 'adhoc') {
    return `adhoc:${source.id}`;
  }
  return `${source.kind}:${normalizePath(source.fsPath, caseInsensitive)}`;
}

/**
 * The tab title for a source: the layout name or the file's base name, so two
 * open diagrams are distinguishable. `layoutName` overrides the derived name
 * once the layout file has been read (or re-named by a save).
 */
export function diagramPanelTitle(source: DiagramSource, layoutName?: string): string {
  switch (source.kind) {
    case 'layout': {
      const name =
        layoutName !== undefined && layoutName !== ''
          ? layoutName
          : stripLayoutSuffix(baseName(source.fsPath));
      return `${BASE_TITLE} — ${name}`;
    }
    case 'model':
      return `${BASE_TITLE} — ${baseName(source.fsPath)}`;
    case 'adhoc':
      return BASE_TITLE;
  }
}

/** Unifies `\` and `/` separators, and case when the platform ignores it. */
function normalizePath(fsPath: string, caseInsensitive: boolean): string {
  const unified = fsPath.replace(/\\/g, '/');
  return caseInsensitive ? unified.toLowerCase() : unified;
}

function baseName(fsPath: string): string {
  const parts = fsPath.split(/[\\/]/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? fsPath;
}
