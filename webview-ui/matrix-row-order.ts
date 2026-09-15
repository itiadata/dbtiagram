import type { ModelEdit } from '../src/dbt/edit';
import type { MatrixRow } from '../src/diagram/matrix';

export function hasActiveMatrixFilter(filters: Readonly<Record<string, string>>): boolean {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

export function matrixReorderEdit(
  model: string,
  _orderedRows: readonly MatrixRow[],
  draggedColumn: string,
  before: string | undefined,
): ModelEdit {
  return {
    kind: 'transferColumns',
    sourceModel: model,
    destinationModel: model,
    columns: [draggedColumn],
    before,
    copy: false,
  };
}

export function addColumnEdit(model: string, name: string, dataType: string): ModelEdit | null {
  const trimmedName = name.trim();
  const trimmedType = dataType.trim();
  return trimmedName.length === 0 || trimmedType.length === 0
    ? null
    : { kind: 'addColumn', model, name: trimmedName, dataType: trimmedType };
}
