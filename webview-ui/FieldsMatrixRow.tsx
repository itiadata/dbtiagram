import { useEffect, useState } from 'react';
import type { MatrixRow } from '../src/diagram/matrix';
import type { MatrixColumnDef, MatrixColumnId } from '../src/shared/matrixColumns';

export interface FieldsMatrixRowProps {
  row: MatrixRow;
  visibleRowIndex: number;
  visibleColumns: readonly MatrixColumnDef[];
  selectedCells: ReadonlySet<string>;
  reorderEnabled: boolean;
  onCellPointerDown: (rowIndex: number, columnIndex: number) => void;
  onCellPointerEnter: (rowIndex: number, columnIndex: number) => void;
  onTextCommit: (row: MatrixRow, column: MatrixColumnId, value: string) => void;
  onPrimaryKeyToggle: (row: MatrixRow) => void;
  onVirtualPrimaryKeyToggle: (row: MatrixRow) => void;
  onReorderDragStart?: (column: string) => void;
  onReorderDropBefore?: (column: string) => void;
}

function key(id: MatrixColumnId): string { return typeof id === 'string' ? id : `meta:${id.meta}`; }
function text(row: MatrixRow, id: MatrixColumnId): string {
  if (id === 'model') return row.model;
  if (id === 'name') return row.column;
  if (id === 'dataType') return row.dataType ?? '';
  if (id === 'description') return row.description ?? '';
  if (id === 'primaryKey' || id === 'virtualPrimaryKey') return '';
  return row.meta[id.meta] ?? '';
}

export function FieldsMatrixRow(props: FieldsMatrixRowProps): JSX.Element {
  return (
    <tr
      onDragOver={(event) => { if (props.reorderEnabled) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (props.reorderEnabled) props.onReorderDropBefore?.(props.row.column); }}
    >
      {props.visibleColumns.map((column, columnIndex) => {
        const selected = props.selectedCells.has(`${props.visibleRowIndex}:${columnIndex}`);
        const events = {
          onPointerDown: () => props.onCellPointerDown(props.visibleRowIndex, columnIndex),
          onPointerEnter: () => props.onCellPointerEnter(props.visibleRowIndex, columnIndex),
        };
        if (column.id === 'primaryKey' || column.id === 'virtualPrimaryKey') {
          const virtual = column.id === 'virtualPrimaryKey';
          return <td key={key(column.id)} className={selected ? 'fields-matrix__cell--selected' : undefined} {...events}>
            <input type="checkbox" checked={virtual ? props.row.virtualPrimaryKey : props.row.isPrimaryKey}
              disabled={virtual && !props.row.isPrimaryKey}
              onChange={() => virtual ? props.onVirtualPrimaryKeyToggle(props.row) : props.onPrimaryKeyToggle(props.row)} />
          </td>;
        }
        if (column.id === 'model') return <td key="model">{props.row.model}</td>;
        return <EditableCell key={key(column.id)} value={text(props.row, column.id)} selected={selected}
          {...events} onCommit={(value) => props.onTextCommit(props.row, column.id, value)} />;
      })}
      {props.onReorderDragStart !== undefined && <td className="fields-matrix__row-handle-cell">
        <span className={`fields-matrix__row-handle${props.reorderEnabled ? '' : ' fields-matrix__row-handle--disabled'}`}
          draggable={props.reorderEnabled}
          onDragStart={() => { if (props.reorderEnabled) props.onReorderDragStart?.(props.row.column); }}
          title={props.reorderEnabled ? 'Drag to reorder' : 'Clear filters to reorder'}>⠿</span>
      </td>}
    </tr>
  );
}

function EditableCell({ value, selected, onPointerDown, onPointerEnter, onCommit }: {
  value: string; selected: boolean; onPointerDown: () => void; onPointerEnter: () => void; onCommit: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <td className={selected ? 'fields-matrix__cell--selected' : undefined} onPointerDown={onPointerDown} onPointerEnter={onPointerEnter}>
    <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft)}
      onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} />
  </td>;
}
