/**
 * The "fields matrix" modal (spec 27): a spreadsheet-like grid over one
 * model's columns or every column of every model in the diagram. Renders a
 * "Columns…" popover for show/hide + drag-to-reorder, a per-column filter row
 * under the headers, editable cells, and a batch-apply affordance for
 * multi-cell selections.
 *
 * Modal chrome follows `SettingsPanel.tsx`'s conventions: Escape and outside
 * pointerdown close it.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { ModelEdit } from '../src/dbt/edit';
import type { DiagramGraph, TableNode } from '../src/diagram/graph';
import { buildMatrixRows, discoverMetaKeys, type MatrixRow } from '../src/diagram/matrix';
import {
  applyStoredPrefs,
  defaultMatrixColumns,
  toggleColumnVisible,
  reorderColumn,
  type MatrixColumnDef,
  type MatrixColumnId,
  type StoredMatrixColumnPref,
} from '../src/shared/matrixColumns';
import {
  cellsInSelection,
  extendSelection,
  startSelection,
  type CellRef,
  type MatrixSelection,
} from './matrix-selection';
import type { MatrixColumnFilters } from './hooks/useFieldsMatrix';

export interface FieldsMatrixProps {
  target: { scope: 'model'; model: string } | { scope: 'global' };
  graph: DiagramGraph;
  onEdit: (edit: ModelEdit) => void;
  onClose: () => void;
  /** Current column defs for this scope; seeded once when the modal opens. */
  columns: MatrixColumnDef[];
  /** Seeds the initial column defs (no host round trip). */
  seedColumns: (columns: MatrixColumnDef[]) => void;
  /** Applies a visibility/order change; posts it to the host. */
  onColumnsChange: (columns: MatrixColumnDef[]) => void;
  /** The stored preferences last received from the host, for this scope. */
  storedPrefs: StoredMatrixColumnPref[] | undefined;
  /** One filter text per column, keyed by column id; always reset on open. */
  columnFilters: MatrixColumnFilters;
  onColumnFilterChange: (columnId: MatrixColumnId, text: string) => void;
}

function columnIdKey(id: MatrixColumnId): string {
  return typeof id === 'string' ? id : `meta:${id.meta}`;
}

function cellText(row: MatrixRow, id: MatrixColumnId): string {
  if (id === 'model') return row.model;
  if (id === 'name') return row.column;
  if (id === 'dataType') return row.dataType ?? '';
  if (id === 'description') return row.description ?? '';
  if (id === 'primaryKey' || id === 'virtualPrimaryKey') return '';
  return row.meta[id.meta] ?? '';
}

export function FieldsMatrix({
  target,
  graph,
  onEdit,
  onClose,
  columns,
  seedColumns,
  onColumnsChange,
  storedPrefs,
  columnFilters,
  onColumnFilterChange,
}: FieldsMatrixProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<MatrixSelection | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [batchValue, setBatchValue] = useState('');
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  // Nodes in scope, and the meta keys discovered once at open time (spec 27,
  // Behavior note 6: a snapshot, not live).
  const nodes: TableNode[] = useMemo(() => {
    if (target.scope === 'global') return graph.nodes;
    const node = graph.nodes.find((n) => n.id === target.model);
    return node === undefined ? [] : [node];
  }, [graph, target]);

  const metaKeysRef = useRef<string[]>([]);
  if (columns.length === 0) {
    // First render for a freshly opened scope: compute the snapshot once.
    metaKeysRef.current = discoverMetaKeys(nodes);
  }

  useEffect(() => {
    if (columns.length > 0) return;
    const metaKeys = discoverMetaKeys(nodes);
    seedColumns(applyStoredPrefs(defaultMatrixColumns(metaKeys, target.scope), storedPrefs));
    // Only seed once per open (columns.length === 0 guards re-seeding).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const rows = useMemo(
    () => buildMatrixRows(nodes, metaKeysRef.current),
    [nodes],
  );

  const visibleColumns = columns.filter((c) => c.visible);

  // A row is kept when it matches every column's non-empty filter (spreadsheet
  // AND semantics): each active filter is checked against that column's own
  // cell, not any cell in the row.
  const filteredRowIndexes = useMemo(() => {
    const activeFilters = visibleColumns
      .map((column) => ({ column, needle: (columnFilters[columnIdKey(column.id)] ?? '').trim().toLowerCase() }))
      .filter(({ needle }) => needle.length > 0);
    if (activeFilters.length === 0) return rows.map((_, i) => i);
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        activeFilters.every(({ column, needle }) => {
          if (column.id === 'primaryKey' || column.id === 'virtualPrimaryKey') return true;
          return cellText(row, column.id).toLowerCase().includes(needle);
        }),
      )
      .map(({ index }) => index);
  }, [rows, columnFilters, visibleColumns]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (columnsMenuOpen) {
          setColumnsMenuOpen(false);
          return;
        }
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (
        columnsMenuOpen &&
        columnsMenuRef.current !== null &&
        event.target instanceof globalThis.Node &&
        !columnsMenuRef.current.contains(event.target)
      ) {
        setColumnsMenuOpen(false);
      }
      const element = ref.current;
      if (element !== null && event.target instanceof globalThis.Node && element.contains(event.target)) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose, columnsMenuOpen]);

  function editRow(row: MatrixRow, columnId: MatrixColumnId, value: string): void {
    if (columnId === 'model') return;
    if (columnId === 'name') {
      onEdit({ kind: 'setColumnName', model: row.model, column: row.column, name: value });
      return;
    }
    if (columnId === 'dataType') {
      onEdit({ kind: 'setColumnDataType', model: row.model, column: row.column, dataType: value });
      return;
    }
    if (columnId === 'description') {
      onEdit({
        kind: 'setColumnDescription',
        model: row.model,
        column: row.column,
        description: value,
      });
      return;
    }
    if (columnId === 'primaryKey' || columnId === 'virtualPrimaryKey') return;
    onEdit({ kind: 'setColumnMeta', model: row.model, column: row.column, key: columnId.meta, value });
  }

  function togglePrimaryKey(row: MatrixRow): void {
    const node = graph.nodes.find((n) => n.id === row.model);
    const pkColumns = node?.primaryKey?.columns ?? [];
    const virtual = node?.primaryKey?.virtual ?? false;
    const next = row.isPrimaryKey
      ? pkColumns.filter((c) => c !== row.column)
      : [...pkColumns, row.column];
    onEdit({ kind: 'setPrimaryKey', model: row.model, columns: next, virtual });
  }

  function toggleVirtualPrimaryKey(row: MatrixRow): void {
    const node = graph.nodes.find((n) => n.id === row.model);
    const pkColumns = node?.primaryKey?.columns ?? [];
    const virtual = node?.primaryKey?.virtual ?? false;
    onEdit({ kind: 'setPrimaryKey', model: row.model, columns: pkColumns, virtual: !virtual });
  }

  function cellRef(rowIndex: number, columnIndex: number): CellRef {
    return { row: rowIndex, columnIndex };
  }

  function onCellPointerDown(rowIndex: number, columnIndex: number): void {
    setSelection(startSelection(cellRef(rowIndex, columnIndex)));
    setSelecting(true);
  }

  function onCellPointerEnter(rowIndex: number, columnIndex: number): void {
    if (!selecting || selection === null) return;
    setSelection(extendSelection(selection, cellRef(rowIndex, columnIndex)));
  }

  useEffect(() => {
    const onPointerUp = (): void => setSelecting(false);
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, []);

  const selectedCells = selection === null ? [] : cellsInSelection(selection);
  const selectedSet = new Set(selectedCells.map((c) => `${c.row}:${c.columnIndex}`));
  const isSelected = (rowIndex: number, columnIndex: number): boolean =>
    selectedSet.has(`${rowIndex}:${columnIndex}`);

  // The single batch-editable column kind spanned by the current selection,
  // when 2+ cells of that (compatible) kind are selected.
  const batchColumn: MatrixColumnDef | undefined = useMemo(() => {
    if (selectedCells.length < 2) return undefined;
    const columnIndexes = new Set(selectedCells.map((c) => c.columnIndex));
    if (columnIndexes.size !== 1) return undefined;
    const columnIndex = [...columnIndexes][0];
    const column = visibleColumns[columnIndex];
    if (column === undefined || !column.batchEditable) return undefined;
    return column;
  }, [selectedCells, visibleColumns]);

  const isCheckboxColumn = (id: MatrixColumnId): boolean =>
    id === 'primaryKey' || id === 'virtualPrimaryKey';

  function applyBatch(): void {
    if (batchColumn === undefined) return;
    const visibleRowIndexes = new Set(filteredRowIndexes);
    for (const cell of selectedCells) {
      const rowIndex = filteredRowIndexes[cell.row];
      if (rowIndex === undefined || !visibleRowIndexes.has(rowIndex)) continue;
      const row = rows[rowIndex];
      if (row === undefined) continue;
      if (batchColumn.id === 'virtualPrimaryKey') {
        if (!row.isPrimaryKey) continue;
        toggleVirtualPrimaryKey(row);
        continue;
      }
      if (batchColumn.id === 'primaryKey') {
        togglePrimaryKey(row);
        continue;
      }
      editRow(row, batchColumn.id, batchValue);
    }
    setBatchValue('');
  }

  function onDragStart(index: number, event: DragEvent): void {
    event.dataTransfer.setData('text/plain', String(index));
  }

  function onDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isNaN(fromIndex)) return;
    onColumnsChange(reorderColumn(columns, fromIndex, index));
  }

  const scopeLabel = target.scope === 'global' ? 'Edit fields matrix (all models)' : `Edit fields matrix — ${target.model}`;

  return (
    <div className="fields-matrix-overlay">
      <div className="fields-matrix" ref={ref} role="dialog" aria-label={scopeLabel}>
        <div className="fields-matrix__header">
          <h2>{scopeLabel}</h2>
          <button type="button" className="panel-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="fields-matrix__toolbar">
          <div className="fields-matrix__columns-menu" ref={columnsMenuRef}>
            <button
              type="button"
              className="panel-button panel-button--secondary"
              onClick={() => setColumnsMenuOpen((open) => !open)}
            >
              Columns…
            </button>
            {columnsMenuOpen && (
              <div className="fields-matrix__columns-popover" role="menu">
                <ul className="fields-matrix__columns-list">
                  {columns.map((column, index) => (
                    <li
                      key={columnIdKey(column.id)}
                      className="fields-matrix__columns-item"
                      draggable
                      onDragStart={(event) => onDragStart(index, event)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDrop(index, event)}
                    >
                      <span className="fields-matrix__columns-handle" aria-hidden="true">
                        ⠿
                      </span>
                      <label className="fields-matrix__column-toggle">
                        <input
                          type="checkbox"
                          checked={column.visible}
                          onChange={() => onColumnsChange(toggleColumnVisible(columns, column.id))}
                        />
                        {column.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="fields-matrix__grid-wrap">
          <table className="fields-matrix__grid">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th key={columnIdKey(column.id)} title={column.label}>
                    {column.label}
                  </th>
                ))}
              </tr>
              <tr className="fields-matrix__filter-row">
                {visibleColumns.map((column) => (
                  <th key={columnIdKey(column.id)}>
                    {column.id === 'primaryKey' || column.id === 'virtualPrimaryKey' ? null : (
                      <input
                        type="text"
                        className="fields-matrix__column-filter"
                        placeholder="Filter…"
                        value={columnFilters[columnIdKey(column.id)] ?? ''}
                        onChange={(event) => onColumnFilterChange(column.id, event.target.value)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRowIndexes.map((rowIndex, visibleRowIndex) => {
                const row = rows[rowIndex];
                if (row === undefined) return null;
                return (
                  <tr key={`${row.model}.${row.column}`}>
                    {visibleColumns.map((column, columnIndex) => {
                      const selected = isSelected(visibleRowIndex, columnIndex);
                      if (isCheckboxColumn(column.id)) {
                        const checked =
                          column.id === 'primaryKey' ? row.isPrimaryKey : row.virtualPrimaryKey;
                        const disabled = column.id === 'virtualPrimaryKey' && !row.isPrimaryKey;
                        return (
                          <td
                            key={columnIdKey(column.id)}
                            className={selected ? 'fields-matrix__cell--selected' : undefined}
                            onPointerDown={() => onCellPointerDown(visibleRowIndex, columnIndex)}
                            onPointerEnter={() => onCellPointerEnter(visibleRowIndex, columnIndex)}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() =>
                                column.id === 'primaryKey'
                                  ? togglePrimaryKey(row)
                                  : toggleVirtualPrimaryKey(row)
                              }
                            />
                          </td>
                        );
                      }
                      if (column.id === 'model') {
                        return <td key="model">{row.model}</td>;
                      }
                      return (
                        <EditableCell
                          key={columnIdKey(column.id)}
                          value={cellText(row, column.id)}
                          selected={selected}
                          onPointerDown={() => onCellPointerDown(visibleRowIndex, columnIndex)}
                          onPointerEnter={() => onCellPointerEnter(visibleRowIndex, columnIndex)}
                          onCommit={(value) => editRow(row, column.id, value)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {batchColumn !== undefined && (
          <div className="fields-matrix__batch-bar">
            <span>
              Apply to {selectedCells.length} selected cell{selectedCells.length === 1 ? '' : 's'}
            </span>
            {isCheckboxColumn(batchColumn.id) ? (
              <label>
                <input
                  type="checkbox"
                  checked={batchValue === 'true'}
                  onChange={(event) => setBatchValue(event.target.checked ? 'true' : 'false')}
                />
                Checked
              </label>
            ) : (
              <input
                type="text"
                value={batchValue}
                onChange={(event) => setBatchValue(event.target.value)}
              />
            )}
            <button type="button" className="panel-button" onClick={applyBatch}>
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableCell({
  value,
  selected,
  onPointerDown,
  onPointerEnter,
  onCommit,
}: {
  value: string;
  selected: boolean;
  onPointerDown: () => void;
  onPointerEnter: () => void;
  onCommit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <td
      className={selected ? 'fields-matrix__cell--selected' : undefined}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
    >
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </td>
  );
}
