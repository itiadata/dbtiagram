import * as vscode from 'vscode';
import { loadAiRenamingRulesFromProject, type AiPromptProjectRulesHost } from '../webview/aiPromptProjectRules';

const projectRulesHost: AiPromptProjectRulesHost = {
  parent: (value) => {
    const uri = vscode.Uri.parse(value);
    const slash = uri.path.lastIndexOf('/');
    return slash <= 0 ? undefined : uri.with({ path: uri.path.slice(0, slash) }).toString();
  },
  join: (base, ...segments) => vscode.Uri.joinPath(vscode.Uri.parse(base), ...segments).toString(),
  sameUri: (left, right) => vscode.Uri.parse(left).fsPath.toLocaleLowerCase() === vscode.Uri.parse(right).fsPath.toLocaleLowerCase(),
  isFile: async (value) => {
    try {
      return (await vscode.workspace.fs.stat(vscode.Uri.parse(value))).type === vscode.FileType.File;
    } catch {
      return false;
    }
  },
  readText: async (value) => {
    try {
      const uri = vscode.Uri.parse(value);
      if ((await vscode.workspace.fs.stat(uri)).type !== vscode.FileType.File) return undefined;
      return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  },
};

export async function readAiRenamingRules(modelFileUri: vscode.Uri): Promise<string | undefined> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelFileUri);
  if (workspaceFolder === undefined) return undefined;
  return loadAiRenamingRulesFromProject(projectRulesHost, modelFileUri.toString(), workspaceFolder.uri.toString());
}

export function registerAiRenamingRulesWatcher(onChanged: () => void): vscode.Disposable[] {
  const patterns = ['**/dbt_project.yml', '**/.dbtiagram/ai_renaming_rules.md'];
  const watchers = patterns.flatMap((pattern) => {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    return [
      watcher,
      watcher.onDidCreate(onChanged),
      watcher.onDidChange(onChanged),
      watcher.onDidDelete(onChanged),
    ];
  });
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    const path = document.uri.path.replace(/\\/g, '/');
    if (path.endsWith('/dbt_project.yml') || path.endsWith('/.dbtiagram/ai_renaming_rules.md')) onChanged();
  });
  return [...watchers, saveListener];
}
