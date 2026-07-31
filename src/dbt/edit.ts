/**
 * Edit operations on the in-memory model set. Pure logic — MUST NOT import `vscode`.
 * This module is the single funnel through which every webview mutation is
 * applied before being persisted by the wrappers in `src/vscode/`.
 *
 * Since spec 06 the funnel carries property edits only (model/column names,
 * descriptions, data types). `addColumn` was removed with the Add-column form;
 * adding columns returns as its own feature later.
 */
import type { ModelColumn, ModelDefinition } from './types';

export type ModelEdit =
  | { kind: 'setModelName'; model: string; name: string }
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'setColumnName'; model: string; column: string; name: string }
  | { kind: 'setColumnDataType'; model: string; column: string; dataType: string }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string };

export class EditError extends Error {}

export interface ApplyEditResult {
  models: ModelDefinition[];
  changed: boolean;
}

/**
 * Applies a single `ModelEdit` to a copy of the model set.
 *
 * Unchanged models keep their object identity (same-name renames and no-op
 * value writes return the original objects), which is what lets
 * `distributeEditedModels` skip untouched files on write-back (spec 06).
 */
export function applyEdit(models: ModelDefinition[], edit: ModelEdit): ApplyEditResult {
  switch (edit.kind) {
    case 'setModelName': {
      const name = edit.name.trim();
      if (name.length === 0) throw new EditError('Model name must not be empty');
      if (models.some((m) => m.name !== edit.model && m.name === name)) {
        throw new EditError(`A model named "${name}" already exists`);
      }
      return mapModel(models, edit.model, (m) => (name === m.name ? m : { ...m, name }));
    }
    case 'setModelDescription':
      return mapModel(models, edit.model, (m) =>
        applyDescription(m, edit.description),
      );
    case 'setColumnName': {
      const name = edit.name.trim();
      if (name.length === 0) throw new EditError('Column name must not be empty');
      return mapModel(models, edit.model, (m) => {
        if ((m.columns ?? []).some((c) => c.name !== edit.column && c.name === name)) {
          throw new EditError(`Model "${m.name}" already has a column named "${name}"`);
        }
        return mapColumn(m, edit.column, (c) => (name === c.name ? c : { ...c, name }));
      });
    }
    case 'setColumnDataType':
      return mapModel(models, edit.model, (m) =>
        mapColumn(m, edit.column, (c) => {
          const dataType = blankToUndefined(edit.dataType.trim());
          return dataType === c.dataType ? c : { ...c, dataType };
        }),
      );
    case 'setColumnDescription':
      return mapModel(models, edit.model, (m) =>
        mapColumn(m, edit.column, (c) => {
          const description = blankToUndefined(edit.description);
          return description === c.description ? c : { ...c, description };
        }),
      );
  }
}

/** Maps a single named model; throws if the model does not exist. */
function mapModel(
  models: ModelDefinition[],
  name: string,
  fn: (model: ModelDefinition) => ModelDefinition,
): ApplyEditResult {
  let changed = false;
  const next = models.map((m) => {
    if (m.name !== name) return m;
    changed = true;
    return fn(m);
  });
  if (!changed) throw new EditError(`No model named "${name}" exists in the workspace`);
  return { models: next, changed: true };
}

/** Maps a single named column; throws if the column does not exist. */
function mapColumn(
  model: ModelDefinition,
  name: string,
  fn: (column: ModelColumn) => ModelColumn,
): ModelDefinition {
  const columns = model.columns ?? [];
  if (!columns.some((c) => c.name === name)) {
    throw new EditError(`Model "${model.name}" has no column named "${name}"`);
  }
  let changed = false;
  const nextColumns = columns.map((c) => {
    if (c.name !== name) return c;
    const next = fn(c);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...model, columns: nextColumns } : model;
}

/**
 * Descriptions are stored as typed; a whitespace-only value clears the key
 * (`undefined` makes the serializer omit it). Returns the model unchanged when
 * the value did not actually change.
 */
function applyDescription(model: ModelDefinition, description: string): ModelDefinition {
  const next = blankToUndefined(description);
  return next === model.description ? model : { ...model, description: next };
}

/** Whitespace-only values clear the key: `undefined` makes the serializer omit it. */
function blankToUndefined(value: string): string | undefined {
  return value.trim().length === 0 ? undefined : value;
}
