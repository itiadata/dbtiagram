/**
 * Shared interaction state between the App (which owns hover/layout state) and
 * the custom TableNode components: which columns are highlighted, plus the
 * column-hover callbacks. Kept out of node data so manual drag positions are
 * preserved when highlights change (spec 03).
 */
import { createContext } from 'react';

export interface DiagramInteractionContextValue {
  /** Column names to highlight, keyed by model (node id). */
  highlightedColumns: ReadonlyMap<string, ReadonlySet<string>>;
  onColumnHover: (model: string, column: string) => void;
  onColumnLeave: (model: string, column: string) => void;
}

export const DiagramInteractionContext = createContext<DiagramInteractionContextValue | null>(
  null,
);
