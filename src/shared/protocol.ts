/**
 * Typed message protocol between the extension host and the webview.
 * Shared by both sides — MUST NOT import `vscode`.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { ModelEdit } from '../dbt/edit';

/** A model.yml file whose most recent parse failed (last good data shown). */
export interface DiagramPendingError {
  /** File-system path of the file with the parse error. */
  uri: string;
  /** Human-readable parse error. */
  message: string;
}

/** Messages sent from the extension host to the webview. */
export type MessageToWebview =
  | { type: 'diagram:update'; diagram: DiagramGraph; pendingErrors: DiagramPendingError[] }
  | { type: 'diagram:error'; message: string };

/** Messages sent from the webview to the extension host. */
export type MessageToExtension =
  | { type: 'diagram:edit'; edit: ModelEdit }
  | { type: 'webview:ready' };
