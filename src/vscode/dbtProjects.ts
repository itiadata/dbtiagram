import * as vscode from 'vscode';
import * as path from 'path';
import { parseDbtProjectConfig, type DbtProjectConfig } from '../dbt/projectConfig';
import { readFileText } from './project';

export interface WorkspaceDbtProject { root: vscode.Uri; config: DbtProjectConfig }
export async function findContainingDbtProject(file: vscode.Uri): Promise<WorkspaceDbtProject | null> {
  const folder = vscode.workspace.getWorkspaceFolder(file); if (folder === undefined) return null;
  let current = path.dirname(file.fsPath);
  while (within(current, folder.uri.fsPath)) {
    const marker = vscode.Uri.file(path.join(current, 'dbt_project.yml'));
    try { return { root: vscode.Uri.file(current), config: parseDbtProjectConfig(await readFileText(marker)) }; } catch (error) {
      if (await exists(marker)) throw error;
    }
    if (same(current, folder.uri.fsPath)) break; current = path.dirname(current);
  }
  return null;
}
export async function findWorkspaceDbtProjects(): Promise<WorkspaceDbtProject[]> {
  const markers = await vscode.workspace.findFiles('**/dbt_project.yml', '**/node_modules/**');
  return Promise.all(markers.map(async (marker) => ({ root: vscode.Uri.file(path.dirname(marker.fsPath)), config: parseDbtProjectConfig(await readFileText(marker)) })));
}
export async function findProjectSqlFiles(project: WorkspaceDbtProject): Promise<Map<string, 'model' | 'macro' | 'test' | 'snapshot'>> {
  const result = new Map<string, 'model' | 'macro' | 'test' | 'snapshot'>();
  const groups: Array<[string[], 'model' | 'macro' | 'test' | 'snapshot']> = [[project.config.modelPaths, 'model'], [project.config.macroPaths, 'macro'], [project.config.testPaths, 'test'], [project.config.snapshotPaths, 'snapshot']];
  for (const [paths, kind] of groups) for (const relative of paths) {
    const base = vscode.Uri.file(path.resolve(project.root.fsPath, relative));
    const folder = vscode.workspace.getWorkspaceFolder(base);
    if (folder === undefined || !within(base.fsPath, folder.uri.fsPath)) continue;
    const pattern = new vscode.RelativePattern(base, '**/*.sql');
    for (const uri of await vscode.workspace.findFiles(pattern, '**/node_modules/**')) {
      const owner = await findContainingDbtProject(uri);
      if (owner !== null && same(owner.root.fsPath, project.root.fsPath)) result.set(uri.fsPath, kind);
    }
  }
  return result;
}
async function exists(uri: vscode.Uri): Promise<boolean> { try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; } }
function same(a: string, b: string): boolean { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function within(child: string, parent: string): boolean { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
