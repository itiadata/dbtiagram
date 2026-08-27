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
import {
  applyLayout,
  defaultLayoutName,
  isLayoutFilePath,
  DiagramLayoutParseError,
  type DiagramLayout,
} from '../diagram/layoutFile';
import { matchesGlob } from '../shared/glob';
import { disambiguateFileLabels } from '../shared/labels';
import type { DiagramModelFile, MessageToExtension, MessageToWebview } from '../shared/protocol';
import { registerModelWatcher } from '../vscode/modelWatcher';
import { promptForLayoutPath, readLayoutFile, writeLayoutFile } from '../vscode/layoutFiles';
import { loadModelYmlFiles, readFileText, writeModelYmlFile } from '../vscode/project';
import { diagramPanelKey, diagramPanelTitle, type DiagramSource } from './panelKey';

/** Ignore text-change echoes of our own disk writes within this window. */
const SELF_WRITE_IGNORE_MS = 250;

export class DiagramPanel {
  public static readonly viewType = 'dbtiagram.diagramPanel';
  /**
   * Open diagram tabs keyed by source identity (spec 14). Opening a source that
   * already has a tab reveals it; anything else opens a new tab.
   */
  private static readonly panels = new Map<string, DiagramPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private store: ModelStore;
  /** fsPath -> timestamp of our own disk writes, to ignore their echo. */
  private readonly selfWrites = new Map<string, number>();
  /** The saved layout file this panel writes back to, if any (spec 13). */
  private activeLayout: { uri: vscode.Uri; name: string } | undefined;
  /** What this tab was opened from, and its current registry key (spec 14). */
  private source: DiagramSource;
  private key: string;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    store: ModelStore,
    source: DiagramSource,
    key: string,
  ) {
    this.panel = panel;
    this.store = store;
    this.source = source;
    this.key = key;
    this.publish();
    this.publishScope();

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

  /**
   * Reveals the tab already showing `source`, or opens a new one for it
   * (spec 14). Revealing a layout tab re-reads its file so edits made on disk
   * since it opened are picked up; revealing a model tab never re-scopes its
   * filter, so the user's own selection survives.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    source: DiagramSource,
  ): Promise<void> {
    const key = diagramPanelKey(source);

    const existing = DiagramPanel.panels.get(key);
    if (existing !== undefined) {
      existing.panel.reveal(existing.panel.viewColumn);
      if (source.kind === 'layout') {
        await existing.openLayout(vscode.Uri.file(source.fsPath));
      }
      return;
    }

    // Diagrams always open split to the right of the file they came from.
    const panel = vscode.window.createWebviewPanel(
      DiagramPanel.viewType,
      diagramPanelTitle(source),
      vscode.ViewColumn.Beside,
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

    const current = new DiagramPanel(panel, extensionUri, store, source, key);
    DiagramPanel.panels.set(key, current);
    panel.webview.html = current.getHtml();

    if (source.kind === 'layout') {
      await current.openLayout(vscode.Uri.file(source.fsPath));
    }
  }

  /** Every open diagram tab. */
  public static all(): Iterable<DiagramPanel> {
    return DiagramPanel.panels.values();
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

  /**
   * Tells the webview to check only the model.yml this tab was opened from
   * (spec 14). No-op for layout and palette sources, which keep their own
   * defaults (the layout's tables / all files checked).
   */
  private publishScope(): void {
    if (this.source.kind !== 'model') {
      return;
    }
    this.postMessage({ type: 'filter:scope', uri: this.source.fsPath });
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
    if (!matchesGlob(newPath, this.modelGlob) || isLayoutFilePath(newPath)) {
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
        // The initial filter:scope raced it for the same reason (spec 14).
        this.publishScope();
        // The initial layout:apply races it too, so a freshly opened panel
        // would otherwise fall back to the default (unfiltered, auto-laid-out)
        // view. Re-send it here, re-reading the file so any change written
        // since the panel opened is picked up.
        await this.sendActiveLayout();
        this.publishActiveLayout();
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
      case 'layout:save':
        await this.saveLayout(message.layout);
        return;
      case 'layout:changed':
        await this.writeActiveLayout(message.layout);
        return;
    }
  }

  /**
   * Opens a saved layout file: parses it, reconciles it against the models that
   * currently exist, and tells the webview to apply it (spec 13).
   */
  private async openLayout(uri: vscode.Uri): Promise<void> {
    let layout: DiagramLayout;
    try {
      layout = await readLayoutFile(uri);
    } catch (err) {
      const detail = err instanceof DiagramLayoutParseError ? err.message : String(err);
      this.postMessage({
        type: 'diagram:error',
        message: `Could not open ${defaultLayoutName(uri.fsPath)}: ${detail}`,
      });
      return;
    }

    this.activeLayout = { uri, name: layout.name };
    if (this.source.kind === 'layout') {
      // The stored `name` can differ from the file's base name.
      this.panel.title = diagramPanelTitle(this.source, layout.name);
    }
    this.publish();
    this.postMessage({ type: 'layout:apply', layout, missing: this.missingModels(layout) });
    this.publishActiveLayout();
  }

  /**
   * Re-reads the active layout from disk and re-applies it in the webview. Used
   * on `webview:ready`, where the panel's first `layout:apply` may have raced
   * the webview's message listener.
   */
  private async sendActiveLayout(): Promise<void> {
    const active = this.activeLayout;
    if (active === undefined) {
      return;
    }
    try {
      const layout = await readLayoutFile(active.uri);
      this.activeLayout = { uri: active.uri, name: layout.name };
      this.postMessage({ type: 'layout:apply', layout, missing: this.missingModels(layout) });
    } catch {
      // The file vanished or became invalid after it was opened; the diagram
      // stays as it is and the next explicit open reports the error.
    }
  }

  /** Layout entries naming models that no longer exist, in file order. */
  private missingModels(layout: DiagramLayout): string[] {
    const known = new Set(
      this.store.records.flatMap((record) => record.file.models.map((model) => model.name)),
    );
    return applyLayout(layout, known).missing;
  }

  /**
   * Handles the explicit "Save diagram" action: writes to the active layout, or
   * prompts for a path when there is none. Cancelling the dialog is a no-op.
   */
  private async saveLayout(layout: DiagramLayout): Promise<void> {
    let target = this.activeLayout?.uri;
    if (target === undefined) {
      target = await promptForLayoutPath(layout.name);
      if (target === undefined) {
        return;
      }
    }

    const named: DiagramLayout = { ...layout, name: defaultLayoutName(target.fsPath) };
    try {
      await this.persistLayout(target, named);
    } catch (err) {
      this.postMessage({
        type: 'diagram:error',
        message: `Could not save diagram: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    this.activeLayout = { uri: target, name: named.name };
    this.rekeyToLayout(target, named.name);
    this.publishActiveLayout();
  }

  /**
   * After a diagram is saved for the first time, the tab becomes that layout's
   * tab: it re-keys and re-titles itself so opening the file later reveals it
   * (spec 14). When another tab already owns that key this one keeps its
   * original key — both stay open and both write to the file, last write wins.
   */
  private rekeyToLayout(uri: vscode.Uri, name: string): void {
    const source: DiagramSource = { kind: 'layout', fsPath: uri.fsPath };
    const nextKey = diagramPanelKey(source);
    this.panel.title = diagramPanelTitle(source, name);

    if (nextKey === this.key) {
      return;
    }
    if (DiagramPanel.panels.has(nextKey)) {
      return;
    }

    DiagramPanel.panels.delete(this.key);
    this.source = source;
    this.key = nextKey;
    DiagramPanel.panels.set(nextKey, this);
  }

  /** Debounced live write-back; a no-op while no layout is active. */
  private async writeActiveLayout(layout: DiagramLayout): Promise<void> {
    const active = this.activeLayout;
    if (active === undefined) {
      return;
    }
    try {
      await this.persistLayout(active.uri, { ...layout, name: active.name });
    } catch (err) {
      this.postMessage({
        type: 'diagram:error',
        message: `Could not update diagram: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async persistLayout(uri: vscode.Uri, layout: DiagramLayout): Promise<void> {
    await writeLayoutFile(uri, layout);
    // Layout files never enter the model pipeline, but keeping the guard local
    // preserves the invariant if the glob ever changes.
    this.selfWrites.set(uri.fsPath, Date.now());
  }

  private publishActiveLayout(): void {
    this.postMessage({
      type: 'layout:active',
      path: this.activeLayout?.uri.fsPath ?? null,
      name: this.activeLayout?.name ?? null,
    });
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
    // Only this tab's registration and watchers go; other tabs keep working.
    if (DiagramPanel.panels.get(this.key) === this) {
      DiagramPanel.panels.delete(this.key);
    }
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
