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
  sourceFileContextKey,
  classifyDbtYml,
  shouldShowButton,
} from './editorButton';
import { isLayoutFilePath } from '../diagram/layoutFile';

export function registerEditorTitleButton(): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  let modelPaths = new Set<string>();
  let sourcePaths = new Set<string>();
  let syncing = false;

  const updateContext = async (): Promise<void> => {
    const active = vscode.window.activeTextEditor;
    const activePath = active?.document.uri.fsPath;
    await vscode.commands.executeCommand(
      'setContext',
      modelFileContextKey,
      shouldShowButton(activePath, modelPaths),
    );
    await vscode.commands.executeCommand('setContext', sourceFileContextKey, shouldShowButton(activePath, sourcePaths));
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
      const sourceGlob = vscode.workspace.getConfiguration('dbtiagram').get<string>('sourceFileGlob', '**/models/**/*.yml');
      const [modelUris, sourceUris] = await Promise.all([vscode.workspace.findFiles(glob, '**/node_modules/**'), vscode.workspace.findFiles(sourceGlob, '**/node_modules/**')]);
      modelPaths = new Set(); sourcePaths = new Set();
      const unique = new Map([...modelUris, ...sourceUris].map((uri) => [uri.fsPath, uri]));
      for (const uri of unique.values()) {
        if (isLayoutFilePath(uri.fsPath)) continue;
        try {
          const kind = classifyDbtYml(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
          if (kind === 'model' && modelUris.some((candidate) => candidate.fsPath === uri.fsPath)) modelPaths.add(uri.fsPath);
          if (kind === 'source' && sourceUris.some((candidate) => candidate.fsPath === uri.fsPath)) sourcePaths.add(uri.fsPath);
        } catch { /* unreadable candidates are not classified */ }
      }
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
      if (event.affectsConfiguration('dbtiagram.modelFileGlob') || event.affectsConfiguration('dbtiagram.sourceFileGlob')) {
        void refresh();
      }
    }),
  );

  void refresh();
  return disposables;
}
