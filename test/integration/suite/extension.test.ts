/**
 * Smoke tests that run inside a real VS Code host.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'your-publisher-name.dbtiagram';

suite('dbtiagram extension', () => {
  test('executes a model rename transaction on workspace files', async () => {
    const module = await import('../../../src/webview/modelRename');
    const adapter = await import('../../../src/vscode/modelRename');
    const root = path.resolve(__dirname, '../../../../fixtures/sample-dbt/.rename-test');
    const yaml = path.join(root, 'schema.yml'); const sql = path.join(root, 'orders.sql'); const renamed = path.join(root, 'sales_orders.sql');
    fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(yaml, 'before yaml'); fs.writeFileSync(sql, 'before sql');
    try {
      await module.executeModelRename(adapter.vscodeModelRenameFiles, {
        textFiles: [{ path: yaml, before: 'before yaml', after: 'after yaml' }, { path: sql, before: 'before sql', after: 'after sql' }],
        sqlRename: { from: sql, to: renamed },
      });
      assert.ok(!fs.existsSync(sql)); assert.ok(fs.existsSync(renamed));
      assert.strictEqual(fs.readFileSync(yaml, 'utf8'), 'after yaml'); assert.strictEqual(fs.readFileSync(renamed, 'utf8'), 'after sql');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

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
    assert.ok(commands.includes('dbtiagram.openSource'), 'the source-open command must be registered');
  });

  test('discovers project model SQL for lineage', async () => {
    const { findProjectModelSql } = await import('../../../src/vscode/lineageFiles');
    const model = vscode.Uri.file(path.resolve(__dirname, '../../../../fixtures/sample-dbt/models/order_summary.sql'));
    const root = vscode.Uri.file(path.resolve(__dirname, '../../../../fixtures/sample-dbt'));
    const files = await findProjectModelSql({ root, config: { name: 'sample', modelPaths: ['models'], macroPaths: ['macros'], testPaths: ['tests'], snapshotPaths: ['snapshots'] } });
    assert.ok(files.some((file) => file.modelId === 'order_summary' && file.uri.fsPath === model.fsPath));
  });

  test('lineage watcher watches only its exact SQL files', async () => {
    const { watchLineageSqlFiles } = await import('../../../src/vscode/lineageFiles');
    const root = path.resolve(__dirname, '../../../../fixtures/sample-dbt/.lineage-watch-test');
    const displayed = path.join(root, 'displayed.sql');
    const hidden = path.join(root, 'hidden.sql');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(displayed, 'select 1');
    fs.writeFileSync(hidden, 'select 1');
    const changed: string[] = [];
    const watcher = watchLineageSqlFiles([vscode.Uri.file(displayed)], (uri) => changed.push(uri.fsPath));
    try {
      fs.writeFileSync(hidden, 'select 2');
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.strictEqual(changed.length, 0);
      fs.writeFileSync(displayed, 'select 2');
      const observed = await waitFor(() => changed.includes(displayed), 5_000);
      assert.ok(observed, 'the exact displayed SQL file should be watched');
    } finally {
      watcher.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cancels a downstream lineage scan atomically', async () => {
    const { expandDownstream } = await import('../../../src/webview/lineage');
    let reads = 0;
    const result = await expandDownstream({
      readModelSql: async () => { reads += 1; return "{{ ref('root') }}"; },
      allProjectModelIds: async () => ['a', 'b', 'c'],
      resolveModelNode: async (_packageName, name) => ({ id: name, label: name, columns: [], foreignKeys: [], foreignKeyColumns: [], lineageKind: 'local', packageName: 'sample' }),
      resolveSourceNode: async (sourceName, tableName) => ({ id: `source:${sourceName}:${tableName}`, label: tableName, columns: [], foreignKeys: [], foreignKeyColumns: [], entityKind: 'source' }),
      progress: () => undefined,
      isCancelled: () => reads >= 1,
    }, 'cancel-test', 'root');
    assert.strictEqual(result, null);
  });

  test('source command opens a combined diagram scoped from a source file', async () => {
    const sourceUri = vscode.Uri.file(
      path.resolve(__dirname, '../../../../fixtures/sample-dbt/models/sources/finops.yml'),
    );
    await vscode.commands.executeCommand('dbtiagram.openSource', sourceUri);
    const appeared = await waitFor(() => diagramTabLabels().includes('finops.yml — dbt Diagram'), 10_000);
    assert.ok(appeared, 'the source diagram should open for the source fixture');
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
