/**
 * Isolated wrapper for every file-system touch point with the VS Code API.
 * This module is the ONLY place that reads/writes workspace files.
 */
import * as vscode from 'vscode';
import { parseModelYml, ModelYmlParseError } from '../dbt/parse';
import { serializeModelYml } from '../dbt/serialize';
import type { ModelYmlFile } from '../dbt/types';

export interface ModelYmlRecord {
  uri: vscode.Uri;
  file: ModelYmlFile;
}

/** Discovers and parses every model.yml file in the workspace. */
export async function loadModelYmlFiles(glob = '**/models/**/*.yml'): Promise<{
  records: ModelYmlRecord[];
  warnings: string[];
}> {
  const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
  const records: ModelYmlRecord[] = [];
  const warnings: string[] = [];

  for (const uri of uris) {
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      records.push({ uri, file: parseModelYml(content, uri.fsPath) });
    } catch (err) {
      const message =
        err instanceof ModelYmlParseError
          ? err.message
          : `Failed to read ${uri.fsPath}: ${String(err)}`;
      warnings.push(message);
    }
  }

  return { records, warnings };
}

/** Writes a model.yml file back to disk. */
export async function writeModelYmlFile(uri: vscode.Uri, file: ModelYmlFile): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(serializeModelYml(file), 'utf8'));
}
