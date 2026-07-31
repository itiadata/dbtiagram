/**
 * Shared interaction state between the App (which owns hover/selection/layout
 * state) and the custom TableNode components: which columns are highlighted,
 * the column-hover callbacks, the current selection (spec 06), and the single
 * `onEdit` funnel through which every mutation posts a `diagram:edit` message.
 * Kept out of node data so manual drag positions are preserved when highlights
 * or the selection change (spec 03).
 */
import { createContext } from 'react';
import type { ModelEdit } from '../src/dbt/edit';

export interface DiagramInteractionContextValue {
  /** Column names to highlight, keyed by model (node id). */
  highlightedColumns: ReadonlyMap<string, ReadonlySet<string>>;
  onColumnHover: (model: string, column: string) => void;
  onColumnLeave: (model: string, column: string) => void;
  /** Node id of the selected table, or null when a table is not selected. */
  selectedTableId: string | null;
  /** Model + column of the selected column, or null when a column is not selected. */
  selectedColumnRef: { model: string; column: string } | null;
  /** Selects the table with the given model name (clicking its header). */
  onTableSelect: (model: string) => void;
  /** Selects the column (clicking its row). */
  onColumnSelect: (model: string, column: string) => void;
  /** Posts a `diagram:edit` message (inline editing and the details sidebar). */
  onEdit: (edit: ModelEdit) => void;
}

export const DiagramInteractionContext = createContext<DiagramInteractionContextValue | null>(
  null,
);
