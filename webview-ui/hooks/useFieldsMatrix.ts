/**
 * Open/close state for the "fields matrix" modal (spec 27): which scope is
 * open (per-model or global), the column show/hide + reorder preferences
 * round-tripped with the extension host, and the always-reset per-column
 * text filters.
 *
 * Column defs are seeded by `FieldsMatrix` itself (via `setColumns`) once it
 * knows the meta keys discovered for the newly opened scope — this hook only
 * owns the open/close/filter/columns state and the round trip to the host.
 */
import { useCallback, useState } from 'react';
import type { MessageToExtension } from '../../src/shared/protocol';
import {
  mergeStoredPrefs,
  type MatrixColumnDef,
  type MatrixColumnId,
  type MatrixScope,
  type StoredMatrixColumnPref,
} from '../../src/shared/matrixColumns';

export type MatrixTarget = { scope: 'model'; model: string } | { scope: 'global' } | null;

/** Per-column filter text, keyed by the column's stringified id. */
export type MatrixColumnFilters = Record<string, string>;

export interface FieldsMatrixState {
  target: MatrixTarget;
  openForModel: (model: string) => void;
  openGlobal: () => void;
  close: () => void;
  /** Current column defs for the open scope; [] while target is null. */
  columns: MatrixColumnDef[];
  /** Sets the initial column defs for a freshly opened scope; does not post. */
  seedColumns: (columns: MatrixColumnDef[]) => void;
  setColumns: (columns: MatrixColumnDef[]) => void; // posts matrix:setColumnPrefs
  /** Applies a host-pushed matrix:columnPrefs message for the matching scope. */
  applyColumnPrefs: (scope: MatrixScope, stored: StoredMatrixColumnPref[]) => void;
  /** The stored preferences last received from the host, per scope. */
  storedPrefs: Record<MatrixScope, StoredMatrixColumnPref[] | undefined>;
  /** One filter text per column, keyed by column id; always reset on open. */
  columnFilters: MatrixColumnFilters;
  setColumnFilter: (columnId: MatrixColumnId, text: string) => void;
}

export function useFieldsMatrix(
  post: (message: MessageToExtension) => void,
): FieldsMatrixState {
  const [target, setTarget] = useState<MatrixTarget>(null);
  const [columns, setColumnsState] = useState<MatrixColumnDef[]>([]);
  const [columnFilters, setColumnFiltersState] = useState<MatrixColumnFilters>({});
  const [storedPrefs, setStoredPrefs] = useState<
    Record<MatrixScope, StoredMatrixColumnPref[] | undefined>
  >({ model: undefined, global: undefined });

  const openForModel = useCallback((model: string) => {
    setTarget({ scope: 'model', model });
    setColumnFiltersState({});
    setColumnsState([]);
  }, []);

  const openGlobal = useCallback(() => {
    setTarget({ scope: 'global' });
    setColumnFiltersState({});
    setColumnsState([]);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const seedColumns = useCallback((next: MatrixColumnDef[]) => setColumnsState(next), []);

  const setColumns = useCallback(
    (next: MatrixColumnDef[]) => {
      setColumnsState(next);
      if (target === null) return;
      const nextStored = next.map((column) => ({ id: column.id, visible: column.visible }));
      // Carry forward any previously configured column (e.g. a meta key this
      // model/scope doesn't currently show) instead of dropping it, so
      // switching models never loses its remembered visibility/order (spec 27).
      const merged = mergeStoredPrefs(nextStored, storedPrefs[target.scope]);
      setStoredPrefs((current) => ({ ...current, [target.scope]: merged }));
      post({ type: 'matrix:setColumnPrefs', scope: target.scope, columns: merged });
    },
    [target, post, storedPrefs],
  );

  const applyColumnPrefs = useCallback((scope: MatrixScope, stored: StoredMatrixColumnPref[]) => {
    setStoredPrefs((current) => ({ ...current, [scope]: stored }));
  }, []);

  const setColumnFilter = useCallback((columnId: MatrixColumnId, text: string) => {
    const key = typeof columnId === 'string' ? columnId : `meta:${columnId.meta}`;
    setColumnFiltersState((current) => ({ ...current, [key]: text }));
  }, []);

  return {
    target,
    openForModel,
    openGlobal,
    close,
    columns,
    seedColumns,
    setColumns,
    applyColumnPrefs,
    storedPrefs,
    columnFilters,
    setColumnFilter,
  };
}

