import * as vscode from 'vscode';
import type { ModelRenameFileHost } from '../webview/modelRename';
import { fileExists, readFileText, writeFileText } from './project';

export const vscodeModelRenameFiles: ModelRenameFileHost = {
  readText: (path) => readFileText(vscode.Uri.file(path)),
  writeText: (path, text) => writeFileText(vscode.Uri.file(path), text),
  exists: (path) => fileExists(vscode.Uri.file(path)),
  rename: async (from, to) => { await vscode.workspace.fs.rename(vscode.Uri.file(from), vscode.Uri.file(to), { overwrite: false }); },
};
