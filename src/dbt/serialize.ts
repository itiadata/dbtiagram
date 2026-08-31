/**
 * Serialization of dbt `model.yml` files. Pure logic — MUST NOT import `vscode`.
 *
 * Domain objects use camelCase internally; dbt expects snake_case keys on disk
 * (e.g. `dataType` -> `data_type`). The camelCase -> snake_case mapping lives in
 * `./merge/shape` so this full serializer and the surgical merge (spec 29)
 * share one representation.
 *
 * This is the fallback write path: it regenerates the whole file and therefore
 * drops comments and on-disk key order. `mergeModelYml` is preferred.
 */
import { stringify } from 'yaml';
import { toDbtShape } from './merge/shape';
import type { ModelYmlFile } from './types';

/** Serializes a `ModelYmlFile` into dbt-compatible YAML text. */
export function serializeModelYml(file: ModelYmlFile): string {
  return stringify(toDbtShape(file));
}