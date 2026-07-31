/**
 * Extension-host side of the webview panel: owns the webview, the in-memory
 * model set, and persistence. Handles messages from the webview.
 */
import * as vscode from 'vscode';
import { applyEdit } from '../dbt/edit';
import type { ModelEdit } from '../dbt/edit';
import type { ModelDefinition } from '../dbt/types';
import { buildDiagram } from '../diagram/graph';
import type { MessageToExtension, MessageToWebview } from '../shared/protocol';
import { loadModelYmlFiles, writeModelYmlFile } from '../vscode/project';
import type { ModelYmlRecord } from '../vscode/project';

export class DiagramPanel {
  public static readonly viewType = 'dbtiagram.diagramPanel';
  public static current: DiagramPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private records: ModelYmlRecord[];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    records: ModelYmlRecord[],
  ) {
    this.panel = panel;
    this.records = records;
    this.postMessage({ type: 'diagram:update', diagram: this.diagram() });

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

    const { records, warnings } = await loadModelYmlFiles();
    for (const warning of warnings) {
      void vscode.window.showWarningMessage(`dbt Diagram: ${warning}`);
    }

    DiagramPanel.current = new DiagramPanel(panel, extensionUri, records);
    panel.webview.html = DiagramPanel.current.getHtml();
  }

  private diagram() {
    const models: ModelDefinition[] = this.records.flatMap((r) => r.file.models);
    return buildDiagram(models);
  }

  /** Reloads model.yml files from disk and republishes the diagram. */
  public async refresh(): Promise<void> {
    const { records, warnings } = await loadModelYmlFiles();
    this.records = records;
    for (const warning of warnings) {
      void vscode.window.showWarningMessage(`dbt Diagram: ${warning}`);
    }
    this.postMessage({ type: 'diagram:update', diagram: this.diagram() });
  }

  private async onMessage(message: MessageToExtension): Promise<void> {
    switch (message.type) {
      case 'webview:ready':
        this.postMessage({ type: 'diagram:update', diagram: this.diagram() });
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
    const all: ModelDefinition[] = this.records.flatMap((r) => r.file.models);
    const { models } = applyEdit(all, edit);

    for (const record of this.records) {
      const names = new Set(record.file.models.map((m) => m.name));
      const edited = models.filter((m) => names.has(m.name));
      if (edited.length > 0) {
        record.file = { version: record.file.version, models: edited };
        await writeModelYmlFile(record.uri, record.file);
      }
    }

    this.postMessage({ type: 'diagram:update', diagram: buildDiagram(models) });
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
