import type { ModelEdit } from '../src/dbt/edit';
import type { MatrixRow } from '../src/diagram/matrix';
import type { MatrixColumnId } from '../src/shared/matrixColumns';

export type EditableMetaScalar = string | number | boolean;
export type MetaScalarParseResult =
  | { ok: true; value: EditableMetaScalar }
  | { ok: false; error: string };

export function isMetaArray(value: unknown): value is unknown[] { return Array.isArray(value); }

export function isEditableMetaScalar(value: unknown): value is EditableMetaScalar {
  return typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
}

export function matrixMetaPreview(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(matrixMetaPreview).join(', ');
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

export function parseEditedMetaScalar(original: EditableMetaScalar, draft: string): MetaScalarParseResult {
  if (typeof original === 'string') return { ok: true, value: draft };
  if (typeof original === 'number') {
    const value = Number(draft.trim());
    return draft.trim().length > 0 && Number.isFinite(value)
      ? { ok: true, value } : { ok: false, error: 'Enter a valid number' };
  }
  const value = draft.trim().toLowerCase();
  if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
  return { ok: false, error: 'Enter true or false' };
}

export function matrixTextEdit(row: MatrixRow, columnId: MatrixColumnId, value: string): ModelEdit | null {
  if (columnId === 'model' || columnId === 'primaryKey' || columnId === 'virtualPrimaryKey') return null;
  if (columnId === 'name') return { kind: 'setColumnName', model: row.model, column: row.column, name: value };
  if (columnId === 'dataType') return { kind: 'setColumnDataType', model: row.model, column: row.column, dataType: value };
  if (columnId === 'description') return { kind: 'setColumnDescription', model: row.model, column: row.column, description: value };
  return { kind: 'setColumnMeta', model: row.model, column: row.column, key: columnId.meta, value };
}

export function matrixArrayEdit(row: MatrixRow, columnId: MatrixColumnId, values: readonly unknown[]): ModelEdit | null {
  if (typeof columnId === 'string') return null;
  return { kind: 'setColumnMetaArray', model: row.model, column: row.column, key: columnId.meta, values: [...values] };
}

export function metaValuesSupportTextBatch(values: readonly unknown[]): boolean {
  return values.every((value) => value === undefined || isEditableMetaScalar(value));
}
