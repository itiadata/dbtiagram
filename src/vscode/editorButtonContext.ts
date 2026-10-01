/**
 * Keeps the `dbtiagram.isModelYml` context key in sync with the active editor
 * and the set of model files discovered with `dbtiagram.modelFileGlob`. The
 * editor/title menu item in package.json depends on that key.
 */
import * as vscode from 'vscode';
import {
  editorButtonContexts,
  layoutFileContextKey,
  modelFileContextKey,
  sourceFileContextKey,
  sqlFileContextKey,
} from './editorButton';

export function registerEditorTitleButton(): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const updateContext = async (): Promise<void> => {
    const active = vscode.window.activeTextEditor;
    const configuration = vscode.workspace.getConfiguration('dbtiagram');
    const contexts = editorButtonContexts(
      active?.document.uri.fsPath,
      active?.document.getText(),
      configuration.get<string>('modelFileGlob', '**/models/**/*.yml'),
      configuration.get<string>('sourceFileGlob', '**/models/**/*.yml'),
    );
    await Promise.all([
      vscode.commands.executeCommand('setContext', modelFileContextKey, contexts.model),
      vscode.commands.executeCommand('setContext', sourceFileContextKey, contexts.source),
      vscode.commands.executeCommand('setContext', sqlFileContextKey, contexts.sql),
      vscode.commands.executeCommand('setContext', layoutFileContextKey, contexts.layout),
    ]);
  };

  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(() => void updateContext()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) void updateContext();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('dbtiagram.modelFileGlob') || event.affectsConfiguration('dbtiagram.sourceFileGlob')) {
        void updateContext();
      }
    }),
  );

  void updateContext();
  return disposables;
}
