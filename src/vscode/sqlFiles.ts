/**
 * Isolated wrapper for discovering and opening `.sql` files (spec 38).
 */
import * as vscode from 'vscode';
import { indexSqlPaths } from '../shared/sqlFiles';
import { findOpenViewColumn } from './project';

/** Discovers every `.sql` file matching `glob`, indexed by model name. */
export async function findSqlFiles(glob: string): Promise<Map<string, string>> {
  const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
  return indexSqlPaths(uris.map((uri) => uri.fsPath));
}

/**
 * Opens `uri` as a normal tab in the active editor group, reusing an existing
 * tab where the file is already open. Unlike `revealInEditor`, it never opens
 * beside the diagram (no split) and never sets a selection, so the caret in
 * an already-open file is left exactly where the user left it.
 */
export async function openSqlFile(uri: vscode.Uri): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const existingColumn = findOpenViewColumn(uri);
  await vscode.window.showTextDocument(doc, {
    viewColumn: existingColumn ?? vscode.ViewColumn.Active,
    preserveFocus: false,
    // An already-open tab must not be demoted to a preview tab.
    preview: existingColumn === undefined,
  });
}
