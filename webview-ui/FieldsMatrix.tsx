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
import { FieldsMatrixRow } from './FieldsMatrixRow';
import { FieldsMatrixCreateRow } from './FieldsMatrixCreateRow';
import { addColumnEdit, hasActiveMatrixFilter, matrixReorderEdit } from './matrix-row-order';

export interface FieldsMatrixProps {
  target: { scope: 'model'; model: string } | { scope: 'global' };
  graph: DiagramGraph;
  onEdit: (edit: ModelEdit) => void;
  onClose: () => void;
  columns: MatrixColumnDef[];
  seedColumns: (columns: MatrixColumnDef[]) => void;
  onColumnsChange: (columns: MatrixColumnDef[]) => void;
  storedPrefs: StoredMatrixColumnPref[] | undefined;
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
  const [draggedRow, setDraggedRow] = useState<string | null>(null);

  const nodes: TableNode[] = useMemo(() => {
    if (target.scope === 'global') return graph.nodes;
    const node = graph.nodes.find((n) => n.id === target.model);
    return node === undefined ? [] : [node];
  }, [graph, target]);

  const metaKeysRef = useRef<string[]>([]);
  if (columns.length === 0) {
    metaKeysRef.current = discoverMetaKeys(nodes);
  }

  useEffect(() => {
    if (columns.length > 0) return;
    const metaKeys = discoverMetaKeys(nodes);
    seedColumns(applyStoredPrefs(defaultMatrixColumns(metaKeys, target.scope), storedPrefs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length]);

  const rows = useMemo(
    () => buildMatrixRows(nodes, metaKeysRef.current),
    [nodes],
  );

  const visibleColumns = columns.filter((c) => c.visible);

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
  const reorderEnabled = target.scope === 'model' && !hasActiveMatrixFilter(columnFilters);

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

  const scopeLabel = target.scope === 'global' ? 'Edit fields matrix (all models)' : `Edit columns — ${target.model}`;

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
                {target.scope === 'model' && <th className="fields-matrix__row-handle-cell">Order</th>}
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
                {target.scope === 'model' && <th className="fields-matrix__row-handle-cell" />}
              </tr>
            </thead>
            <tbody
              onDragOver={(event) => { if (reorderEnabled) event.preventDefault(); }}
              onDrop={(event) => {
                if (event.target instanceof Element && event.target.closest('tr')?.classList.contains('fields-matrix__create-row')) {
                  event.preventDefault();
                  if (target.scope === 'model' && draggedRow !== null && reorderEnabled) {
                    onEdit(matrixReorderEdit(target.model, rows, draggedRow, undefined));
                    setDraggedRow(null);
                  }
                }
              }}
            >
              {filteredRowIndexes.map((rowIndex, visibleRowIndex) => {
                const row = rows[rowIndex];
                if (row === undefined) return null;
                return <FieldsMatrixRow key={`${row.model}.${row.column}`} row={row} visibleRowIndex={visibleRowIndex}
                  visibleColumns={visibleColumns} selectedCells={selectedSet} reorderEnabled={reorderEnabled}
                  onCellPointerDown={onCellPointerDown} onCellPointerEnter={onCellPointerEnter}
                  onTextCommit={editRow} onPrimaryKeyToggle={togglePrimaryKey} onVirtualPrimaryKeyToggle={toggleVirtualPrimaryKey}
                  onReorderDragStart={target.scope === 'model' ? setDraggedRow : undefined}
                  onReorderDropBefore={target.scope === 'model' ? (before) => {
                    if (draggedRow !== null) onEdit(matrixReorderEdit(target.model, rows, draggedRow, before));
                    setDraggedRow(null);
                  } : undefined} />;
              })}
              {target.scope === 'model' && <FieldsMatrixCreateRow visibleColumns={visibleColumns} onCreate={(name, dataType) => {
                const edit = addColumnEdit(target.model, name, dataType);
                if (edit !== null) onEdit(edit);
              }} />}
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
