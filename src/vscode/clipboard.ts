import * as vscode from 'vscode';
import type { AiPromptClipboard } from '../webview/aiPromptExport';
import type { AiPromptImportClipboard, AiPromptImportNotifier } from '../webview/aiPromptImport';

export const vscodeAiPromptClipboard: AiPromptClipboard = {
  copy: async (text) => { await vscode.env.clipboard.writeText(text); },
};

export function showAiPromptCopied(model: string, batchNumber: number, totalBatches: number): Thenable<string | undefined> {
  return vscode.window.showInformationMessage(`AI rename/type prompt for ${model} batch ${batchNumber} of ${totalBatches} copied to the clipboard.`);
}

export const vscodeAiPromptImportClipboard: AiPromptImportClipboard = {
  paste: async () => vscode.env.clipboard.readText(),
};
export const vscodeAiPromptImportNotifier: AiPromptImportNotifier = {
  completed: async (updated, rejected) => {
    const message = rejected === 0 ? `AI rename/type import completed: ${updated} columns updated; 0 results rejected.` : `AI rename/type import completed with issues: ${updated} columns updated; ${rejected} results rejected.`;
    if (rejected === 0) await vscode.window.showInformationMessage(message); else await vscode.window.showWarningMessage(message);
  },
  failed: async (message) => { await vscode.window.showWarningMessage(`AI rename/type import failed: ${message}`); },
};
