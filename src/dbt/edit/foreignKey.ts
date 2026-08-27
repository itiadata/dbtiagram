/**
 * Foreign-key edits (spec 08, extended by spec 09). Pure logic — MUST NOT
 * import `vscode`.
 *
 * An FK is stored either as a real `foreign_key` constraint or as an entry in
 * the `config.meta.dbtiagram.virtual` block; both forms are matched by
 * descriptor *content*, never by index.
 */
import { readVirtualConstraints, writeVirtualConstraints } from '../virtual';
import type {
  ForeignKeyDescriptor,
  ModelConstraint,
  ModelDefinition,
  VirtualForeignKey,
} from '../types';
import { ApplyEditResult, EditError, arraysEqual, mapModel } from './internal';

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

function validateColumnsExist(model: ModelDefinition, columns: string[]): void {
  const existing = new Set((model.columns ?? []).map((c) => c.name));
  for (const column of columns) {
    if (!existing.has(column)) {
      throw new EditError(`Model "${model.name}" has no column named "${column}"`);
    }
  }
}

/** Applies `setForeignKeyTarget`, validating that `target` is a workspace model. */
export function applyForeignKeyTarget(
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
export function applyForeignKeyColumns(
  models: ModelDefinition[],
  modelName: string,
  fk: ForeignKeyDescriptor,
  columns: string[],
  toColumns: string[],
): ApplyEditResult {
  // Spec 09 merged: an FK needs at least one column pair — the UI removes the
  // FK instead of emptying it, so the pure layer refuses the empty write.
  if (columns.length === 0) {
    throw new EditError('A foreign key needs at least one column pair');
  }
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

/**
 * Applies `createForeignKey` (spec 09 merged): persists an FK atomically with
 * its first column pair(s). Replaces the spec 08 `addForeignKey`, which wrote
 * an empty table-level FK. Real → a `foreign_key` constraint; virtual → a meta
 * block entry. A no-op (an identical FK already present) keeps object identity
 * so `distributeEditedModels` skips the file.
 */
export function createForeignKey(
  models: ModelDefinition[],
  modelName: string,
  target: string,
  columns: string[],
  toColumns: string[],
  virtual: boolean,
): ApplyEditResult {
  const model = models.find((m) => m.name === modelName);
  if (model === undefined) throw new EditError(`No model named "${modelName}" exists in the workspace`);
  if (!models.some((m) => m.name === target)) {
    throw new EditError(`No model named "${target}" exists in the workspace`);
  }
  if (columns.length !== toColumns.length) {
    throw new EditError('Source and target column lists must have the same length');
  }
  if (columns.length === 0) {
    throw new EditError('A foreign key needs at least one column pair');
  }
  validateColumnsExist(model, columns);
  const targetModel = models.find((m) => m.name === target);
  if (targetModel === undefined) throw new EditError(`No model named "${target}" exists in the workspace`);
  validateColumnsExist(targetModel, toColumns);
  return mapModel(models, modelName, (m) => {
    const to = `ref('${target}')`;
    if (virtual) {
      const block = readVirtualConstraints(m);
      const existing = block.foreignKeys ?? [];
      if (
        existing.some(
          (v) => v.to === to && arraysEqual(v.columns, columns) && arraysEqual(v.toColumns, toColumns),
        )
      ) {
        return m;
      }
      return writeVirtualConstraints(m, {
        ...block,
        foreignKeys: [...existing, { to, columns: [...columns], toColumns: [...toColumns] }],
      });
    }
    const constraints = m.constraints ?? [];
    if (
      constraints.some(
        (c) =>
          c.type === 'foreign_key' &&
          (c.to ?? '') === to &&
          arraysEqual(c.columns ?? [], columns) &&
          arraysEqual(c.toColumns ?? [], toColumns),
      )
    ) {
      return m;
    }
    return {
      ...m,
      constraints: [
        ...constraints,
        { type: 'foreign_key', columns: [...columns], to, toColumns: [...toColumns] },
      ],
    };
  });
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
export function setFkVirtualOnModel(
  model: ModelDefinition,
  fk: ForeignKeyDescriptor,
  virtual: boolean,
): ModelDefinition {
  if (fk.virtual === virtual) return model;
  // Spec 09 merged: converting a zero-pair FK would persist a zero-pair FK in
  // the other storage — the file never holds a zero-pair FK as the result of
  // an editor action, so the pure layer refuses (the UI disables the checkbox).
  if (fk.columns.length === 0 && fk.toColumns.length === 0) {
    throw new EditError('Add a column pair before changing storage');
  }
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
export function removeFkFromModel(
  model: ModelDefinition,
  fk: ForeignKeyDescriptor,
): ModelDefinition {
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
