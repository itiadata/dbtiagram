/**
 * Minimal glob matcher for filtering model.yml paths. Pure — MUST NOT import
 * `vscode`.
 *
 * Supports the subset of VS Code glob syntax actually used by
 * `dbtiagram.modelFileGlob` and similar patterns:
 *
 *   `*`     any run of non-slash characters
 *   `?`     exactly one non-slash character
 *   `**`    any characters including the separator; a `**` directly followed
 *           by a separator also matches zero path segments
 *   `{a,b}` alternation of comma-separated literals
 *   `[abc]` / `[a-z]` character classes (leading `!` negates)
 *
 * Everything else matches literally. Path separators are normalized to `/`
 * first, so Windows `fsPath` values (backslash separators) match patterns that
 * use `/` (spec 04).
 */

/** Normalizes a file-system path to forward slashes for glob matching. */
export function normalizePathForGlob(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

/** Compiles a glob pattern to a regex. Throws if the glob is malformed. */
export function globToRegExp(glob: string): RegExp {
  let source = '^';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          // `**/` matches zero or more path segments.
          source += '(?:[^/]*/)*';
          i += 3;
        } else {
          // Bare `**` matches across separators.
          source += '.*';
          i += 2;
        }
        continue;
      }
      source += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      source += '[^/]';
      i += 1;
    } else if (ch === '{') {
      const end = glob.indexOf('}', i + 1);
      if (end === -1) {
        source += '\\{';
        i += 1;
        continue;
      }
      const alternatives = glob
        .slice(i + 1, end)
        .split(',')
        .map((alternative) => escapeRegExp(alternative));
      source += `(?:${alternatives.join('|')})`;
      i = end + 1;
    } else if (ch === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) {
        source += '\\[';
        i += 1;
        continue;
      }
      let charClass = glob.slice(i + 1, end);
      if (charClass.startsWith('!')) {
        charClass = `^${charClass.slice(1)}`;
      }
      source += `[${charClass}]`;
      i = end + 1;
    } else if (ch === '\\' && i + 1 < glob.length) {
      source += escapeRegExp(glob[i + 1]);
      i += 2;
    } else {
      source += escapeRegExp(ch);
      i += 1;
    }
  }
  source += '$';
  return new RegExp(source);
}

/** Whether `inputPath` matches `glob` (path separators normalized). */
export function matchesGlob(inputPath: string, glob: string): boolean {
  return globToRegExp(glob).test(normalizePathForGlob(inputPath));
}

/** Escapes every regex metacharacter (keeps the string literal). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
