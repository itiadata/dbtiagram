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
