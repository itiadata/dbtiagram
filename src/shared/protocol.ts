/**
 * Typed message protocol between the extension host and the webview.
 * Shared by both sides — MUST NOT import `vscode`.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramLayout } from '../diagram/layoutFile';
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
  | { type: 'diagram:error'; message: string }
  /** A saved layout was opened: apply its visible tables and positions (spec 13). */
  | { type: 'layout:apply'; layout: DiagramLayout; missing: string[] }
  /** Which layout file the panel writes back to, if any (spec 13). */
  | { type: 'layout:active'; path: string | null; name: string | null };

/** Messages sent from the webview to the extension host. */
export type MessageToExtension =
  | { type: 'diagram:edit'; edit: ModelEdit }
  | { type: 'webview:ready' }
  /** Explicit "Save diagram" action; prompts for a path when none is active. */
  | { type: 'layout:save'; layout: DiagramLayout }
  /** Debounced live update; ignored when no layout is active. */
  | { type: 'layout:changed'; layout: DiagramLayout };
