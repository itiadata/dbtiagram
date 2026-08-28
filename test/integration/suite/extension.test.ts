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

    // Spec 13: a second button opens a saved diagram layout file.
    const layoutEntry = titleMenu!.find((item) => item.command === 'dbtiagram.openLayout');
    assert.ok(layoutEntry, 'dbtiagram.openLayout must be contributed to the editor title menu');
    assert.ok(
      layoutEntry.when?.includes('dbtiagram.isDiagramLayout'),
      'the layout button must be gated by the layout-file context key',
    );
  });

  test('openLayout command opens the diagram with a saved layout', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('dbtiagram.openLayout'),
      'the "dbtiagram.openLayout" command must be registered after activation',
    );

    const layoutUri = vscode.Uri.file(
      path.resolve(__dirname, '../../../../fixtures/sample-dbt/diagrams/orders.dbtiagram.yml'),
    );
    const before = fs.readFileSync(layoutUri.fsPath, 'utf8');

    await vscode.commands.executeCommand('dbtiagram.openLayout', layoutUri);
    const appeared = await waitFor(() => hasDiagramTab(), 10_000);
    assert.ok(appeared, 'the diagram webview should open for a saved layout file');

    // Opening alone must never rewrite the file (writes are webview-driven).
    assert.strictEqual(
      fs.readFileSync(layoutUri.fsPath, 'utf8'),
      before,
      'opening a layout must not modify it',
    );
  });

  test('open command works with a model.yml file as the active editor', async () => {    const modelUri = vscode.Uri.file(
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

  // Spec 14: each source file gets its own diagram tab.
  test('two different layout files open two diagram tabs', async () => {
    const orders = vscode.Uri.file(
      path.resolve(__dirname, '../../../../fixtures/sample-dbt/diagrams/orders.dbtiagram.yml'),
    );
    const customers = vscode.Uri.file(
      path.resolve(__dirname, '../../../../fixtures/sample-dbt/diagrams/customers.dbtiagram.yml'),
    );

    await vscode.commands.executeCommand('dbtiagram.openLayout', orders);
    await waitFor(() => diagramTabLabels().includes('orders — dbt Diagram'), 10_000);

    await vscode.commands.executeCommand('dbtiagram.openLayout', customers);
    const both = await waitFor(() => {
      const labels = diagramTabLabels();
      return (
        labels.includes('orders — dbt Diagram') && labels.includes('customers — dbt Diagram')
      );
    }, 10_000);
    assert.ok(
      both,
      `two different layout files must yield two diagram tabs, got ${JSON.stringify(
        diagramTabLabels(),
      )}`,
    );

    // Re-opening the same layout reveals its tab instead of adding another.
    const before = diagramTabLabels().length;
    await vscode.commands.executeCommand('dbtiagram.openLayout', customers);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    assert.strictEqual(
      diagramTabLabels().length,
      before,
      're-opening the same layout must not create a second tab',
    );
  });
});

/** Labels of every open diagram tab. */
function diagramTabLabels(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => tab.label)
    .filter((label) => label.endsWith('dbt Diagram'));
}

function tabCount(): number {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).length;
}

function hasDiagramTab(): boolean {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .some((tab) => tab.label.endsWith('dbt Diagram'));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return predicate();
}
