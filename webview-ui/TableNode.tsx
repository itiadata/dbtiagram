/**
 * Custom React Flow node that renders a dbt model as a table card.
 *
 * Each column row carries a target and a source Handle on both its left and
 * right edge so FK edges attach to the exact columns. Spec 12 (Manual Verify
 * iteration): all four are ALWAYS mounted — React Flow caches handle bounds
 * per node measurement, so conditionally mounting a handle makes it
 * unresolvable and its edge is dropped. `data.handles` (handle id -> side)
 * decides only which of them is VISIBLE, so a dot still appears exactly where
 * an FK edge attaches and nowhere else — unrelated columns and edge-free cards
 * show no dots at all. All edges attaching to the same (column, side) share
 * one dot (spec 12, section 9). Table-level handles are gone (FK edges are
 * column-pair-only).
 *
 * Since spec 06 the cards are interactive: clicking the header selects the
 * table, clicking a row selects the column, and double-clicking a column's
 * name or data type cell turns it into an inline text input (Enter/blur
 * commits, Escape cancels). The data type cell is always rendered (muted
 * placeholder when absent) so a type can be added to a typeless column.
 */
import { memo, useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  columnSourceHandle,
  columnTargetHandle,
  CARD_ANCHOR,
  HEADER_ANCHOR,
  type HandleSide,
  type FlowNode,
} from '../src/diagram/flow';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../src/diagram/layout';
import { DiagramInteractionContext } from './diagram-interaction-context';
import { KeyRound, FlaskConical } from './icons';

const EMPTY_COLUMNS: ReadonlySet<string> = new Set();
const EMPTY_PK_COLUMNS: readonly string[] = [];

/**
 * Which cell is being edited inline: the table title, or a cell of a column.
 */
type EditingCell =
  | { kind: 'title' }
  | { kind: 'column'; column: string; cell: 'name' | 'type' }
  | null;

function TableNodeComponent({ id, data }: NodeProps<FlowNode>): JSX.Element {
  const interaction = useContext(DiagramInteractionContext);
  const highlighted = interaction?.highlightedColumns.get(id) ?? EMPTY_COLUMNS;
  const selectedTable = interaction?.selectedTableId === id;
  const selectedColumnRef = interaction?.selectedColumnRef ?? null;
  const [editing, setEditing] = useState<EditingCell>(null);

  // Spec 08: PK columns render a key icon — filled for a real PK, outlined
  // for a virtual one (data.primaryKey is virtual-first, see graph.ts).
  const pkColumns = data.primaryKey?.columns ?? EMPTY_PK_COLUMNS;
  const pkVirtual = data.primaryKey?.virtual ?? false;

  const isSelectedColumn = (column: string): boolean =>
    selectedColumnRef !== null &&
    selectedColumnRef.model === id &&
    selectedColumnRef.column === column;

  // Spec 09 merged: the handles this node's edges actually use (id -> side).
  // Spec 12 (Manual Verify iteration): ALL four handles per column are always
  // mounted — React Flow caches a node's handle bounds when it measures the
  // node, so conditionally mounting a handle leaves those bounds stale and the
  // edge referencing the new handle is silently DROPPED (the "only one of two
  // FK lines is drawn" bug). `data.handles` therefore drives only visibility.
  const usedHandles = data.handles;
  const updateNodeInternals = useUpdateNodeInternals();
  // Refresh React Flow's cached handle bounds whenever this node receives a
  // new `data` object — which happens on EVERY diagram edit, not just one
  // that adds/removes/moves an FK, because `mergeFlowNodes` (positions.ts)
  // gives every node a brand-new `data`/`width`/`height` object on every
  // `diagram:update` (spec 04's "refresh data/width/height" behavior). React
  // Flow ties its handle-bounds cache to node identity, so without an
  // explicit refresh here an edit to a column with no FK at all — same
  // `handlesKey`, but a new `data` reference — leaves the cache stale and
  // React Flow silently drops edges it can no longer resolve (the same
  // "cached handle bounds" hazard spec 12 section 8 fixed for the
  // conditionally-mounted-handle case). Keying on `data` itself, rather than
  // only `handlesKey`, is what makes an edit anywhere in the diagram refresh
  // every node's bounds, not just the node whose used-handle set changed.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data, updateNodeInternals]);

  const renderHandle = (
    column: string,
    side: HandleSide,
    type: 'source' | 'target',
  ): JSX.Element => {
    const handleId = type === 'source' ? columnSourceHandle(column, side) : columnTargetHandle(column, side);
    const used = usedHandles?.[handleId] !== undefined;
    const position = side === 'right' ? Position.Right : Position.Left;
    const broken = column === CARD_ANCHOR && used;
    const isHeaderAnchor = column === HEADER_ANCHOR;
    // Every handle sits at the row's exact vertical center, so all edges
    // attaching to the same (column, side) — however many, in either
    // direction — converge on ONE shared dot (spec 12, section 9). A
    // HEADER_ANCHOR handle (spec 24) sits on the header instead, styled as a
    // normal (non-broken) connection — the column is only hidden, not missing.
    return (
      <Handle
        key={handleId}
        id={handleId}
        type={type}
        position={position}
        style={isHeaderAnchor ? { top: HEADER_HEIGHT / 2 } : undefined}
        className={
          used
            ? broken
              ? 'table-node__handle--broken'
              : undefined
            : 'table-node__handle--unused'
        }
      />
    );
  };

  return (
    <div className={`table-node${selectedTable ? ' table-node--selected' : ''}`}>
      {renderHandle(CARD_ANCHOR, 'left', 'target')}
      {renderHandle(CARD_ANCHOR, 'right', 'target')}
      {renderHandle(CARD_ANCHOR, 'left', 'source')}
      {renderHandle(CARD_ANCHOR, 'right', 'source')}
      {renderHandle(HEADER_ANCHOR, 'left', 'target')}
      {renderHandle(HEADER_ANCHOR, 'right', 'target')}
      {renderHandle(HEADER_ANCHOR, 'left', 'source')}
      {renderHandle(HEADER_ANCHOR, 'right', 'source')}
      <div
        className={`table-node__title${selectedTable ? ' table-node__title--selected' : ''}`}
        title={data.description}
        onClick={() => interaction?.onTableSelect(id)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          setEditing({ kind: 'title' });
        }}
      >
        {editing?.kind === 'title' ? (
          <InlineEditField
            value={data.label}
            titleStyle
            onCommit={(draft) => {
              setEditing(null);
              const name = draft.trim();
              if (name.length === 0) return; // blank model names revert silently
              interaction?.onEdit({ kind: 'setModelName', model: id, name });
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          data.label
        )}
      </div>
      {data.columns.map((column, index) => {
        const isHighlighted = highlighted.has(column.name);
        const isSelected = isSelectedColumn(column.name);
        const isPk = pkColumns.includes(column.name);
        const editingCell =
          editing?.kind === 'column' && editing.column === column.name ? editing.cell : null;
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
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              interaction?.onColumnContextMenu(id, column.name, event);
            }}
          >
            {renderHandle(column.name, 'left', 'target')}
            {renderHandle(column.name, 'right', 'target')}
            {isPk && (
              <span
                className={`table-node__pk-icon${
                  pkVirtual ? ' table-node__pk-icon--virtual' : ''
                }`}
                title={pkVirtual ? 'Virtual primary key' : 'Primary key'}
              >
                <KeyRound size={10} />
              </span>
            )}
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
                  setEditing({ kind: 'column', column: column.name, cell: 'name' });
                }}
              >
                {column.name}
              </span>
            )}
            {column.tests !== undefined && column.tests.length > 0 && (
              <span
                className="table-node__test-icon"
                title={`Tests: ${column.tests.join(', ')}`}
              >
                <FlaskConical size={10} />
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
                  setEditing({ kind: 'column', column: column.name, cell: 'type' });
                }}
              >
                {column.dataType ?? '—'}
              </span>
            )}
            {renderHandle(column.name, 'left', 'source')}
            {renderHandle(column.name, 'right', 'source')}
          </div>
        );
      })}
    </div>
  );
}

interface InlineEditFieldProps {
  value: string;
  placeholder?: string;
  /** Styles the input as a title editor (fills the header, matches its font). */
  titleStyle?: boolean;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}

/**
 * A single-line inline editor for a table cell: auto-focused, text selected,
 * `nodrag` + `stopPropagation` so editing never starts a node drag or bubbles
 * to the row's select handler. Enter/blur commit; Escape cancels (a cancelled
 * edit's trailing blur is ignored via `finishedRef`).
 */
function InlineEditField({
  value,
  placeholder,
  titleStyle,
  onCommit,
  onCancel,
}: InlineEditFieldProps): JSX.Element {
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
      className={`table-node__inline-edit nodrag${
        titleStyle ? ' table-node__inline-edit--title' : ''
      }`}
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
