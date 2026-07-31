/**
 * Custom React Flow node that renders a dbt model as a table card.
 *
 * Each column row carries a target Handle on its left edge and a source Handle
 * on its right edge so FK edges attach to the exact columns; a table-level
 * source/target handle pair sits at the card's vertical center for FKs with no
 * column mapping (spec 03).
 */
import { memo, useContext } from 'react';
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

function TableNodeComponent({ id, data }: NodeProps<FlowNode>): JSX.Element {
  const interaction = useContext(DiagramInteractionContext);
  const highlighted = interaction?.highlightedColumns.get(id) ?? EMPTY_COLUMNS;

  return (
    <div className="table-node">
      <div className="table-node__title" title={data.description}>
        {data.label}
      </div>
      {data.columns.map((column, index) => {
        const isHighlighted = highlighted.has(column.name);
        return (
          <div
            key={column.name}
            className={`table-node__row${isHighlighted ? ' table-node__row--highlighted' : ''}`}
            style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }}
            title={column.description}
            onMouseEnter={() => interaction?.onColumnHover(id, column.name)}
            onMouseLeave={() => interaction?.onColumnLeave(id, column.name)}
          >
            <Handle id={columnTargetHandle(column.name)} type="target" position={Position.Left} />
            <span className="table-node__column-name">{column.name}</span>
            {column.dataType !== undefined && (
              <span className="table-node__column-type">{column.dataType}</span>
            )}
            <Handle id={columnSourceHandle(column.name)} type="source" position={Position.Right} />
          </div>
        );
      })}
      <Handle id={TABLE_TARGET_HANDLE} type="target" position={Position.Left} />
      <Handle id={TABLE_SOURCE_HANDLE} type="source" position={Position.Right} />
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
