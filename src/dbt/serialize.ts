/**
 * Serialization of dbt `model.yml` files. Pure logic — MUST NOT import `vscode`.
 *
 * Domain objects use camelCase internally; dbt expects snake_case keys on disk
 * (e.g. `dataType` -> `data_type`). This module converts before stringifying so
 * the round trip parse -> edit -> serialize -> parse is lossless.
 */
import { stringify } from 'yaml';
import type { ModelColumn, ModelDefinition, ModelYmlFile } from './types';

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
    name: model.name,
    ...(model.description !== undefined ? { description: model.description } : {}),
    ...(model.config !== undefined ? { config: model.config } : {}),
    ...(model.columns !== undefined ? { columns: model.columns.map(toDbtColumn) } : {}),
    ...(model.refs !== undefined ? { refs: model.refs } : {}),
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
