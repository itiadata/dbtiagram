/**
 * Extension entry point: activate / deactivate lifecycles only.
 * All behavior lives in isolated modules; nothing else may live here.
 */
import * as vscode from 'vscode';
import { DiagramPanel } from './webview/panel';
import { registerEditorTitleButton } from './vscode/editorButtonContext';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtiagram.open', () =>
      DiagramPanel.createOrShow(context.extensionUri),
    ),
    // Opens the diagram with a saved layout applied (spec 13). The editor/title
    // menu passes the active resource; fall back to the active editor.
    vscode.commands.registerCommand('dbtiagram.openLayout', (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      return DiagramPanel.createOrShow(context.extensionUri, uri);
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
