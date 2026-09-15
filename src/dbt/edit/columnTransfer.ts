/** Atomic column creation and transfer (spec 46). Pure — MUST NOT import vscode. */
import { parseRef } from '../refs';
import type { DataTestEntry, ModelColumn, ModelConstraint, ModelDefinition, VirtualForeignKey } from '../types';
import { readVirtualConstraints, writeVirtualConstraints } from '../virtual';
import { ApplyEditResult, EditError, isRecord } from './internal';
import { hasUniqueCombinationTest, setPrimaryKeyOnModel } from './primaryKey';

interface PrimaryKeyState { columns: string[]; virtual: boolean; uniqueTest: boolean }
interface MovedNames { selected: Set<string>; names: Map<string, string> }
interface ForeignKeyPair { owner: string; source: string; target: string; targetColumn: string }

export function transferredColumnName(
  original: string,
  destinationNames: ReadonlySet<string>,
  operation: 'MOVED' | 'COPIED',
): string {
  if (!destinationNames.has(original)) return original;
  const base = `${original}_${operation}`;
  if (!destinationNames.has(base)) return base;
  let suffix = 2;
  while (destinationNames.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function addColumn(
  models: ModelDefinition[], modelName: string, name: string, dataType: string,
): ApplyEditResult {
  const trimmedName = name.trim();
  const trimmedType = dataType.trim();
  if (trimmedName.length === 0 || trimmedType.length === 0) {
    throw new EditError('Column name and data type are required');
  }
  const model = requireModel(models, modelName);
  if ((model.columns ?? []).some((column) => column.name === trimmedName)) {
    throw new EditError(`A column named "${trimmedName}" already exists in model "${modelName}"`);
  }
  return {
    models: models.map((candidate) => candidate === model
      ? { ...candidate, columns: [...(candidate.columns ?? []), { name: trimmedName, dataType: trimmedType }] }
      : candidate),
    changed: true,
  };
}

export function transferColumns(
  models: ModelDefinition[],
  sourceModel: string,
  destinationModel: string,
  columns: string[],
  before: string | undefined,
  copy: boolean,
): ApplyEditResult {
  const source = requireModel(models, sourceModel);
  const destination = requireModel(models, destinationModel);
  const sourceColumns = source.columns ?? [];
  const requested = new Set(columns);
  const selectedColumns = sourceColumns.filter((column) => requested.has(column.name));
  for (const name of requested) {
    if (!sourceColumns.some((column) => column.name === name)) {
      throw new EditError(`Model "${sourceModel}" has no column named "${name}"`);
    }
  }
  if (before !== undefined && !(destination.columns ?? []).some((column) => column.name === before)) {
    throw new EditError(`Model "${destinationModel}" has no column named "${before}"`);
  }
  if (selectedColumns.length === 0) return { models, changed: false };
  if (source === destination) return reorderWithinModel(models, source, selectedColumns, before);

  const usedNames = new Set((destination.columns ?? []).map((column) => column.name));
  const names = new Map<string, string>();
  const operation = copy ? 'COPIED' : 'MOVED';
  const transferred = selectedColumns.map((column) => {
    const name = transferredColumnName(column.name, usedNames, operation);
    names.set(column.name, name);
    usedNames.add(name);
    return { ...cloneColumn(column), name };
  });
  const moved: MovedNames = { selected: new Set(selectedColumns.map((column) => column.name)), names };
  const destinationColumns = insertBefore(destination.columns ?? [], transferred, before);
  let next = models.map((model) => {
    if (model === source) {
      return copy ? model : { ...model, columns: sourceColumns.filter((column) => !moved.selected.has(column.name)) };
    }
    return model === destination ? { ...model, columns: destinationColumns } : model;
  });
  if (!copy) next = transformForeignKeys(next, models, sourceModel, destinationModel, moved);
  next = transferPrimaryKey(next, source, destination, moved, copy);
  return { models: next, changed: true };
}

function reorderWithinModel(
  models: ModelDefinition[], model: ModelDefinition, selected: ModelColumn[], before: string | undefined,
): ApplyEditResult {
  const selectedNames = new Set(selected.map((column) => column.name));
  if (before !== undefined && selectedNames.has(before)) return { models, changed: false };
  const remaining = (model.columns ?? []).filter((column) => !selectedNames.has(column.name));
  const nextColumns = insertBefore(remaining, selected, before);
  const unchanged = nextColumns.every((column, index) => column === model.columns?.[index]);
  return unchanged
    ? { models, changed: false }
    : { models: models.map((candidate) => candidate === model ? { ...model, columns: nextColumns } : candidate), changed: true };
}

function insertBefore(base: ModelColumn[], inserted: ModelColumn[], before: string | undefined): ModelColumn[] {
  const index = before === undefined ? base.length : base.findIndex((column) => column.name === before);
  const insertion = index === -1 ? base.length : index;
  return [...base.slice(0, insertion), ...inserted, ...base.slice(insertion)];
}

function transferPrimaryKey(
  models: ModelDefinition[], source: ModelDefinition, destination: ModelDefinition, moved: MovedNames, copy: boolean,
): ModelDefinition[] {
  const sourcePk = primaryKey(source);
  const movedPk = sourcePk?.columns.filter((column) => moved.selected.has(column)) ?? [];
  if (movedPk.length === 0 || sourcePk === undefined) return models;
  const destinationPk = primaryKey(destination);
  const destinationMode = destinationPk?.virtual ?? sourcePk.virtual;
  const destinationUnique = destinationPk?.uniqueTest ?? sourcePk.uniqueTest;
  const added = movedPk.map((column) => moved.names.get(column) ?? column);
  let next = models;
  if (!copy) {
    const remaining = sourcePk.columns.filter((column) => !moved.selected.has(column));
    next = replaceModel(next, source.name, (model) =>
      setPrimaryKeyOnModel(model, remaining, sourcePk.virtual, sourcePk.uniqueTest));
  }
  if (destinationMode) {
    next = replaceModel(next, destination.name, (model) => stripNotNull(model, new Set(added)));
  }
  const destinationColumns = [...(destinationPk?.columns ?? []), ...added];
  return replaceModel(next, destination.name, (model) =>
    setPrimaryKeyOnModel(model, destinationColumns, destinationMode, destinationUnique));
}

function primaryKey(model: ModelDefinition): PrimaryKeyState | undefined {
  const virtual = readVirtualConstraints(model).primaryKey;
  if (virtual !== undefined) return { columns: virtual.columns, virtual: true, uniqueTest: false };
  const real = (model.constraints ?? []).find((constraint) => constraint.type === 'primary_key');
  return real === undefined ? undefined : {
    columns: real.columns ?? [], virtual: false, uniqueTest: hasUniqueCombinationTest(model),
  };
}

function transformForeignKeys(
  current: ModelDefinition[], original: ModelDefinition[], source: string, destination: string, moved: MovedNames,
): ModelDefinition[] {
  const existingNames = new Map(original.map((model) => [
    model.name,
    new Set((model.constraints ?? []).map((constraint) => constraint.name).filter((name): name is string => name !== undefined)),
  ]));
  let next: ModelDefinition[] = current.map((model): ModelDefinition => ({
    ...model,
    constraints: model.constraints?.filter((constraint) => constraint.type !== 'foreign_key'),
  }));
  next = next.map((model) => writeVirtualConstraints(model, {
    ...readVirtualConstraints(model), foreignKeys: undefined,
  }));
  for (const owner of original) {
    for (const constraint of owner.constraints ?? []) {
      if (constraint.type !== 'foreign_key') continue;
      const target = constraint.to === undefined ? null : parseRef(constraint.to)?.name ?? null;
      if (target === null) {
        next = appendReal(next, owner.name, constraint);
        continue;
      }
      next = appendTransformed(next, owner.name, target, constraint.columns ?? [], constraint.toColumns ?? [], source, destination, moved, constraint, existingNames);
    }
    for (const fk of readVirtualConstraints(owner).foreignKeys ?? []) {
      const target = parseRef(fk.to)?.name ?? null;
      if (target === null) {
        next = appendVirtual(next, owner.name, fk);
        continue;
      }
      next = appendTransformed(next, owner.name, target, fk.columns, fk.toColumns, source, destination, moved, fk, existingNames);
    }
  }
  return next;
}

function appendTransformed(
  models: ModelDefinition[], owner: string, target: string, columns: string[], toColumns: string[],
  source: string, destination: string, moved: MovedNames, original: ModelConstraint | VirtualForeignKey,
  existingNames: ReadonlyMap<string, ReadonlySet<string>>,
): ModelDefinition[] {
  const groups = new Map<string, ForeignKeyPair[]>();
  for (let index = 0; index < Math.min(columns.length, toColumns.length); index += 1) {
    const ownerMoved = owner === source && moved.selected.has(columns[index]);
    const targetMoved = target === source && moved.selected.has(toColumns[index]);
    const pair = {
      owner: ownerMoved ? destination : owner,
      source: ownerMoved ? moved.names.get(columns[index]) ?? columns[index] : columns[index],
      target: targetMoved ? destination : target,
      targetColumn: targetMoved ? moved.names.get(toColumns[index]) ?? toColumns[index] : toColumns[index],
    };
    const key = `${pair.owner}\0${pair.target}`;
    groups.set(key, [...(groups.get(key) ?? []), pair]);
  }
  if (groups.size === 0) return models;
  let next = models;
  for (const pairs of groups.values()) {
    const whole = groups.size === 1;
    const unchangedGroup = pairs[0].owner === owner && pairs[0].target === target;
    const to = pairs[0].target === target ? original.to ?? `ref('${target}')` : `ref('${pairs[0].target}')`;
    if ('type' in original) {
      const candidate: ModelConstraint = {
        ...original,
        columns: pairs.map((pair) => pair.source),
        to,
        toColumns: pairs.map((pair) => pair.targetColumn),
      };
      if (!whole && !unchangedGroup) delete candidate.name;
      if (whole && pairs[0].owner !== owner && candidate.name !== undefined && existingNames.get(pairs[0].owner)?.has(candidate.name)) {
        delete candidate.name;
      }
      next = appendReal(next, pairs[0].owner, candidate);
    } else {
      next = appendVirtual(next, pairs[0].owner, {
        to, columns: pairs.map((pair) => pair.source), toColumns: pairs.map((pair) => pair.targetColumn),
      });
    }
  }
  return next;
}

function appendReal(models: ModelDefinition[], owner: string, constraint: ModelConstraint): ModelDefinition[] {
  return replaceModel(models, owner, (model) => {
    let entry = constraint;
    if (entry.name !== undefined && (model.constraints ?? []).some((item) => item.name === entry.name)) {
      const { name: _name, ...unnamed } = entry;
      entry = unnamed;
    }
    return { ...model, constraints: [...(model.constraints ?? []), entry] };
  });
}

function appendVirtual(models: ModelDefinition[], owner: string, fk: VirtualForeignKey): ModelDefinition[] {
  return replaceModel(models, owner, (model) => {
    const block = readVirtualConstraints(model);
    return writeVirtualConstraints(model, { ...block, foreignKeys: [...(block.foreignKeys ?? []), fk] });
  });
}

function stripNotNull(model: ModelDefinition, columns: ReadonlySet<string>): ModelDefinition {
  return { ...model, columns: (model.columns ?? []).map((column) => {
    if (!columns.has(column.name) || column.dataTests === undefined) return column;
    const dataTests = column.dataTests.filter((entry) => !isNotNull(entry));
    const { dataTests: _old, ...rest } = column;
    return dataTests.length === 0 ? rest : { ...rest, dataTests };
  }) };
}

function isNotNull(entry: DataTestEntry): boolean {
  return entry === 'not_null' || (isRecord(entry) && 'not_null' in entry);
}

function cloneColumn(column: ModelColumn): ModelColumn {
  return cloneValue(column) as ModelColumn;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  return value;
}

function requireModel(models: ModelDefinition[], name: string): ModelDefinition {
  const model = models.find((candidate) => candidate.name === name);
  if (model === undefined) throw new EditError(`No model named "${name}" exists in the workspace`);
  return model;
}

function replaceModel(
  models: ModelDefinition[], name: string, update: (model: ModelDefinition) => ModelDefinition,
): ModelDefinition[] {
  return models.map((model) => model.name === name ? update(model) : model);
}
