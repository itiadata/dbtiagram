import type { ModelEdit } from './edit';
import { EditError, blankToUndefined } from './edit/internal';
import { applyForeignKeyColumns, applyForeignKeyTarget, createForeignKey, removeFkFromModel } from './edit/foreignKey';
import { setPrimaryKeyOnModel } from './edit/primaryKey';
import { formatSourceRef } from './sourceRefs';
import { flattenSourceTables, type SourceDefinition, type SourceTableDefinition } from './sourceTypes';
import type { ModelDefinition } from './types';

export interface ApplySourceEditResult { sources: SourceDefinition[]; changed: boolean }

const readonlyError = (): never => { throw new EditError('This field is read-only in source mode'); };

export function applySourceEdit(sources: SourceDefinition[], edit: ModelEdit): ApplySourceEditResult {
  if (edit.kind === 'setModelName' || edit.kind === 'setColumnName' || edit.kind === 'setColumnDataType' || edit.kind === 'setColumnMeta' || edit.kind === 'setForeignKeyVirtual') return readonlyError();
  const qualified = flattenSourceTables(sources);
  const models: ModelDefinition[] = qualified.map(({ id, table }) => ({ name: id, description: table.description, config: table.config, columns: table.columns }));
  let edited: ModelDefinition[];
  switch (edit.kind) {
    case 'setModelDescription': edited = mapOne(models, edit.model, (model) => ({ ...model, description: blankToUndefined(edit.description) })); break;
    case 'setColumnDescription': edited = mapOne(models, edit.model, (model) => ({ ...model, columns: (model.columns ?? []).map((column) => column.name === edit.column ? { ...column, description: blankToUndefined(edit.description) } : column) })); break;
    case 'setPrimaryKey': edited = mapOne(models, edit.model, (model) => setPrimaryKeyOnModel(model, edit.columns, true, false)); break;
    case 'setForeignKeyTarget': edited = applyForeignKeyTarget(models, edit.model, edit.fk, edit.target, formatSourceRef).models; break;
    case 'setForeignKeyColumns': edited = applyForeignKeyColumns(models, edit.model, edit.fk, edit.columns, edit.toColumns).models; break;
    case 'createForeignKey': edited = createForeignKey(models, edit.model, edit.target, edit.columns, edit.toColumns, true, formatSourceRef).models; break;
    case 'removeForeignKey': edited = mapOne(models, edit.model, (model) => removeFkFromModel(model, edit.fk)); break;
  }
  let offset = 0;
  const next = sources.map((source) => {
    let changed = false;
    const tables = source.tables.map((table): SourceTableDefinition => {
      const model = edited[offset++]; const original = models[offset - 1];
      if (model === original) return table;
      changed = true;
      return { ...table, description: model.description, config: model.config, columns: model.columns };
    });
    return changed ? { ...source, tables } : source;
  });
  return { sources: next, changed: next.some((source, index) => source !== sources[index]) };
}

function mapOne(models: ModelDefinition[], name: string, fn: (model: ModelDefinition) => ModelDefinition): ModelDefinition[] {
  let found = false;
  const next = models.map((model) => { if (model.name !== name) return model; found = true; return fn(model); });
  if (!found) throw new EditError(`No table named "${name}" exists in the workspace`);
  return next;
}
