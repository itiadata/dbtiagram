/**
 * Smoke tests that run inside a real VS Code host.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'your-publisher-name.dbtiagram';

suite('dbtiagram extension', () => {
  test('extension activates and registers the open command', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension "${EXTENSION_ID}" must be loaded in the test host`);

    if (!ext.isActive) {
      await ext.activate();
    }

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('dbtiagram.open'),
      'the "dbtiagram.open" command must be registered after activation',
    );
  });

  test('open command creates a webview panel', async () => {
    const before = tabCount();

    await vscode.commands.executeCommand('dbtiagram.open');

    const appeared = await waitFor(() => tabCount() > before, 10_000);
    assert.ok(appeared, 'opening the diagram should create a new editor tab');
  });

  test('editor title bar button is contributed for model files', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as {
      contributes: {
        menus: { 'editor/title'?: Array<{ command: string; when?: string }> };
      };
    };

    const titleMenu = pkg.contributes.menus['editor/title'];
    assert.ok(Array.isArray(titleMenu), 'an editor/title menu must be contributed');

    const entry = titleMenu!.find((item) => item.command === 'dbtiagram.open');
    assert.ok(entry, 'dbtiagram.open must be contributed to the editor title menu');
    assert.ok(
      entry.when?.includes('dbtiagram.isModelYml'),
      'the button must be gated by the model-file context key',
    );
  });

  test('open command works with a model.yml file as the active editor', async () => {
    const modelUri = vscode.Uri.file(
      path.resolve(__dirname, '../../../../fixtures/sample-dbt/models/orders.yml'),
    );
    const doc = await vscode.workspace.openTextDocument(modelUri);
    await vscode.window.showTextDocument(doc);
    assert.ok(
      vscode.window.activeTextEditor?.document.uri.fsPath === modelUri.fsPath,
      'the model.yml file should be the active editor',
    );

    await vscode.commands.executeCommand('dbtiagram.open');
    const appeared = await waitFor(() => hasDiagramTab(), 10_000);
    assert.ok(
      appeared,
      'the diagram webview should be created or revealed with a model file active',
    );
  });
});

function tabCount(): number {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).length;
}

function hasDiagramTab(): boolean {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .some((tab) => tab.label === 'dbt Diagram');
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return predicate();
}
