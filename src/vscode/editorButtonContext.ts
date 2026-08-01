/**
 * Keeps the `dbtiagram.isModelYml` context key in sync with the active editor
 * and the set of model files discovered with `dbtiagram.modelFileGlob`. The
 * editor/title menu item in package.json depends on that key.
 */
import * as vscode from 'vscode';
import {
  isDiagramLayoutFile,
  layoutFileContextKey,
  modelFileContextKey,
  shouldShowButton,
} from './editorButton';
import { isLayoutFilePath } from '../diagram/layoutFile';

export function registerEditorTitleButton(): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  let modelPaths = new Set<string>();
  let syncing = false;

  const updateContext = async (): Promise<void> => {
    const active = vscode.window.activeTextEditor;
    const activePath = active?.document.uri.fsPath;
    await vscode.commands.executeCommand(
      'setContext',
      modelFileContextKey,
      shouldShowButton(activePath, modelPaths),
    );
    // Layout files are recognized by their path alone (spec 13).
    await vscode.commands.executeCommand(
      'setContext',
      layoutFileContextKey,
      isDiagramLayoutFile(activePath),
    );
  };

  const refresh = async (): Promise<void> => {
    if (syncing) {
      return;
    }
    syncing = true;
    try {
      const glob = vscode.workspace
        .getConfiguration('dbtiagram')
        .get<string>('modelFileGlob', '**/models/**/*.yml');
      const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
      modelPaths = new Set(
        uris.map((uri) => uri.fsPath).filter((fsPath) => !isLayoutFilePath(fsPath)),
      );
    } finally {
      syncing = false;
    }
    await updateContext();
  };

  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(() => void updateContext()),
    vscode.workspace.onDidCreateFiles(() => void refresh()),
    vscode.workspace.onDidDeleteFiles(() => void refresh()),
    vscode.workspace.onDidRenameFiles(() => void refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('dbtiagram.modelFileGlob')) {
        void refresh();
      }
    }),
  );

  void refresh();
  return disposables;
}
