/**
 * Edit operations on the in-memory model set. Pure logic — MUST NOT import `vscode`.
 * This module is the single funnel through which every webview mutation is
 * applied before being persisted by the wrappers in `src/vscode/`.
 */
import type { ModelColumn, ModelDefinition } from './types';

export type ModelEdit =
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'addColumn'; model: string; column: ModelColumn }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string };

export class EditError extends Error {}

export interface ApplyEditResult {
  models: ModelDefinition[];
  changed: boolean;
}

/** Applies a single `ModelEdit` to a copy of the model set. */
export function applyEdit(models: ModelDefinition[], edit: ModelEdit): ApplyEditResult {
  switch (edit.kind) {
    case 'setModelDescription':
      return mapModel(models, edit.model, (m) => ({ ...m, description: edit.description }));
    case 'addColumn': {
      return mapModel(models, edit.model, (m) => {
        const columns = m.columns ?? [];
        const name = edit.column.name.trim();
        if (name.length === 0) throw new EditError('Column name must not be empty');
        if (columns.some((c) => c.name === name)) {
          throw new EditError(`Model "${m.name}" already has a column named "${name}"`);
        }
        return { ...m, columns: [...columns, edit.column] };
      });
    }
    case 'setColumnDescription': {
      return mapModel(models, edit.model, (m) => {
        const columns = m.columns ?? [];
        if (!columns.some((c) => c.name === edit.column)) {
          throw new EditError(`Model "${m.name}" has no column named "${edit.column}"`);
        }
        return {
          ...m,
          columns: columns.map((c) =>
            c.name === edit.column ? { ...c, description: edit.description } : c,
          ),
        };
      });
    }
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
