/**
 * Extension-host side of the webview panel: owns the webview, the in-memory
 * model store, and persistence. Handles webview edit messages and live
 * model.yml changes from the workspace (spec 04).
 */
import * as vscode from 'vscode';
import { applyEdit } from '../dbt/edit';
import type { ModelEdit } from '../dbt/edit';
import {
  applyFileDeleted,
  applyFileRenamed,
  applyTextChange,
  createModelStore,
  distributeEditedModels,
  replaceModelStore,
  upsertRecord,
  type ModelStore,
} from '../dbt/modelStore';
import type { ModelDefinition } from '../dbt/types';
import { buildDiagram } from '../diagram/graph';
import { matchesGlob } from '../shared/glob';
import { disambiguateFileLabels } from '../shared/labels';
import type { DiagramModelFile, MessageToExtension, MessageToWebview } from '../shared/protocol';
import { registerModelWatcher } from '../vscode/modelWatcher';
import { loadModelYmlFiles, readFileText, writeModelYmlFile } from '../vscode/project';

/** Ignore text-change echoes of our own disk writes within this window. */
const SELF_WRITE_IGNORE_MS = 250;

export class DiagramPanel {
  public static readonly viewType = 'dbtiagram.diagramPanel';
  public static current: DiagramPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private store: ModelStore;
  /** fsPath -> timestamp of our own disk writes, to ignore their echo. */
  private readonly selfWrites = new Map<string, number>();

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    store: ModelStore,
  ) {
    this.panel = panel;
    this.store = store;
    this.publish();

    this.disposables.push(
      ...registerModelWatcher({
        getGlob: () => this.modelGlob,
        getEnabled: () =>
          vscode.workspace.getConfiguration('dbtiagram').get<boolean>('watchModelFiles', true),
        onDocumentChanged: (uri, content) => this.onDocumentChanged(uri, content),
        onFilesCreated: (uris) => void this.onFilesCreated(uris),
        onFilesDeleted: (uris) => this.onFilesDeleted(uris),
        onFilesRenamed: (oldUri, newUri) => void this.onFilesRenamed(oldUri, newUri),
        onConfigurationChanged: () => void this.refresh(),
      }),
    );

    panel.webview.onDidReceiveMessage(
      (message: MessageToExtension) => {
        void this.onMessage(message);
      },
      undefined,
      this.disposables,
    );

    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (DiagramPanel.current) {
      DiagramPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DiagramPanel.viewType,
      'dbt Diagram',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
    );

    const result = await loadModelYmlFiles(this.modelFileGlob());
    const store = replaceModelStore(
      createModelStore(),
      result.records.map((record) => ({ uri: record.uri.fsPath, file: record.file })),
      result.failures.map((failure) => ({ uri: failure.uri.fsPath, error: failure.message })),
    );

    DiagramPanel.current = new DiagramPanel(panel, extensionUri, store);
    panel.webview.html = DiagramPanel.current.getHtml();
  }

  private static modelFileGlob(): string {
    return vscode.workspace
      .getConfiguration('dbtiagram')
      .get<string>('modelFileGlob', '**/models/**/*.yml');
  }

  private get modelGlob(): string {
    return DiagramPanel.modelFileGlob();
  }

  private publish(): void {
    const models: ModelDefinition[] = this.store.records.flatMap((record) => record.file.models);
    const pendingErrors = [...this.store.pendingErrors.entries()].map(([uri, message]) => ({
      uri,
      message,
    }));

    // Per-file metadata the webview uses to filter the diagram (spec 05). The
    // full graph is always sent; filtering is a webview-side view concern.
    const uris = this.store.records.map((record) => record.uri);
    const labels = disambiguateFileLabels(uris, workspaceRoot());
    const modelFiles: DiagramModelFile[] = this.store.records.map((record) => ({
      uri: record.uri,
      label: labels.get(record.uri) ?? fallbackLabel(record.uri),
      models: record.file.models.map((model) => model.name),
    }));

    this.postMessage({
      type: 'diagram:update',
      diagram: buildDiagram(models),
      pendingErrors,
      modelFiles,
    });
  }

  /** Reloads every model.yml file from disk, keeping last good data for broken files. */
  public async refresh(): Promise<void> {
    const result = await loadModelYmlFiles(this.modelGlob);
    this.store = replaceModelStore(
      this.store,
      result.records.map((record) => ({ uri: record.uri.fsPath, file: record.file })),
      result.failures.map((failure) => ({ uri: failure.uri.fsPath, error: failure.message })),
    );
    this.publish();
  }

  private onDocumentChanged(uri: vscode.Uri, content: string): void {
    const fsPath = uri.fsPath;
    if (this.isSelfWrite(fsPath)) return;
    this.store = applyTextChange(this.store, fsPath, content);
    this.publish();
  }

  private async onFilesCreated(uris: vscode.Uri[]): Promise<void> {
    for (const uri of uris) {
      const fsPath = uri.fsPath;
      if (this.isSelfWrite(fsPath)) continue;
      try {
        const content = await readFileText(uri);
        this.store = applyTextChange(this.store, fsPath, content);
      } catch {
        // The file vanished between the create event and the read; the next
        // workspace event reconciles it.
      }
    }
    this.publish();
  }

  private onFilesDeleted(uris: vscode.Uri[]): void {
    for (const uri of uris) {
      this.store = applyFileDeleted(this.store, uri.fsPath);
    }
    this.publish();
  }

  private async onFilesRenamed(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    const oldPath = oldUri.fsPath;
    const newPath = newUri.fsPath;
    if (!matchesGlob(newPath, this.modelGlob)) {
      this.store = applyFileDeleted(this.store, oldPath);
      this.publish();
      return;
    }
    try {
      const content = await readFileText(newUri);
      this.store = applyFileRenamed(this.store, oldPath, newPath, content);
    } catch {
      this.store = applyFileDeleted(this.store, oldPath);
    }
    this.publish();
  }

  /** True when a change event is the echo of one of our own disk writes. */
  private isSelfWrite(fsPath: string): boolean {
    const last = this.selfWrites.get(fsPath);
    if (last === undefined) return false;
    if (Date.now() - last < SELF_WRITE_IGNORE_MS) return true;
    this.selfWrites.delete(fsPath);
    return false;
  }

  private async onMessage(message: MessageToExtension): Promise<void> {
    switch (message.type) {
      case 'webview:ready':
        // The initial publish may have raced the webview's message listener.
        this.publish();
        return;
      case 'diagram:edit': {
        try {
          await this.applyEditAndPersist(message.edit);
        } catch (err) {
          this.postMessage({
            type: 'diagram:error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
    }
  }

  private async applyEditAndPersist(edit: ModelEdit): Promise<void> {
    const all: ModelDefinition[] = this.store.records.flatMap((record) => record.file.models);
    const { models } = applyEdit(all, edit);

    // Index-based write-back (spec 06): `models` is the records' models
    // concatenated in record order, so distributeEditedModels maps each slice
    // back onto its original record by position — renames persist correctly,
    // and untouched files are not rewritten.
    for (const record of distributeEditedModels(this.store, models)) {
      this.store = upsertRecord(this.store, record.uri, record.file);
      await writeModelYmlFile(vscode.Uri.file(record.uri), record.file);
      this.selfWrites.set(record.uri, Date.now());
    }

    this.publish();
  }

  private postMessage(message: MessageToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const appUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'app.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'app.css'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${cssUri}" rel="stylesheet" />
    <title>dbt Diagram</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${appUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    DiagramPanel.current = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/** The first workspace folder, used as the root for VS Code-style file labels. */
function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Last-resort file label when the pure disambiguator has no entry. */
function fallbackLabel(uri: string): string {
  const parts = uri.split(/[\\/]/);
  return parts[parts.length - 1] ?? uri;
}
