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
