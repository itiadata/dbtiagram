/**
 * Parsing of dbt `ref()` references used in constraint `to` values.
 * Pure logic — MUST NOT import `vscode`.
 */

export interface RefTarget {
  /** Optional package name from a two-argument ref. */
  package?: string;
  /** The referenced model name. */
  name: string;
}

// Matches `ref(<arg>)` or `ref(<arg>, <arg>)` where each arg is a single- or
// double-quoted string. Captures: 2/3 = first arg (single/double quoted),
// 5/6 = second arg (single/double quoted).
const REF_CALL =
  /^ref\(\s*('([^']*)'|"([^"]*)")\s*(?:,\s*('([^']*)'|"([^"]*)")\s*)?\)$/;

/**
 * Parses a dbt `ref(...)` string such as `ref('s_pp', 'audit_result')` or
 * `ref("orders")` into `{ package, name }`. Returns `null` for anything that
 * is not a well-formed one- or two-argument ref() call.
 */
export function parseRef(input: string): RefTarget | null {
  const match = REF_CALL.exec(input.trim());
  if (match === null) return null;

  const first = match[2] ?? match[3];
  const second = match[5] ?? match[6];

  if (second === undefined) {
    if (first.length === 0) return null;
    return { name: first };
  }

  if (first.length === 0 || second.length === 0) return null;
  return { package: first, name: second };
}

/**
 * Re-points a dbt `ref(...)` string at a new model name, preserving the
 * original quoting and whitespace. Returns the rewritten string when the ref
 * names `oldName`, and `null` when the ref is unparseable or names a
 * different model. For a two-argument ref only the model-name argument (the
 * second) is rewritten — the package argument is never touched, even when it
 * happens to equal `oldName`.
 */
export function renameRefTarget(input: string, oldName: string, newName: string): string | null {
  const trimmed = input.trim();
  const match = REF_CALL.exec(trimmed);
  if (match === null) return null;

  const first = match[2] ?? match[3];
  const second = match[5] ?? match[6];

  if (second === undefined) {
    if (first !== oldName) return null;
    return spliceQuoted(trimmed, match.index, match[0].indexOf(match[1]), match[1], newName);
  }

  if (second !== oldName) return null;
  return spliceQuoted(trimmed, match.index, secondArgStart(match), match[4], newName);
}

/** Replaces one quoted argument segment in a ref string with a new inner value. */
function spliceQuoted(
  input: string,
  matchIndex: number,
  relStart: number,
  quoted: string,
  name: string,
): string {
  const start = matchIndex + relStart;
  return (
    input.slice(0, start) +
    `${quoted[0]}${name}${quoted[quoted.length - 1]}` +
    input.slice(start + quoted.length)
  );
}

/**
 * Relative offset of the second argument's quoted segment inside `match[0]`
 * (used instead of `indexOf` so `ref('a', 'a')` targets the second argument).
 */
function secondArgStart(match: RegExpExecArray): number {
  const full = match[0];
  let pos = full.indexOf(',', full.indexOf(match[1]) + match[1].length) + 1;
  while (pos < full.length && /\s/.test(full[pos])) pos += 1;
  return pos;
}
