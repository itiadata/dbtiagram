/**
 * Edit operations on the in-memory model set. Pure logic — MUST NOT import `vscode`.
 * This module is the single funnel through which every webview mutation is
 * applied before being persisted by the wrappers in `src/vscode/`.
 *
 * Since spec 06 the funnel carries property edits only (model/column names,
 * descriptions, data types). `addColumn` was removed with the Add-column form;
 * adding columns returns as its own feature later.
 */
import { parseRef, renameRefTarget } from './refs';
import type { ModelColumn, ModelConstraint, ModelDefinition } from './types';

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
      return renameModel(models, edit.model, name);
    }
    case 'setModelDescription':
      return mapModel(models, edit.model, (m) =>
        applyDescription(m, edit.description),
      );
    case 'setColumnName': {
      const name = edit.name.trim();
      if (name.length === 0) throw new EditError('Column name must not be empty');
      return renameColumn(models, edit.model, edit.column, name);
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
 * Renames a model and re-points every `foreign_key` constraint `to` ref that
 * names the old model (in any model, self-references included) at the new
 * name. Unchanged models keep their object identity, so
 * `distributeEditedModels` rewrites only the affected files (spec 06).
 */
function renameModel(
  models: ModelDefinition[],
  oldName: string,
  newName: string,
): ApplyEditResult {
  let renamed = false;
  const next = models.map((m) => {
    if (m.name !== oldName) {
      const constraints = renameFkTargets(m.constraints, oldName, newName);
      return constraints === m.constraints ? m : { ...m, constraints };
    }
    renamed = true;
    if (newName === m.name) return m; // no-op rename keeps object identity
    return {
      ...m,
      name: newName,
      constraints: renameFkTargets(m.constraints, oldName, newName),
    };
  });
  if (!renamed) throw new EditError(`No model named "${oldName}" exists in the workspace`);
  return { models: next, changed: true };
}

/**
 * Re-points a model's `foreign_key` constraint `to` refs from `oldName` to
 * `newName`. Returns the original array when nothing changed; non-FK
 * constraints and unparseable `to` strings are left untouched.
 */
function renameFkTargets(
  constraints: ModelConstraint[] | undefined,
  oldName: string,
  newName: string,
): ModelConstraint[] | undefined {
  if (constraints === undefined) return undefined;
  let changed = false;
  const next = constraints.map((constraint) => {
    if (constraint.type !== 'foreign_key' || constraint.to === undefined) return constraint;
    const to = renameRefTarget(constraint.to, oldName, newName);
    if (to === null || to === constraint.to) return constraint;
    changed = true;
    return { ...constraint, to };
  });
  return changed ? next : constraints;
}

/**
 * Renames a column and re-points every FK reference to it: `to_columns` in
 * constraints whose `to` targets the renamed model (in any model,
 * self-references included) and `columns` in constraints declared on the
 * renamed model itself. Unchanged models keep their object identity, so
 * `distributeEditedModels` rewrites only the affected files (spec 06).
 */
function renameColumn(
  models: ModelDefinition[],
  modelName: string,
  oldName: string,
  newName: string,
): ApplyEditResult {
  let renamed = false;
  const next = models.map((m) => {
    if (m.name !== modelName) {
      const constraints = renameFkColumns(m.constraints, modelName, oldName, newName, false);
      return constraints === m.constraints ? m : { ...m, constraints };
    }
    renamed = true;
    const columns = m.columns ?? [];
    if (!columns.some((c) => c.name === oldName)) {
      throw new EditError(`Model "${m.name}" has no column named "${oldName}"`);
    }
    if (columns.some((c) => c.name !== oldName && c.name === newName)) {
      throw new EditError(`Model "${m.name}" already has a column named "${newName}"`);
    }
    let model: ModelDefinition = m;
    const nextColumns = mapColumns(m.columns, oldName, newName);
    if (nextColumns !== m.columns) model = { ...model, columns: nextColumns };
    const constraints = renameFkColumns(m.constraints, modelName, oldName, newName, true);
    if (constraints !== m.constraints) model = { ...model, constraints };
    return model;
  });
  if (!renamed) throw new EditError(`No model named "${modelName}" exists in the workspace`);
  return { models: next, changed: true };
}

/** Maps column objects renaming `oldName` → `newName`; identity-preserving. */
function mapColumns(
  columns: ModelColumn[] | undefined,
  oldName: string,
  newName: string,
): ModelColumn[] | undefined {
  if (columns === undefined) return undefined;
  if (newName === oldName || !columns.some((c) => c.name === oldName)) return columns;
  return columns.map((c) => (c.name === oldName ? { ...c, name: newName } : c));
}

/**
 * Re-points a model's `foreign_key` constraint column references after a
 * column rename: source-side `columns` when the constraint is declared on the
 * renamed model, and target-side `to_columns` when the constraint's `to`
 * parses to it. Returns the original array when nothing changed.
 */
function renameFkColumns(
  constraints: ModelConstraint[] | undefined,
  renamedModel: string,
  oldName: string,
  newName: string,
  declaredOnRenamedModel: boolean,
): ModelConstraint[] | undefined {
  if (constraints === undefined) return undefined;
  let changed = false;
  const next = constraints.map((constraint) => {
    if (constraint.type !== 'foreign_key') return constraint;
    let c: ModelConstraint = constraint;
    if (declaredOnRenamedModel && constraint.columns !== undefined) {
      const columns = mapNames(constraint.columns, oldName, newName);
      if (columns !== constraint.columns) {
        c = { ...c, columns };
        changed = true;
      }
    }
    if (constraint.to !== undefined && constraint.toColumns !== undefined) {
      const ref = parseRef(constraint.to);
      if (ref !== null && ref.name === renamedModel) {
        const toColumns = mapNames(constraint.toColumns, oldName, newName);
        if (toColumns !== constraint.toColumns) {
          c = { ...c, toColumns };
          changed = true;
        }
      }
    }
    return c;
  });
  return changed ? next : constraints;
}

/** Maps a string array renaming `oldName` → `newName`; identity-preserving. */
function mapNames(names: string[], oldName: string, newName: string): string[] {
  if (newName === oldName || !names.includes(oldName)) return names;
  return names.map((n) => (n === oldName ? newName : n));
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
