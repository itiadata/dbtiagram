/**
 * Diagram selection state (spec 06) and the focused foreign key (spec 08).
 *
 * Owns the pending-rename bookkeeping: a rename of the selected entity keeps
 * the selection on the old entity until the host's `diagram:update` confirms
 * it, so the details sidebar never flashes its empty state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelEdit } from '../../src/dbt/edit';
import type { ForeignKeyDescriptor } from '../../src/dbt/types';
import type { DiagramGraph } from '../../src/diagram/graph';
import { sameFkContent } from '../ForeignKeySection';

/** What the user selected on the diagram (spec 06): a table or a column. */
export type Selection =
  | { kind: 'table'; id: string }
  | { kind: 'column'; model: string; column: string }
  | null;

/** A rename of the selected entity, pending the host's verdict (spec 06). */
interface PendingRename {
  oldRef: Exclude<Selection, null>;
  newRef: Exclude<Selection, null>;
}

export interface SelectionState {
  selection: Selection;
  focusedFk: ForeignKeyDescriptor | null;
  setFocusedFk: (fk: ForeignKeyDescriptor | null) => void;
  onTableSelect: (model: string) => void;
  onColumnSelect: (model: string, column: string) => void;
  onPaneClick: () => void;
  /** Records a rename of the selected entity so the selection can follow it. */
  notePendingRename: (edit: ModelEdit) => void;
  /** A rejected edit: the selection never moved, so only the ref is dropped. */
  clearPendingRename: () => void;
  /** Confirms a pending rename and drops selections whose entity vanished. */
  reconcileToGraph: (diagram: DiagramGraph) => void;
}

/**
 * @param revealDetails Called whenever something is selected, so the details
 *   sidebar reopens if the user had collapsed it (spec 11).
 */
export function useSelection(revealDetails: () => void): SelectionState {
  const [selection, setSelection] = useState<Selection>(null);
  const [focusedFk, setFocusedFk] = useState<ForeignKeyDescriptor | null>(null);

  // The current selection is mirrored into a ref so the `onEdit` funnel
  // (created once) can read the freshest value without re-creating.
  const selectionRef = useRef<Selection>(null);
  const pendingRenameRef = useRef<PendingRename | null>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Spec 11: selecting anything (table header, column row, FK edge click/
  // double-click — the latter two funnel through onTableSelect) reveals the
  // details sidebar so the properties never seem to have "disappeared".
  const onTableSelect = useCallback(
    (model: string): void => {
      setSelection({ kind: 'table', id: model });
      revealDetails();
    },
    [revealDetails],
  );

  const onColumnSelect = useCallback(
    (model: string, column: string): void => {
      setSelection({ kind: 'column', model, column });
      revealDetails();
    },
    [revealDetails],
  );

  const onPaneClick = useCallback((): void => {
    setSelection(null);
    setFocusedFk(null);
  }, []);

  const notePendingRename = useCallback((edit: ModelEdit): void => {
    const current = selectionRef.current;
    if (current === null) return;
    if (edit.kind === 'setModelName' && current.kind === 'table' && current.id === edit.model) {
      const name = edit.name.trim();
      if (name.length > 0 && name !== current.id) {
        pendingRenameRef.current = { oldRef: current, newRef: { kind: 'table', id: name } };
      }
      return;
    }
    if (
      edit.kind === 'setColumnName' &&
      current.kind === 'column' &&
      current.model === edit.model &&
      current.column === edit.column
    ) {
      const name = edit.name.trim();
      if (name.length > 0 && name !== current.column) {
        pendingRenameRef.current = {
          oldRef: current,
          newRef: { kind: 'column', model: edit.model, column: name },
        };
      }
    }
  }, []);

  const clearPendingRename = useCallback((): void => {
    pendingRenameRef.current = null;
  }, []);

  const reconcileToGraph = useCallback((diagram: DiagramGraph): void => {
    // A pending rename is confirmed by this update — follow the selection to
    // the new identity BEFORE the reconcile pass, so the reconcile (which
    // clears vanished entities) cannot drop the renamed selection, and the
    // sidebar switches to the new name in one render.
    const pending = pendingRenameRef.current;
    if (pending !== null) {
      setSelection(pending.newRef);
      pendingRenameRef.current = null;
    }

    // Reconcile the selection against the FULL graph: a selection that is
    // merely filtered out by the sidebar survives; one whose entity truly
    // disappeared (external delete, vanished column) clears.
    setSelection((current) => {
      if (current === null) return current;
      if (current.kind === 'table') {
        return diagram.nodes.some((node) => node.id === current.id) ? current : null;
      }
      const node = diagram.nodes.find((n) => n.id === current.model);
      if (node === undefined) return null;
      return node.columns.some((col) => col.name === current.column) ? current : null;
    });

    // Spec 08: a focused FK survives a diagram update only while a descriptor
    // matching it still exists (an edit that changed the FK clears the focus).
    setFocusedFk((current) => {
      if (current === null) return current;
      const stillThere = diagram.nodes.some((node) =>
        node.foreignKeys.some((fk) => sameFkContent(current, fk)),
      );
      return stillThere ? current : null;
    });
  }, []);

  return {
    selection,
    focusedFk,
    setFocusedFk,
    onTableSelect,
    onColumnSelect,
    onPaneClick,
    notePendingRename,
    clearPendingRename,
    reconcileToGraph,
  };
}
