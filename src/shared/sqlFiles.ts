/**
 * Pure derivation helpers for discovering a dbt model's `.sql` file (spec 38).
 * Shared by both sides — MUST NOT import `vscode`.
 */

/** Fallback discovery glob when the model glob has no recognisable YAML tail. */
export const DEFAULT_SQL_GLOB = '**/models/**/*.sql';

/**
 * The `.sql` discovery glob implied by a model.yml glob: a trailing `.yml` or
 * `.yaml` (case-insensitive) is replaced by `.sql`, so
 * `**\/models/**\/*.yml` becomes `**\/models/**\/*.sql`. Any other shape falls
 * back to `DEFAULT_SQL_GLOB`.
 */
export function sqlGlobForModelGlob(modelGlob: string): string {
  const match = /\.ya?ml$/i.exec(modelGlob);
  if (match === null) {
    return DEFAULT_SQL_GLOB;
  }
  return modelGlob.slice(0, match.index) + '.sql';
}

/**
 * The dbt model name a `.sql` path implements: its base name without the
 * `.sql` extension. Handles both `/` and `\` separators. Returns `null` when
 * the path does not end in `.sql` (case-insensitive) or has an empty base name.
 */
export function modelNameFromSqlPath(fsPath: string): string | null {
  const match = /\.sql$/i.exec(fsPath);
  if (match === null) {
    return null;
  }
  const withoutExt = fsPath.slice(0, match.index);
  const parts = withoutExt.split(/[\\/]/);
  const base = parts[parts.length - 1];
  if (base === undefined || base.length === 0) {
    return null;
  }
  return base;
}

/**
 * Index of model name -> `.sql` fs path. Paths are consumed in order and the
 * FIRST path for a given model name wins, matching how `openModelSource`
 * resolves duplicate model names. Paths that are not `.sql` files are skipped.
 */
export function indexSqlPaths(paths: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const name = modelNameFromSqlPath(path);
    if (name === null || index.has(name)) {
      continue;
    }
    index.set(name, path);
  }
  return index;
}
