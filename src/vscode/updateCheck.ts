/** VS Code adapter for the pure private-release update workflow. */
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runUpdateCheck, type UpdateCheckOutcome } from '../shared/update';
import { downloadRelease, fetchLatestRelease, installVsix } from './updateCli';

export function installedExtensionVersion(context: vscode.ExtensionContext): string {
  const packageJson = context.extension.packageJSON;
  if (!isRecord(packageJson) || typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
    throw new Error('Extension package version must be a stable X.Y.Z version');
  }
  return packageJson.version;
}

export async function checkForUpdates(context: vscode.ExtensionContext): Promise<UpdateCheckOutcome> {
  if (context.extensionMode === vscode.ExtensionMode.Test) return 'checkFailed';
  const installedVersion = installedExtensionVersion(context);
  return runUpdateCheck({
    installedVersion,
    fetchLatestRelease,
    promptUpdate: async (message) => vscode.window.showInformationMessage(
      message,
      { modal: true },
      'Update',
      'Later',
    ),
    download: (release) => downloadRelease(
      release,
      path.join(context.globalStorageUri.fsPath, 'releases', release.tagName),
    ),
    install: installVsix,
    promptReload: async (message) => vscode.window.showInformationMessage(message, 'Reload Now', 'Later'),
    reload: async () => vscode.commands.executeCommand('workbench.action.reloadWindow'),
    warn: (message) => { void vscode.window.showErrorMessage(message); },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
