/**
 * Model-level edits: renaming a model and setting its description. Pure logic —
 * MUST NOT import `vscode`.
 */
import { renameRefTarget } from '../refs';
import { readVirtualConstraints, writeVirtualConstraints } from '../virtual';
import type { ModelConstraint, ModelDefinition } from '../types';
import { ApplyEditResult, EditError, blankToUndefined } from './internal';

/**
 * Renames a model and re-points every `foreign_key` constraint `to` ref that
 * names the old model (in any model, self-references included) at the new
 * name — for real constraints and virtual meta FKs alike (spec 08, Manual
 * Verify fix (j)). Unchanged models keep their object identity, so
 * `distributeEditedModels` rewrites only the affected files (spec 06).
 */
export function renameModel(
  models: ModelDefinition[],
  oldName: string,
  newName: string,
): ApplyEditResult {
  let renamed = false;
  const next = models.map((m) => {
    if (m.name !== oldName) {
      const constraints = renameFkTargets(m.constraints, oldName, newName);
      const withVirtual = renameVirtualFkTargets(m, oldName, newName);
      if (constraints === m.constraints && withVirtual === m) return m;
      return {
        ...withVirtual,
        constraints: constraints === m.constraints ? m.constraints : constraints,
      };
    }
    renamed = true;
    if (newName === m.name) return m; // no-op rename keeps object identity
    const renamedModel: ModelDefinition = {
      ...m,
      name: newName,
      constraints: renameFkTargets(m.constraints, oldName, newName),
    };
    return renameVirtualFkTargets(renamedModel, oldName, newName);
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
 * Re-points a model's **virtual** FK `to` refs from `oldName` to `newName`
 * (spec 08, Manual Verify fix (j)) — the `config.meta.dbtiagram.virtual`
 * block equivalent of `renameFkTargets`. Unparseable `to` strings are left
 * untouched, mirroring real constraints. Returns the original model object
 * when nothing changed, preserving identity for `distributeEditedModels`.
 */
function renameVirtualFkTargets(
  model: ModelDefinition,
  oldName: string,
  newName: string,
): ModelDefinition {
  const block = readVirtualConstraints(model);
  if (block.foreignKeys === undefined) return model;
  let changed = false;
  const next = block.foreignKeys.map((fk) => {
    const to = renameRefTarget(fk.to, oldName, newName);
    if (to === null || to === fk.to) return fk;
    changed = true;
    return { ...fk, to };
  });
  if (!changed) return model;
  return writeVirtualConstraints(model, { ...block, foreignKeys: next });
}

/**
 * Descriptions are stored as typed; a whitespace-only value clears the key
 * (`undefined` makes the serializer omit it). Returns the model unchanged when
 * the value did not actually change.
 */
export function applyDescription(model: ModelDefinition, description: string): ModelDefinition {
  const next = blankToUndefined(description);
  return next === model.description ? model : { ...model, description: next };
}
