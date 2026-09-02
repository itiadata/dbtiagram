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
 * Opens `uri` as a normal tab in the main VS Code window (never a split, and
 * never the diagram's own auxiliary window when the diagram was moved to a
 * separate window), reusing an existing tab where the file is already open.
 * Unlike `revealInEditor`, it never sets a selection, so the caret in an
 * already-open file is left exactly where the user left it.
 */
export async function openSqlFile(uri: vscode.Uri): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const existingColumn = findOpenViewColumn(uri);
  await vscode.window.showTextDocument(doc, {
    // `ViewColumn.One` (rather than `Active`) always resolves to the main
    // window's editor area, even when the diagram panel itself currently has
    // focus in a separate auxiliary window (spec 23's "Separate window" open
    // behavior) — `Active` would instead reopen the file right there.
    viewColumn: existingColumn ?? vscode.ViewColumn.One,
    preserveFocus: false,
    // An already-open tab must not be demoted to a preview tab.
    preview: existingColumn === undefined,
  });
}
