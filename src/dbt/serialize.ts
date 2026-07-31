/**
 * Serialization of dbt `model.yml` files. Pure logic — MUST NOT import `vscode`.
 *
 * Domain objects use camelCase internally; dbt expects snake_case keys on disk
 * (e.g. `dataType` -> `data_type`). This module converts before stringifying so
 * the round trip parse -> edit -> serialize -> parse is lossless.
 */
import { stringify } from 'yaml';
import type { ModelColumn, ModelConstraint, ModelDefinition, ModelYmlFile } from './types';

/** Serializes a `ModelYmlFile` into dbt-compatible YAML text. */
export function serializeModelYml(file: ModelYmlFile): string {
  return stringify(toDbtShape(file));
}

function toDbtShape(file: ModelYmlFile): Record<string, unknown> {
  return {
    ...(file.version !== undefined ? { version: file.version } : {}),
    models: file.models.map(toDbtModel),
  };
}

function toDbtModel(model: ModelDefinition): Record<string, unknown> {
  return {
    // Unmodeled keys first so modeled keys keep precedence; ordering against
    // modeled keys is best-effort (see spec 02, section 2).
    ...(model.extra ?? {}),
    name: model.name,
    ...(model.description !== undefined ? { description: model.description } : {}),
    ...(model.config !== undefined ? { config: model.config } : {}),
    ...(model.columns !== undefined ? { columns: model.columns.map(toDbtColumn) } : {}),
    ...(model.constraints !== undefined
      ? { constraints: model.constraints.map(toDbtConstraint) }
      : {}),
    ...(model.meta !== undefined ? { meta: model.meta } : {}),
  };
}

function toDbtColumn(column: ModelColumn): Record<string, unknown> {
  return {
    name: column.name,
    ...(column.dataType !== undefined ? { data_type: column.dataType } : {}),
    ...(column.description !== undefined ? { description: column.description } : {}),
    ...(column.tests !== undefined ? { tests: column.tests } : {}),
    ...(column.meta !== undefined ? { meta: column.meta } : {}),
  };
}

function toDbtConstraint(constraint: ModelConstraint): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(constraint)) {
    switch (key) {
      case 'toColumns':
        out.to_columns = value;
        break;
      case 'warnUnenforced':
        out.warn_unenforced = value;
        break;
      case 'errorIf':
        out.error_if = value;
        break;
      default:
        out[key] = value;
    }
  }
  return out;
}
