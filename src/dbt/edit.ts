/**
 * Edit operations on the in-memory model set. Pure logic — MUST NOT import `vscode`.
 * This module is the single funnel through which every webview mutation is
 * applied before being persisted by the wrappers in `src/vscode/`.
 *
 * Since spec 06 the funnel carries property edits only (model/column names,
 * descriptions, data types); spec 08 adds primary-key and foreign-key edits.
 * `addColumn` was removed with the Add-column form; adding columns returns as
 * its own feature later.
 */
import { parseRef, renameRefTarget } from './refs';
import { readVirtualConstraints, writeVirtualConstraints } from './virtual';
import type {
  DataTestEntry,
  ForeignKeyDescriptor,
  ModelColumn,
  ModelConstraint,
  ModelDefinition,
  VirtualForeignKey,
} from './types';

/** The model-level data test the PK editor owns (spec 08). */
const UNIQUE_COMBINATION_TEST = 'dbt_utils.unique_combination_of_columns';

export type ModelEdit =
  | { kind: 'setModelName'; model: string; name: string }
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'setColumnName'; model: string; column: string; name: string }
  | { kind: 'setColumnDataType'; model: string; column: string; dataType: string }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string }
  | { kind: 'setPrimaryKey'; model: string; columns: string[]; virtual: boolean }
  | { kind: 'setForeignKeyTarget'; model: string; fk: ForeignKeyDescriptor; target: string }
  | {
      kind: 'setForeignKeyColumns';
      model: string;
      fk: ForeignKeyDescriptor;
      columns: string[];
      toColumns: string[];
    }
  | { kind: 'setForeignKeyVirtual'; model: string; fk: ForeignKeyDescriptor; virtual: boolean }
  | { kind: 'addForeignKey'; model: string; target: string }
  | { kind: 'removeForeignKey'; model: string; fk: ForeignKeyDescriptor };

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
    case 'setPrimaryKey': {
      const columns = dedupeTrimmed(edit.columns);
      return mapModel(models, edit.model, (m) => setPrimaryKeyOnModel(m, columns, edit.virtual));
    }
    case 'setForeignKeyTarget':
      return applyForeignKeyTarget(models, edit.model, edit.fk, edit.target);
    case 'setForeignKeyColumns':
      return applyForeignKeyColumns(models, edit.model, edit.fk, edit.columns, edit.toColumns);
    case 'setForeignKeyVirtual':
      return mapModel(models, edit.model, (m) => setFkVirtualOnModel(m, edit.fk, edit.virtual));
    case 'addForeignKey': {
      if (!models.some((m) => m.name === edit.target)) {
        throw new EditError(`No model named "${edit.target}" exists in the workspace`);
      }
      return mapModel(models, edit.model, (m) => ({
        ...m,
        constraints: [
          ...(m.constraints ?? []),
          {
            type: 'foreign_key',
            columns: [],
            to: `ref('${edit.target}')`,
            toColumns: [],
          },
        ],
      }));
    }
    case 'removeForeignKey':
      return mapModel(models, edit.model, (m) => removeFkFromModel(m, edit.fk));
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

// ---------------------------------------------------------------------------
// Primary keys (spec 08)
// ---------------------------------------------------------------------------

/**
 * Applies `setPrimaryKey` to one model. The three real constructs stay in sync
 * in this single atomic edit (spec 08, Confirm at Approval (a)/(e)); a virtual
 * PK writes only the `config.meta.dbtiagram.virtual` block. The no-op guard
 * compares against the *displayed* state (virtual-first, per Confirm at
 * Approval (c)) so an unchanged UI selection never rewrites the file.
 */
function setPrimaryKeyOnModel(
  model: ModelDefinition,
  columns: string[],
  virtual: boolean,
): ModelDefinition {
  const existing = new Set((model.columns ?? []).map((c) => c.name));
  for (const column of columns) {
    if (!existing.has(column)) {
      throw new EditError(`Model "${model.name}" has no column named "${column}"`);
    }
  }

  const displayed = readDisplayedPrimaryKey(model);
  const resulting = columns.length === 0 ? undefined : { columns, virtual };
  if (displayed === undefined && resulting === undefined) return model;
  if (
    displayed !== undefined &&
    resulting !== undefined &&
    displayed.virtual === resulting.virtual &&
    arraysEqual(displayed.columns, resulting.columns)
  ) {
    return model;
  }

  const currentReal = readRealPrimaryKeyColumns(model);
  if (virtual) {
    let next = removeRealPrimaryKeyArtifacts(model, currentReal);
    const block = readVirtualConstraints(next);
    next = writeVirtualConstraints(next, {
      ...block,
      primaryKey: columns.length > 0 ? { columns } : undefined,
    });
    return next;
  }

  let next = writeVirtualConstraints(model, {
    ...readVirtualConstraints(model),
    primaryKey: undefined,
  });
  next = applyRealPrimaryKeySync(next, columns, currentReal);
  return next;
}

/** The PK the webview shows: the virtual block first, else the real constraint. */
function readDisplayedPrimaryKey(
  model: ModelDefinition,
): { columns: string[]; virtual: boolean } | undefined {
  const virtual = readVirtualConstraints(model);
  if (virtual.primaryKey !== undefined) {
    return { columns: virtual.primaryKey.columns, virtual: true };
  }
  const constraint = (model.constraints ?? []).find((c) => c.type === 'primary_key');
  if (constraint !== undefined) {
    return { columns: constraint.columns ?? [], virtual: false };
  }
  return undefined;
}

function readRealPrimaryKeyColumns(model: ModelDefinition): string[] {
  const constraint = (model.constraints ?? []).find((c) => c.type === 'primary_key');
  return constraint?.columns ?? [];
}

/** Syncs the real PK constructs: the data test, the constraint, and not_null. */
function applyRealPrimaryKeySync(
  model: ModelDefinition,
  columns: string[],
  currentReal: string[],
): ModelDefinition {
  let next = syncUniqueCombinationDataTest(model, columns);
  next = syncPrimaryKeyConstraint(next, columns);
  next = syncColumnNotNull(next, currentReal, columns);
  return next;
}

/**
 * Creates/updates/removes the `dbt_utils.unique_combination_of_columns`
 * model-level data test in place. The entry is found by its key; when the PK
 * is empty the entry is removed; other entries are preserved.
 */
function syncUniqueCombinationDataTest(
  model: ModelDefinition,
  columns: string[],
): ModelDefinition {
  const dataTests = model.dataTests;
  if (dataTests === undefined) {
    if (columns.length === 0) return model;
    return { ...model, dataTests: [buildUniqueTest(columns)] };
  }
  const index = dataTests.findIndex(isUniqueCombinationEntry);
  if (index === -1) {
    if (columns.length === 0) return model;
    return { ...model, dataTests: [...dataTests, buildUniqueTest(columns)] };
  }
  const next = [...dataTests];
  if (columns.length === 0) {
    next.splice(index, 1);
    return { ...model, dataTests: next.length > 0 ? next : undefined };
  }
  next[index] = buildUniqueTest(columns, dataTests[index]);
  return { ...model, dataTests: next };
}

function isUniqueCombinationEntry(entry: DataTestEntry): boolean {
  return entry === UNIQUE_COMBINATION_TEST || (isRecord(entry) && UNIQUE_COMBINATION_TEST in entry);
}

/**
 * Builds the mapping form `{ 'dbt_utils.unique_combination_of_columns': { …
 * arguments: { combination_of_columns: […], … } } }`, preserving the previous
 * entry's sibling keys (e.g. `enabled`) and the value's other `arguments` keys.
 */
function buildUniqueTest(columns: string[], previous?: DataTestEntry): DataTestEntry {
  const previousValue = isRecord(previous) ? previous[UNIQUE_COMBINATION_TEST] : undefined;
  const previousArguments = isRecord(previousValue) ? previousValue.arguments : undefined;
  const value: Record<string, unknown> = {
    ...(isRecord(previousValue) ? previousValue : {}),
    arguments: {
      ...(isRecord(previousArguments) ? previousArguments : {}),
      combination_of_columns: [...columns],
    },
  };
  if (isRecord(previous)) {
    return { ...previous, [UNIQUE_COMBINATION_TEST]: value };
  }
  return { [UNIQUE_COMBINATION_TEST]: value };
}

/** Creates/updates/removes the `type: primary_key` constraint in place. */
function syncPrimaryKeyConstraint(model: ModelDefinition, columns: string[]): ModelDefinition {
  const constraints = model.constraints;
  if (constraints === undefined) {
    if (columns.length === 0) return model;
    return { ...model, constraints: [{ type: 'primary_key', columns: [...columns] }] };
  }
  const index = constraints.findIndex((c) => c.type === 'primary_key');
  if (index === -1) {
    if (columns.length === 0) return model;
    return { ...model, constraints: [...constraints, { type: 'primary_key', columns: [...columns] }] };
  }
  const next = [...constraints];
  if (columns.length === 0) {
    next.splice(index, 1);
    return { ...model, constraints: next.length > 0 ? next : undefined };
  }
  next[index] = { ...constraints[index], columns: [...columns] };
  return { ...model, constraints: next };
}

/**
 * Moves `not_null` column-level data tests to match the PK: columns leaving
 * the old real PK lose it (the PK editor owns `not_null` on PK columns —
 * Confirm at Approval (e)), columns entering gain it exactly once. Only
 * `data_tests` is touched; legacy `tests` entries are left as-is.
 */
function syncColumnNotNull(
  model: ModelDefinition,
  oldRealPk: string[],
  newColumns: string[],
): ModelDefinition {
  const oldSet = new Set(oldRealPk);
  const newSet = new Set(newColumns);
  let changed = false;
  const nextColumns = (model.columns ?? []).map((column) => {
    const wasInPk = oldSet.has(column.name);
    const isInPk = newSet.has(column.name);
    if (wasInPk && !isInPk) {
      const next = removeNotNull(column);
      if (next !== column) changed = true;
      return next;
    }
    if (isInPk && !hasNotNull(column)) {
      changed = true;
      return { ...column, dataTests: [...(column.dataTests ?? []), 'not_null'] };
    }
    return column;
  });
  return changed ? { ...model, columns: nextColumns } : model;
}

function hasNotNull(column: ModelColumn): boolean {
  return (column.dataTests ?? []).some(isNotNullEntry);
}

function isNotNullEntry(entry: DataTestEntry): boolean {
  return entry === 'not_null' || (isRecord(entry) && 'not_null' in entry);
}

/** Removes every `not_null` entry from a column; drops `dataTests` when empty. */
function removeNotNull(column: ModelColumn): ModelColumn {
  const dataTests = column.dataTests;
  if (dataTests === undefined || !dataTests.some(isNotNullEntry)) return column;
  const next = dataTests.filter((entry) => !isNotNullEntry(entry));
  if (next.length === 0) {
    const { dataTests: _dropped, ...rest } = column;
    return rest;
  }
  return { ...column, dataTests: next };
}

/** Removes all three real PK constructs (used by the real -> virtual switch). */
function removeRealPrimaryKeyArtifacts(model: ModelDefinition, currentReal: string[]): ModelDefinition {
  let next = syncUniqueCombinationDataTest(model, []);
  next = syncPrimaryKeyConstraint(next, []);
  next = syncColumnNotNull(next, currentReal, []);
  return next;
}

// ---------------------------------------------------------------------------
// Foreign keys (spec 08)
// ---------------------------------------------------------------------------

/** Applies `setForeignKeyTarget`, validating that `target` is a workspace model. */
function applyForeignKeyTarget(
  models: ModelDefinition[],
  modelName: string,
  fk: ForeignKeyDescriptor,
  target: string,
): ApplyEditResult {
  if (!models.some((m) => m.name === target)) {
    throw new EditError(`No model named "${target}" exists in the workspace`);
  }
  return mapModel(models, modelName, (m) => setFkTargetOnModel(m, fk, target));
}

/**
 * Rewrites an FK's `to` to the canonical single-arg form `ref('target')`,
 * keeping `columns`/`toColumns` and the constraint's other keys. Matches the
 * real constraint or the virtual meta entry by descriptor content.
 */
function setFkTargetOnModel(
  model: ModelDefinition,
  fk: ForeignKeyDescriptor,
  target: string,
): ModelDefinition {
  const to = `ref('${target}')`;
  if (fk.virtual) {
    const block = readVirtualConstraints(model);
    const foreignKeys = block.foreignKeys ?? [];
    const index = foreignKeys.findIndex((v) => sameFk(v, fk));
    if (index === -1) throw new EditError('Foreign key not found');
    if (foreignKeys[index].to === to) return model;
    const nextFks = foreignKeys.map((v, i) => (i === index ? { ...v, to } : v));
    return writeVirtualConstraints(model, { ...block, foreignKeys: nextFks });
  }
  const constraints = model.constraints;
  if (constraints === undefined) throw new EditError('Foreign key not found');
  const index = constraints.findIndex((c) => isFkMatch(c, fk));
  if (index === -1) throw new EditError('Foreign key not found');
  if (constraints[index].to === to) return model;
  const next = [...constraints];
  next[index] = { ...constraints[index], to };
  return { ...model, constraints: next };
}

/** Applies `setForeignKeyColumns` with the spec's validations (Confirm at Approval (g)). */
function applyForeignKeyColumns(
  models: ModelDefinition[],
  modelName: string,
  fk: ForeignKeyDescriptor,
  columns: string[],
  toColumns: string[],
): ApplyEditResult {
  if (columns.length !== toColumns.length) {
    throw new EditError('Source and target column lists must have the same length');
  }
  const model = models.find((m) => m.name === modelName);
  if (model === undefined) throw new EditError(`No model named "${modelName}" exists in the workspace`);
  validateColumnsExist(model, columns);
  if (fk.target === undefined) {
    throw new EditError('Fix the foreign key target before editing its columns');
  }
  const targetModel = models.find((m) => m.name === fk.target);
  if (targetModel === undefined) {
    throw new EditError(`No model named "${fk.target}" exists in the workspace`);
  }
  validateColumnsExist(targetModel, toColumns);
  return mapModel(models, modelName, (m) => setFkColumnsOnModel(m, fk, columns, toColumns));
}

function validateColumnsExist(model: ModelDefinition, columns: string[]): void {
  const existing = new Set((model.columns ?? []).map((c) => c.name));
  for (const column of columns) {
    if (!existing.has(column)) {
      throw new EditError(`Model "${model.name}" has no column named "${column}"`);
    }
  }
}

/** Sets an FK's source/target column arrays, identity-preserving on no change. */
function setFkColumnsOnModel(
  model: ModelDefinition,
  fk: ForeignKeyDescriptor,
  columns: string[],
  toColumns: string[],
): ModelDefinition {
  if (fk.virtual) {
    const block = readVirtualConstraints(model);
    const foreignKeys = block.foreignKeys ?? [];
    const index = foreignKeys.findIndex((v) => sameFk(v, fk));
    if (index === -1) throw new EditError('Foreign key not found');
    const current = foreignKeys[index];
    if (arraysEqual(current.columns, columns) && arraysEqual(current.toColumns, toColumns)) {
      return model;
    }
    const nextFks = foreignKeys.map((v, i) => (i === index ? { ...v, columns, toColumns } : v));
    return writeVirtualConstraints(model, { ...block, foreignKeys: nextFks });
  }
  const constraints = model.constraints;
  if (constraints === undefined) throw new EditError('Foreign key not found');
  const index = constraints.findIndex((c) => isFkMatch(c, fk));
  if (index === -1) throw new EditError('Foreign key not found');
  const current = constraints[index];
  if (
    arraysEqual(current.columns ?? [], columns) &&
    arraysEqual(current.toColumns ?? [], toColumns)
  ) {
    return model;
  }
  const next = [...constraints];
  next[index] = { ...current, columns: [...columns], toColumns: [...toColumns] };
  return { ...model, constraints: next };
}

/** Converts an FK between real (constraint) and virtual (meta) storage. */
function setFkVirtualOnModel(
  model: ModelDefinition,
  fk: ForeignKeyDescriptor,
  virtual: boolean,
): ModelDefinition {
  if (fk.virtual === virtual) return model;
  if (virtual) {
    // real -> virtual: remove the constraint, append the meta entry.
    const constraints = model.constraints;
    if (constraints === undefined) throw new EditError('Foreign key not found');
    const index = constraints.findIndex((c) => isFkMatch(c, fk));
    if (index === -1) throw new EditError('Foreign key not found');
    const current = constraints[index];
    const nextConstraints = constraints.filter((_, i) => i !== index);
    const next: ModelDefinition = {
      ...model,
      constraints: nextConstraints.length > 0 ? nextConstraints : undefined,
    };
    const block = readVirtualConstraints(next);
    const entry: VirtualForeignKey = {
      to: current.to ?? fk.to,
      columns: current.columns ?? [],
      toColumns: current.toColumns ?? [],
    };
    return writeVirtualConstraints(next, {
      ...block,
      foreignKeys: [...(block.foreignKeys ?? []), entry],
    });
  }
  // virtual -> real: remove the meta entry, append the constraint.
  const block = readVirtualConstraints(model);
  const foreignKeys = block.foreignKeys ?? [];
  const index = foreignKeys.findIndex((v) => sameFk(v, fk));
  if (index === -1) throw new EditError('Foreign key not found');
  const current = foreignKeys[index];
  const nextFks = foreignKeys.filter((_, i) => i !== index);
  const next = writeVirtualConstraints(model, {
    ...block,
    foreignKeys: nextFks.length > 0 ? nextFks : undefined,
  });
  const constraint: ModelConstraint = {
    type: 'foreign_key',
    columns: [...current.columns],
    to: current.to,
    toColumns: [...current.toColumns],
  };
  return { ...next, constraints: [...(next.constraints ?? []), constraint] };
}

/** Removes an FK (real constraint or virtual meta entry); identity on no match. */
function removeFkFromModel(model: ModelDefinition, fk: ForeignKeyDescriptor): ModelDefinition {
  if (fk.virtual) {
    const block = readVirtualConstraints(model);
    const foreignKeys = block.foreignKeys ?? [];
    const nextFks = foreignKeys.filter((v) => !sameFk(v, fk));
    if (nextFks.length === foreignKeys.length) return model;
    return writeVirtualConstraints(model, {
      ...block,
      foreignKeys: nextFks.length > 0 ? nextFks : undefined,
    });
  }
  const constraints = model.constraints;
  if (constraints === undefined) return model;
  const next = constraints.filter((c) => !isFkMatch(c, fk));
  if (next.length === constraints.length) return model;
  return { ...model, constraints: next.length > 0 ? next : undefined };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Content match of a real constraint against a descriptor (spec 08, (d)). */
function isFkMatch(constraint: ModelConstraint, fk: ForeignKeyDescriptor): boolean {
  return (
    constraint.type === 'foreign_key' &&
    (constraint.to ?? '') === fk.to &&
    arraysEqual(constraint.columns ?? [], fk.columns) &&
    arraysEqual(constraint.toColumns ?? [], fk.toColumns)
  );
}

/** Content match of a virtual meta entry against a descriptor. */
function sameFk(virtual: VirtualForeignKey, fk: ForeignKeyDescriptor): boolean {
  return (
    virtual.to === fk.to &&
    arraysEqual(virtual.columns, fk.columns) &&
    arraysEqual(virtual.toColumns, fk.toColumns)
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trims and dedupes a list of names (used by `setPrimaryKey`). */
function dedupeTrimmed(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
