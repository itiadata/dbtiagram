/**
 * Isolated wrapper for every file-system touch point with the VS Code API.
 * This module is the ONLY place that reads/writes workspace files.
 */
import * as vscode from 'vscode';
import { parseModelYml, ModelYmlParseError, NotAModelYmlFileError } from '../dbt/parse';
import { serializeModelYml } from '../dbt/serialize';
import { mergeModelYml } from '../dbt/merge';
import { isLayoutFilePath } from '../diagram/layoutFile';
import type { ModelYmlFile } from '../dbt/types';
import type { DeclarationPosition } from '../dbt/locate';

export interface ModelYmlRecord {
  uri: vscode.Uri;
  file: ModelYmlFile;
}

/** A model.yml file that failed to parse during a workspace scan. */
export interface ModelYmlFailure {
  uri: vscode.Uri;
  message: string;
}

export interface ModelYmlLoadResult {
  records: ModelYmlRecord[];
  failures: ModelYmlFailure[];
}

/** Reads a workspace file as UTF-8 text. */
export async function readFileText(uri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}

/**
 * Discovers and parses every model.yml file in the workspace. Files that fail
 * to parse are reported in `failures` (with their uri) instead of being
 * dropped silently, so callers can keep last-good data and surface the error
 * (spec 04).
 */
export async function loadModelYmlFiles(glob = '**/models/**/*.yml'): Promise<ModelYmlLoadResult> {
  const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
  const records: ModelYmlRecord[] = [];
  const failures: ModelYmlFailure[] = [];

  for (const uri of uris) {
    // Saved diagram layouts (spec 13) may live under models/ and are never
    // model files, so they must not be parsed or reported as failures.
    if (isLayoutFilePath(uri.fsPath)) {
      continue;
    }
    try {
      const content = await readFileText(uri);
      records.push({ uri, file: parseModelYml(content, uri.fsPath) });
    } catch (err) {
      // Non-model YAML files (e.g. sources.yml with no "models" key) are
      // silently ignored rather than reported as parse failures (spec 04).
      if (err instanceof NotAModelYmlFileError) {
        continue;
      }
      const message =
        err instanceof ModelYmlParseError
          ? err.message
          : `Failed to read ${uri.fsPath}: ${String(err)}`;
      failures.push({ uri, message });
    }
  }

  return { records, failures };
}

/** Writes a model.yml file back to disk.
 *
 * The current on-disk text is read fresh (not taken from the in-memory store)
 * and patched surgically, so unknown keys, key order and comments survive
 * (spec 29). If the file cannot be read, the full serializer is used instead
 * so the edit is never dropped.
 */
export async function writeModelYmlFile(uri: vscode.Uri, file: ModelYmlFile): Promise<void> {
  let text: string | undefined;
  try {
    text = await readFileText(uri);
  } catch {
    text = undefined;
  }
  const content = text === undefined ? serializeModelYml(file) : mergeModelYml(text, file);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

/**
 * Opens `uri` and selects the declaration at `position` (spec 15). A `null`
 * position places the cursor at the top of the file. This is the only editor
 * touch point in the extension.
 *
 * A file that already has a tab is reused and focused where it is, so the
 * action never spawns a duplicate tab; only a file with no tab opens beside
 * the diagram.
 */
export async function revealInEditor(
  uri: vscode.Uri,
  position: DeclarationPosition | null,
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const existingColumn = findOpenViewColumn(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: existingColumn ?? vscode.ViewColumn.Beside,
    preserveFocus: false,
    // An already-open tab must not be demoted to a preview tab.
    preview: existingColumn === undefined,
  });

  const selection =
    position === null
      ? new vscode.Selection(0, 0, 0, 0)
      : new vscode.Selection(
          position.line,
          position.column,
          position.line,
          position.column + position.length,
        );

  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * The view column of an editor/tab already showing `uri`, or undefined. Visible
 * editors are checked first; `tabGroups` then catches tabs that are open but
 * currently in the background of their group.
 */
function findOpenViewColumn(uri: vscode.Uri): vscode.ViewColumn | undefined {
  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.fsPath === uri.fsPath,
  );
  if (visible?.viewColumn !== undefined) {
    return visible.viewColumn;
  }

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === uri.fsPath) {
        return group.viewColumn;
      }
    }
  }

  return undefined;
}
