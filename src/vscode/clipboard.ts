import * as vscode from 'vscode';
import type { AiPromptClipboard } from '../webview/aiPromptExport';

export const vscodeAiPromptClipboard: AiPromptClipboard = {
  copy: async (text) => { await vscode.env.clipboard.writeText(text); },
};

export function showAiPromptCopied(model: string, batchNumber: number, totalBatches: number): Thenable<string | undefined> {
  return vscode.window.showInformationMessage(`AI rename/type prompt for ${model} batch ${batchNumber} of ${totalBatches} copied to the clipboard.`);
}
