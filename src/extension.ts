/**
 * Extension entry point: activate / deactivate lifecycles only.
 * All behavior lives in isolated modules; nothing else may live here.
 */
import * as vscode from 'vscode';
import { DiagramPanel } from './webview/panel';
import type { DiagramSource } from './webview/panelKey';
import { registerEditorTitleButton } from './vscode/editorButtonContext';

/** Distinguishes palette invocations that have no file to be identified by. */
let adhocCounter = 0;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    // Opens a diagram scoped to the active model.yml, one tab per file
    // (spec 14). Without a file-backed editor every invocation opens a new tab.
    vscode.commands.registerCommand('dbtiagram.open', (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      const source: DiagramSource =
        uri !== undefined && uri.scheme === 'file'
          ? { kind: 'model', fsPath: uri.fsPath }
          : { kind: 'adhoc', id: String((adhocCounter += 1)) };
      return DiagramPanel.createOrShow(context.extensionUri, source, context.workspaceState);
    }),
    // Opens the diagram with a saved layout applied (spec 13). The editor/title
    // menu passes the active resource; fall back to the active editor.
    vscode.commands.registerCommand('dbtiagram.openLayout', (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      const source: DiagramSource =
        uri !== undefined && uri.scheme === 'file'
          ? { kind: 'layout', fsPath: uri.fsPath }
          : { kind: 'adhoc', id: String((adhocCounter += 1)) };
      return DiagramPanel.createOrShow(context.extensionUri, source, context.workspaceState);
    }),
  );

  for (const disposable of registerEditorTitleButton()) {
    context.subscriptions.push(disposable);
  }

  // Live model.yml watching (typing, save, create/delete/rename) is registered
  // per panel by DiagramPanel (spec 04); nothing else is needed here.
}

export function deactivate(): void {
  // No asynchronous teardown required yet.
}
