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

/**
 * A model.yml file shown to the webview so it can filter the diagram by file
 * and by model (spec 05). The webview never sends filter state back: it
 * derives its own filtered view from the full graph plus this metadata.
 */
export interface DiagramModelFile {
  /** File-system path of the model.yml file (stable key for selection). */
  uri: string;
  /** VS Code-style display name (bare name or folder-disambiguated path). */
  label: string;
  /** Model names defined in this file, in file order. */
  models: string[];
}

/** Messages sent from the extension host to the webview. */
export type MessageToWebview =
  | {
      type: 'diagram:update';
      diagram: DiagramGraph;
      pendingErrors: DiagramPendingError[];
      modelFiles: DiagramModelFile[];
    }
  | { type: 'diagram:error'; message: string };

/** Messages sent from the webview to the extension host. */
export type MessageToExtension =
  | { type: 'diagram:edit'; edit: ModelEdit }
  | { type: 'webview:ready' };
