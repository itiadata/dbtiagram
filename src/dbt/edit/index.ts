/**
 * Edit operations on the in-memory model set. Pure logic — MUST NOT import `vscode`.
 * This module is the single funnel through which every webview mutation is
 * applied before being persisted by the wrappers in `src/vscode/`.
 *
 * This file is the package's public surface: it owns only the `applyEdit`
 * dispatcher and re-exports the types. Each edit kind is implemented in a
 * sibling module (`model`, `column`, `primaryKey`, `foreignKey`) sharing the
 * primitives in `internal`.
 */
import { ApplyEditResult, EditError, mapModel } from './internal';
import { ModelEdit } from './types';
import { applyDescription, renameModel } from './model';
import { renameColumn, setColumnDataType, setColumnDescription } from './column';
import { dedupeTrimmed, setPrimaryKeyOnModel } from './primaryKey';
import {
  applyForeignKeyColumns,
  applyForeignKeyTarget,
  createForeignKey,
  removeFkFromModel,
  setFkVirtualOnModel,
} from './foreignKey';
import type { ModelDefinition } from '../types';

export { EditError };
export type { ApplyEditResult, ModelEdit };

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
      return mapModel(models, edit.model, (m) => applyDescription(m, edit.description));
    case 'setColumnName': {
      const name = edit.name.trim();
      if (name.length === 0) throw new EditError('Column name must not be empty');
      return renameColumn(models, edit.model, edit.column, name);
    }
    case 'setColumnDataType':
      return mapModel(models, edit.model, (m) =>
        setColumnDataType(m, edit.column, edit.dataType),
      );
    case 'setColumnDescription':
      return mapModel(models, edit.model, (m) =>
        setColumnDescription(m, edit.column, edit.description),
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
    case 'createForeignKey':
      return createForeignKey(
        models,
        edit.model,
        edit.target,
        edit.columns,
        edit.toColumns,
        edit.virtual,
      );
    case 'removeForeignKey':
      return mapModel(models, edit.model, (m) => removeFkFromModel(m, edit.fk));
  }
}
