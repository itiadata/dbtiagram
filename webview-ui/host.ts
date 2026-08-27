/**
 * The single `acquireVsCodeApi()` acquisition for the webview.
 *
 * VS Code allows that call exactly once per webview, so every module posts
 * through this helper rather than acquiring its own handle (spec 17).
 */
import type { MessageToExtension } from '../src/shared/protocol';

const vscode = window.acquireVsCodeApi();

export function postToHost(message: MessageToExtension): void {
  vscode.postMessage(message);
}
