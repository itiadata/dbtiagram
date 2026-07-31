/**
 * Pure, VS Code-style file label computation. MUST NOT import `vscode`.
 *
 * Reproduces the disambiguation users know from VS Code tabs/quick-open for a
 * list of model.yml paths (spec 05): when every basename is unique the label is
 * the bare file name; when two or more files share a basename the label grows
 * into the shortest path suffix (folders included) that still tells them apart,
 * e.g. `orders.yml` vs `archive/orders.yml`. No external library is needed —
 * VS Code's own `getBaseLabel` lives inside the `vscode` bundle and is not a
 * publishable npm package.
 */
export type FileLabelMap = Map<string, string>;

/**
 * Returns `path -> display label` for every input path, in input order.
 *
 * @param paths Absolute (or workspace-relative) file-system paths. Windows
 *   backslashes are normalized to `/` internally; the returned map is keyed by
 *   the original strings so callers can look up by fsPath.
 * @param root The workspace root to compute relative paths against. When
 *   omitted, the longest common directory prefix of all paths is used.
 */
export function disambiguateFileLabels(
  paths: readonly string[],
  root?: string,
): FileLabelMap {
  const labels: FileLabelMap = new Map();
  if (paths.length === 0) return labels;

  const normalized = paths.map(normalizePath);
  const effectiveRoot =
    root === undefined ? commonRoot(normalized) : normalizePath(root);

  // Group indices by basename so labels only change inside groups that
  // actually collide.
  const byBasename = new Map<string, number[]>();
  normalized.forEach((path, index) => {
    const base = basename(path);
    const group = byBasename.get(base);
    if (group === undefined) byBasename.set(base, [index]);
    else group.push(index);
  });

  for (const [base, indices] of byBasename) {
    if (indices.length === 1) {
      labels.set(paths[indices[0]], base);
      continue;
    }
    const rels = indices.map((index) => {
      const rel = relativeTo(effectiveRoot, normalized[index]);
      return rel === '' ? base : rel;
    });
    const suffixes = shortestUniqueSuffixes(rels);
    indices.forEach((index, k) => labels.set(paths[index], suffixes[k]));
  }

  return labels;
}

/** Normalizes `\` to `/` so Windows fsPaths behave on every platform. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Last path segment (the file name). */
function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Longest common directory prefix of all paths, trimmed to a directory
 * boundary, or `''` when the paths share no directory.
 */
function commonRoot(paths: readonly string[]): string {
  let prefix = paths[0];
  for (const path of paths.slice(1)) {
    while (prefix !== '' && !path.startsWith(prefix)) {
      const idx = prefix.lastIndexOf('/');
      prefix = idx <= 0 ? '' : prefix.slice(0, idx);
    }
  }
  if (prefix === '') return '';
  const idx = prefix.lastIndexOf('/');
  return idx > 0 ? prefix.slice(0, idx) : prefix;
}

/**
 * `path` relative to `root`, with the leading separator stripped. Returns the
 * full path when `path` is not under `root` (e.g. another workspace root in a
 * multi-root workspace) so the caller still gets a unique, readable label.
 */
function relativeTo(root: string, path: string): string {
  if (root === '' || path === root) return path === root ? '' : path;
  if (path.startsWith(root + '/')) return path.slice(root.length + 1);
  return path;
}

/**
 * For each relative path, the shortest suffix of path segments (from the end)
 * that is unique across the group. Collision-free at full length, so the loop
 * always terminates; the final fallback is purely defensive.
 */
function shortestUniqueSuffixes(rels: readonly string[]): string[] {
  const segmented = rels.map((rel) => rel.split('/'));
  const maxDepth = segmented.reduce((max, segments) => Math.max(max, segments.length), 0);

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const candidates = segmented.map((segments) =>
      segments.slice(Math.max(0, segments.length - depth)).join('/'),
    );
    if (new Set(candidates).size === candidates.length) return candidates;
  }

  return [...rels];
}
