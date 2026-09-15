import { useState } from 'react';
import type { MatrixColumnDef, MatrixColumnId } from '../src/shared/matrixColumns';

export interface FieldsMatrixCreateRowProps {
  visibleColumns: readonly MatrixColumnDef[];
  onCreate: (name: string, dataType: string) => void;
}

function key(id: MatrixColumnId): string { return typeof id === 'string' ? id : `meta:${id.meta}`; }

export function FieldsMatrixCreateRow({ visibleColumns, onCreate }: FieldsMatrixCreateRowProps): JSX.Element {
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('');
  const submit = (): void => {
    if (name.trim().length === 0 || dataType.trim().length === 0) return;
    onCreate(name, dataType);
    setName('');
    setDataType('');
  };
  return <tr className="fields-matrix__create-row">
    {visibleColumns.map((column) => <td key={key(column.id)}>
      {column.id === 'name' && <input type="text" placeholder="New column" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} />}
      {column.id === 'dataType' && <input type="text" placeholder="Data type" value={dataType} onChange={(event) => setDataType(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} />}
    </td>)}
    <td className="fields-matrix__row-handle-cell" />
  </tr>;
}
