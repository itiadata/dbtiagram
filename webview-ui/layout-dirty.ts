/**
 * Pure comparison of a current layout snapshot against the last-saved one,
 * used to drive the header button's dirty state (spec 22).
 *
 * Both sides are expected to already be sorted/rounded consistently (e.g. via
 * `buildLayout`), so a straightforward deep-equality check is enough — no
 * `vscode` import, no host state.
 */
import type { DiagramLayoutTable, DiagramNote } from '../src/diagram/layoutFile';
import type { ColumnDisplayMode } from '../src/diagram/columnDisplay';

export interface LayoutSnapshot {
  tables: DiagramLayoutTable[];
  notes: DiagramNote[];
  /** The diagram-wide default column-display mode (spec 24); undefined means the pre-feature default ('all'). */
  defaultColumnDisplay?: ColumnDisplayMode;
}

export function isLayoutDirty(current: LayoutSnapshot, saved: LayoutSnapshot | null): boolean {
  if (saved === null) {
    return false;
  }
  return (
    JSON.stringify(current.tables) !== JSON.stringify(saved.tables) ||
    JSON.stringify(current.notes) !== JSON.stringify(saved.notes) ||
    current.defaultColumnDisplay !== saved.defaultColumnDisplay
  );
}
