/**
 * Custom React Flow node that renders a dbt model as a table card.
 *
 * Each column row carries a target Handle on its left edge and a source Handle
 * on its right edge so FK edges attach to the exact columns; a table-level
 * source/target handle pair sits at the card's vertical center for FKs with no
 * column mapping (spec 03).
 *
 * Since spec 06 the cards are interactive: clicking the header selects the
 * table, clicking a row selects the column, and double-clicking a column's
 * name or data type cell turns it into an inline text input (Enter/blur
 * commits, Escape cancels). The data type cell is always rendered (muted
 * placeholder when absent) so a type can be added to a typeless column.
 */
import { memo, useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  TABLE_SOURCE_HANDLE,
  TABLE_TARGET_HANDLE,
  columnSourceHandle,
  columnTargetHandle,
  type FlowNode,
} from '../src/diagram/flow';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../src/diagram/layout';
import { DiagramInteractionContext } from './diagram-interaction-context';

const EMPTY_COLUMNS: ReadonlySet<string> = new Set();

/** Which cell of which column is being edited inline. */
type EditingCell = { column: string; cell: 'name' | 'type' } | null;

function TableNodeComponent({ id, data }: NodeProps<FlowNode>): JSX.Element {
  const interaction = useContext(DiagramInteractionContext);
  const highlighted = interaction?.highlightedColumns.get(id) ?? EMPTY_COLUMNS;
  const selectedTable = interaction?.selectedTableId === id;
  const selectedColumnRef = interaction?.selectedColumnRef ?? null;
  const [editing, setEditing] = useState<EditingCell>(null);

  const isSelectedColumn = (column: string): boolean =>
    selectedColumnRef !== null &&
    selectedColumnRef.model === id &&
    selectedColumnRef.column === column;

  return (
    <div className={`table-node${selectedTable ? ' table-node--selected' : ''}`}>
      <div
        className={`table-node__title${selectedTable ? ' table-node__title--selected' : ''}`}
        title={data.description}
        onClick={() => interaction?.onTableSelect(id)}
      >
        {data.label}
      </div>
      {data.columns.map((column, index) => {
        const isHighlighted = highlighted.has(column.name);
        const isSelected = isSelectedColumn(column.name);
        const editingCell = editing?.column === column.name ? editing.cell : null;
        return (
          <div
            key={column.name}
            className={`table-node__row${isHighlighted ? ' table-node__row--highlighted' : ''}${
              isSelected ? ' table-node__row--selected' : ''
            }`}
            style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }}
            title={column.description}
            onMouseEnter={() => interaction?.onColumnHover(id, column.name)}
            onMouseLeave={() => interaction?.onColumnLeave(id, column.name)}
            onClick={() => interaction?.onColumnSelect(id, column.name)}
          >
            <Handle id={columnTargetHandle(column.name)} type="target" position={Position.Left} />
            {editingCell === 'name' ? (
              <InlineEditField
                value={column.name}
                onCommit={(draft) => {
                  setEditing(null);
                  const name = draft.trim();
                  if (name.length === 0) return; // blank column names revert silently
                  interaction?.onEdit({
                    kind: 'setColumnName',
                    model: id,
                    column: column.name,
                    name,
                  });
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <span
                className="table-node__column-name nodrag"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditing({ column: column.name, cell: 'name' });
                }}
              >
                {column.name}
              </span>
            )}
            {editingCell === 'type' ? (
              <InlineEditField
                value={column.dataType ?? ''}
                placeholder="data type"
                onCommit={(draft) => {
                  setEditing(null);
                  interaction?.onEdit({
                    kind: 'setColumnDataType',
                    model: id,
                    column: column.name,
                    dataType: draft,
                  });
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <span
                className={`table-node__column-type nodrag${
                  column.dataType === undefined ? ' table-node__column-type--placeholder' : ''
                }`}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditing({ column: column.name, cell: 'type' });
                }}
              >
                {column.dataType ?? '—'}
              </span>
            )}
            <Handle
              id={columnSourceHandle(column.name)}
              type="source"
              position={Position.Right}
            />
          </div>
        );
      })}
      <Handle id={TABLE_TARGET_HANDLE} type="target" position={Position.Left} />
      <Handle id={TABLE_SOURCE_HANDLE} type="source" position={Position.Right} />
    </div>
  );
}

interface InlineEditFieldProps {
  value: string;
  placeholder?: string;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}

/**
 * A single-line inline editor for a table cell: auto-focused, text selected,
 * `nodrag` + `stopPropagation` so editing never starts a node drag or bubbles
 * to the row's select handler. Enter/blur commit; Escape cancels (a cancelled
 * edit's trailing blur is ignored via `finishedRef`).
 */
function InlineEditField({ value, placeholder, onCommit, onCancel }: InlineEditFieldProps): JSX.Element {
  const [draft, setDraft] = useState(value);
  const finishedRef = useRef(false);

  // A diagram:update that changed this cell resets the draft; other updates
  // leave the in-progress edit alone (spec 06, section 5).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCommit(draft);
  };

  const cancel = (): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <input
      className="table-node__inline-edit nodrag"
      value={draft}
      placeholder={placeholder}
      autoFocus
      onFocus={(event) => event.target.select()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

export const TableNode = memo(TableNodeComponent);
