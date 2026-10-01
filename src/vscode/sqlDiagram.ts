import * as vscode from 'vscode';
import { resolveSqlDiagram, sqlDiagramResolutionError } from '../shared/sqlFiles';
import { DiagramPanel } from '../webview/panel';
import { loadModelYmlFiles } from './project';

export async function openSqlDiagram(
  context: vscode.ExtensionContext,
  installedVersion: string,
  resource?: vscode.Uri,
): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  const sqlPath = uri?.scheme === 'file' ? uri.fsPath : '';
  const glob = vscode.workspace.getConfiguration('dbtiagram').get<string>('modelFileGlob', '**/models/**/*.yml');
  const loaded = await loadModelYmlFiles(glob);
  const resolution = resolveSqlDiagram(sqlPath, loaded.records.map((record) => ({
    uri: record.uri.fsPath,
    models: record.file.models.map((model) => model.name),
  })));
  if (resolution.kind !== 'resolved') {
    void vscode.window.showErrorMessage(sqlDiagramResolutionError(resolution));
    return;
  }
  await DiagramPanel.createOrShow(context.extensionUri, {
    kind: 'sql',
    fsPath: sqlPath,
    modelYmlPath: resolution.modelYmlPath,
    modelName: resolution.modelName,
  }, context.workspaceState, installedVersion);
}
