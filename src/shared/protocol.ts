/**
 * Typed message protocol between the extension host and the webview.
 * Shared by both sides — MUST NOT import `vscode`.
 */
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramLayout } from '../diagram/layoutFile';
import type { ModelEdit } from '../dbt/edit';
import type { OpenBehavior } from './openBehavior';
import type { MatrixScope, StoredMatrixColumnPref } from './matrixColumns';

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
  /**
   * Scope the file filter to exactly this model.yml (spec 14): the panel was
   * opened from that file, so it starts showing only that file's models. Sent
   * only for model-file sources, never for layouts or palette invocations.
   */
  | { type: 'filter:scope'; uri: string }
  /** A saved layout was opened: apply its visible tables and positions (spec 13). */
  | { type: 'layout:apply'; layout: DiagramLayout; missing: string[] }
  /** Which layout file the panel writes back to, if any (spec 13). */
  | { type: 'layout:active'; path: string | null; name: string | null }
  /**
   * The current "Open new diagrams" setting (spec 23), sent on ready and
   * whenever `dbtiagram.openBehavior` changes, so every open panel's
   * settings overlay reflects the latest value.
   */
  | { type: 'settings:current'; openBehavior: OpenBehavior }
  /** The stored grid column preferences for one matrix scope (spec 27). */
  | { type: 'matrix:columnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] };

/** Messages sent from the webview to the extension host. */
export type MessageToExtension =
  | { type: 'diagram:edit'; edit: ModelEdit }
  | { type: 'webview:ready' }
  /** Explicit "Save diagram" action; prompts for a path when none is active. */
  | { type: 'layout:save'; layout: DiagramLayout }
  /**
   * Debounced sync of the current (unsaved) layout to the extension host's
   * in-memory cache; never written to disk directly (spec 22). `dirty` is
   * carried alongside so the host never has to recompute it.
   */
  | { type: 'layout:pending'; layout: DiagramLayout; dirty: boolean }
    /** Open the model.yml declaring `model` and reveal its declaration, or a specific `column` within it (spec 15, extended by spec 25). */
    | { type: 'model:openSource'; model: string; column?: string }
  /** Persist a new "Open new diagrams" choice as a VS Code user setting (spec 23). */
  | { type: 'settings:setOpenBehavior'; openBehavior: OpenBehavior }
  /** Persist grid column visibility/order for one matrix scope (spec 27). */
  | { type: 'matrix:setColumnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] };