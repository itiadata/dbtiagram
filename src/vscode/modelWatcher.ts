/**
 * Isolated wrapper that turns VS Code workspace events into model.yml change
 * callbacks for the diagram panel (spec 04): live text edits, saves, file
 * create/delete/rename, and relevant configuration changes. All events are
 * filtered to paths matching the configured `dbtiagram.modelFileGlob` and are
 * skipped entirely while `dbtiagram.watchModelFiles` is false.
 */
import * as vscode from 'vscode';
import { matchesGlob } from '../shared/glob';

export interface ModelWatcherCallbacks {
  /** Current `dbtiagram.modelFileGlob` value, read on every event. */
  getGlob: () => string;
  /** Current `dbtiagram.watchModelFiles` value; false disables live reload. */
  getEnabled: () => boolean;
  /** A model.yml document's text changed (typing, save, or revert). */
  onDocumentChanged: (uri: vscode.Uri, content: string) => void;
  onFilesCreated: (uris: vscode.Uri[]) => void;
  onFilesDeleted: (uris: vscode.Uri[]) => void;
  onFilesRenamed: (oldUri: vscode.Uri, newUri: vscode.Uri) => void;
  /** Called when `modelFileGlob` or `watchModelFiles` changes. */
  onConfigurationChanged: () => void;
}

/** Registers workspace listeners that dispatch model.yml changes. */
export function registerModelWatcher(callbacks: ModelWatcherCallbacks): vscode.Disposable[] {
  const isModelPath = (uri: vscode.Uri): boolean =>
    callbacks.getEnabled() && matchesGlob(uri.fsPath, callbacks.getGlob());

  const disposables: vscode.Disposable[] = [
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isModelPath(event.document.uri)) return;
      callbacks.onDocumentChanged(event.document.uri, event.document.getText());
    }),
    // Safety net for externally modified files: a save is when the editor
    // learns the newest content, even if no typing change was observed.
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isModelPath(document.uri)) return;
      callbacks.onDocumentChanged(document.uri, document.getText());
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      const uris = event.files.filter(isModelPath);
      if (uris.length > 0) callbacks.onFilesCreated(uris);
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      const uris = event.files.filter(isModelPath);
      if (uris.length > 0) callbacks.onFilesDeleted(uris);
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      for (const file of event.files) {
        if (isModelPath(file.oldUri) || isModelPath(file.newUri)) {
          callbacks.onFilesRenamed(file.oldUri, file.newUri);
        }
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('dbtiagram.modelFileGlob') ||
        event.affectsConfiguration('dbtiagram.watchModelFiles')
      ) {
        callbacks.onConfigurationChanged();
      }
    }),
  ];

  return disposables;
}
