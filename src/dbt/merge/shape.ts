/**
 * Converts a `ModelYmlFile` into the plain, dbt-shaped (snake_case) object that
 * is written to disk. Pure logic — MUST NOT import `vscode`.
 *
 * Both the full serializer (`src/dbt/serialize.ts`) and the surgical merge
 * (`src/dbt/merge/index.ts`) use this single representation so the two write
 * paths cannot drift (spec 29).
 */
import type { ModelColumn, ModelConstraint, ModelDefinition, ModelYmlFile } from '../types';

export function toDbtShape(file: ModelYmlFile): Record<string, unknown> {
  return {
    ...(file.version !== undefined ? { version: file.version } : {}),
    models: file.models.map(toDbtModel),
  };
}

export function toDbtModel(model: ModelDefinition): Record<string, unknown> {
  return {
    // Unmodeled keys first so modeled keys keep precedence; ordering against
    // modeled keys is best-effort (see spec 02, section 2). On the merge path
    // this object's key order is irrelevant — see `order.ts`.
    ...(model.extra ?? {}),
    name: model.name,
    ...(model.description !== undefined ? { description: model.description } : {}),
    ...(model.dataTests !== undefined ? { data_tests: model.dataTests } : {}),
    ...(model.config !== undefined ? { config: model.config } : {}),
    ...(model.columns !== undefined ? { columns: model.columns.map(toDbtColumn) } : {}),
    ...(model.constraints !== undefined
      ? { constraints: model.constraints.map(toDbtConstraint) }
      : {}),
    ...(model.meta !== undefined ? { meta: model.meta } : {}),
  };
}

export function toDbtColumn(column: ModelColumn): Record<string, unknown> {
  return {
    name: column.name,
    ...(column.dataType !== undefined ? { data_type: column.dataType } : {}),
    ...(column.description !== undefined ? { description: column.description } : {}),
    ...(column.tests !== undefined ? { tests: column.tests } : {}),
    ...(column.dataTests !== undefined ? { data_tests: column.dataTests } : {}),
    ...(column.meta !== undefined ? { meta: column.meta } : {}),
  };
}

export function toDbtConstraint(constraint: ModelConstraint): Record<string, unknown> {
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
