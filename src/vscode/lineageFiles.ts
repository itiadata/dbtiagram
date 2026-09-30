import * as path from 'path';
import * as vscode from 'vscode';
import type { WorkspaceDbtProject } from './dbtProjects';

export interface LineageSqlFile { modelId: string; uri: vscode.Uri }

export async function findProjectModelSql(project: WorkspaceDbtProject): Promise<LineageSqlFile[]> {
  const result: LineageSqlFile[] = [];
  for (const relative of project.config.modelPaths) {
    const base = vscode.Uri.file(path.resolve(project.root.fsPath, relative));
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(base, '**/*.sql'), '**/node_modules/**');
    for (const uri of files) result.push({ modelId: path.basename(uri.fsPath, path.extname(uri.fsPath)), uri });
  }
  return result;
}

export function watchLineageSqlFiles(
  files: readonly vscode.Uri[],
  onChanged: (uri: vscode.Uri) => void,
): vscode.Disposable {
  const watchers = files.map((uri) => {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), path.basename(uri.fsPath)));
    watcher.onDidChange(onChanged);
    watcher.onDidCreate(onChanged);
    watcher.onDidDelete(onChanged);
    return watcher;
  });
  return { dispose: () => watchers.forEach((watcher) => watcher.dispose()) };
}
