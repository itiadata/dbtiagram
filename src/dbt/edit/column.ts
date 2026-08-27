/**
 * Column-level edits: renaming a column (with FK reference re-pointing) and
 * setting a column's data type or description. Pure logic — MUST NOT import
 * `vscode`.
 */
import { parseRef } from '../refs';
import { readVirtualConstraints, writeVirtualConstraints } from '../virtual';
import type {
  ModelColumn,
  ModelConstraint,
  ModelDefinition,
  VirtualForeignKey,
} from '../types';
import { ApplyEditResult, EditError, blankToUndefined, mapNames } from './internal';

/** Maps a single named column; throws if the column does not exist. */
export function mapColumn(
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

/** Sets a column's `data_type`; a blank value clears the key. */
export function setColumnDataType(
  model: ModelDefinition,
  column: string,
  dataType: string,
): ModelDefinition {
  return mapColumn(model, column, (c) => {
    const next = blankToUndefined(dataType.trim());
    return next === c.dataType ? c : { ...c, dataType: next };
  });
}

/** Sets a column's description; a whitespace-only value clears the key. */
export function setColumnDescription(
  model: ModelDefinition,
  column: string,
  description: string,
): ModelDefinition {
  return mapColumn(model, column, (c) => {
    const next = blankToUndefined(description);
    return next === c.description ? c : { ...c, description: next };
  });
}

/**
 * Renames a column and re-points every FK reference to it: `to_columns` in
 * constraints whose `to` targets the renamed model (in any model,
 * self-references included) and `columns` in constraints declared on the
 * renamed model itself — for real constraints and virtual meta FKs alike
 * (spec 08, Manual Verify fix (j)). Unchanged models keep their object
 * identity, so `distributeEditedModels` rewrites only the affected files
 * (spec 06).
 */
export function renameColumn(
  models: ModelDefinition[],
  modelName: string,
  oldName: string,
  newName: string,
): ApplyEditResult {
  let renamed = false;
  const next = models.map((m) => {
    if (m.name !== modelName) {
      const constraints = renameFkColumns(m.constraints, modelName, oldName, newName, false);
      const withVirtual = renameVirtualFkColumns(m, modelName, oldName, newName, false);
      if (constraints === m.constraints && withVirtual === m) return m;
      return {
        ...withVirtual,
        constraints: constraints === m.constraints ? m.constraints : constraints,
      };
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
    model = renameVirtualFkColumns(model, modelName, oldName, newName, true);
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

/**
 * Re-points a model's **virtual** FK column references after a column rename
 * (spec 08, Manual Verify fix (j)) — the `config.meta.dbtiagram.virtual`
 * block equivalent of `renameFkColumns`: source-side `columns` when the FK is
 * declared on the renamed model, and target-side `to_columns` when the FK's
 * `to` parses to it. Unparseable `to` strings leave `to_columns` untouched,
 * mirroring real constraints. Returns the original model object when nothing
 * changed, preserving identity for `distributeEditedModels`.
 */
function renameVirtualFkColumns(
  model: ModelDefinition,
  renamedModel: string,
  oldName: string,
  newName: string,
  declaredOnRenamedModel: boolean,
): ModelDefinition {
  const block = readVirtualConstraints(model);
  if (block.foreignKeys === undefined) return model;
  let changed = false;
  const next = block.foreignKeys.map((fk) => {
    let nextFk: VirtualForeignKey = fk;
    if (declaredOnRenamedModel) {
      const columns = mapNames(fk.columns, oldName, newName);
      if (columns !== fk.columns) {
        nextFk = { ...nextFk, columns };
        changed = true;
      }
    }
    const ref = parseRef(fk.to);
    if (ref !== null && ref.name === renamedModel) {
      const toColumns = mapNames(fk.toColumns, oldName, newName);
      if (toColumns !== fk.toColumns) {
        nextFk = { ...nextFk, toColumns };
        changed = true;
      }
    }
    return nextFk;
  });
  if (!changed) return model;
  return writeVirtualConstraints(model, { ...block, foreignKeys: next });
}
