/**
 * Typed message protocol between the extension host and the webview.
 * Shared by both sides — MUST NOT import `vscode`.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { ModelEdit } from '../dbt/edit';

/** Messages sent from the extension host to the webview. */
export type MessageToWebview =
  | { type: 'diagram:update'; diagram: DiagramGraph }
  | { type: 'diagram:error'; message: string };

/** Messages sent from the webview to the extension host. */
export type MessageToExtension =
  | { type: 'diagram:edit'; edit: ModelEdit }
  | { type: 'webview:ready' };
