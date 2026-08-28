/**
 * Vscode-facing persistence of matrix grid column preferences (spec 27):
 * reads/writes `StoredMatrixColumnPref[]` per `MatrixScope` via
 * `ExtensionContext.workspaceState`.
 */
import * as vscode from 'vscode';
import type { MatrixScope, StoredMatrixColumnPref } from '../shared/matrixColumns';

function stateKey(scope: MatrixScope): string {
  return `dbtiagram.matrixColumns.${scope}`;
}

export function readMatrixColumnPrefs(
  state: vscode.Memento,
  scope: MatrixScope,
): StoredMatrixColumnPref[] | undefined {
  return state.get<StoredMatrixColumnPref[]>(stateKey(scope));
}

export function writeMatrixColumnPrefs(
  state: vscode.Memento,
  scope: MatrixScope,
  columns: StoredMatrixColumnPref[],
): Thenable<void> {
  return state.update(stateKey(scope), columns);
}
