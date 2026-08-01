/**
 * Isolated wrapper for every VS Code touch point involving saved diagram layout
 * files (spec 13). This module is the ONLY place that reads/writes
 * `*.dbtiagram.yml` or shows the save dialog.
 */
import * as vscode from 'vscode';
import {
  defaultLayoutName,
  LAYOUT_FILE_SUFFIX,
  parseDiagramLayout,
  serializeDiagramLayout,
  stripLayoutSuffix,
  type DiagramLayout,
} from '../diagram/layoutFile';

/** Reads and parses a saved diagram layout file. */
export async function readLayoutFile(uri: vscode.Uri): Promise<DiagramLayout> {
  const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  return parseDiagramLayout(text, defaultLayoutName(uri.fsPath));
}

/** Writes a layout back to disk. */
export async function writeLayoutFile(uri: vscode.Uri, layout: DiagramLayout): Promise<void> {
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(serializeDiagramLayout(layout), 'utf8'),
  );
}

/**
 * Asks the user where to save a diagram. Returns undefined when the dialog is
 * dismissed.
 *
 * The suggested name is deliberately extension-less: VS Code appends the
 * filter's extension itself, so passing `mydiagram.dbtiagram.yml` here yields
 * `mydiagram.dbtiagram.yml.dbtiagram.yml` in the dialog. The chosen path is
 * still normalized, covering dialogs that do not append it.
 */
export async function promptForLayoutPath(defaultName: string): Promise<vscode.Uri | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  const suggestion = stripLayoutSuffix(defaultName);
  const chosen = await vscode.window.showSaveDialog({
    defaultUri: root ? vscode.Uri.joinPath(root, suggestion) : undefined,
    saveLabel: 'Save Diagram',
    filters: { 'dbt Diagram': ['dbtiagram.yml'] },
  });
  if (chosen === undefined) {
    return undefined;
  }
  return chosen.fsPath.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX)
    ? chosen
    : vscode.Uri.file(`${chosen.fsPath}${LAYOUT_FILE_SUFFIX}`);
}
