import * as vscode from 'vscode';
import type { DiagramEntityFile } from '../shared/protocol';
import type { SourceImportSelection } from '../webview/sourceImport';

interface FilePickItem extends vscode.QuickPickItem { uri: string }
interface TablePickItem extends vscode.QuickPickItem { id: string }

export async function pickSourceImport(
  sourceFiles: readonly DiagramEntityFile[],
  modelFiles: readonly DiagramEntityFile[],
): Promise<SourceImportSelection | undefined> {
  if (sourceFiles.length === 0) {
    await vscode.window.showWarningMessage('No source yml files are available to import from.');
    return undefined;
  }
  const source = await vscode.window.showQuickPick<FilePickItem>(
    sourceFiles.map((file) => ({ label: file.label, uri: file.uri })),
    { placeHolder: 'Select a source yml file' },
  );
  if (source === undefined) return undefined;
  const sourceFile = sourceFiles.find((file) => file.uri === source.uri);
  if (sourceFile === undefined) return undefined;
  const tables = await pickTables(sourceFile.entities);
  if (tables === undefined) return undefined;
  if (modelFiles.length === 0) {
    await vscode.window.showWarningMessage('No model yml files are available as an import destination.');
    return undefined;
  }
  const destination = await vscode.window.showQuickPick<FilePickItem>(
    modelFiles.map((file) => ({ label: file.label, uri: file.uri })),
    { placeHolder: 'Select a destination model yml file' },
  );
  if (destination === undefined) return undefined;
  return { sourceUri: source.uri, tableIds: tables.map((table) => table.id), destinationUri: destination.uri };
}

/** Keeps the picker open when Accept is pressed with no selected tables. */
function pickTables(ids: readonly string[]): Promise<readonly TablePickItem[] | undefined> {
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<TablePickItem>();
    picker.placeholder = 'Select one or more source tables';
    picker.canSelectMany = true;
    picker.items = ids.map((id) => ({ label: id, id }));
    let accepted = false;
    picker.onDidAccept(() => {
      if (picker.selectedItems.length === 0) return;
      accepted = true;
      resolve([...picker.selectedItems]);
      picker.hide();
    });
    picker.onDidHide(() => {
      if (!accepted) resolve(undefined);
      picker.dispose();
    });
    picker.show();
  });
}
