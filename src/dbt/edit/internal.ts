/**
 * Shared primitives for the edit handlers. Pure logic — MUST NOT import `vscode`.
 *
 * Lives apart from `index.ts` so handler modules can depend on it without
 * importing the dispatcher (which imports them), avoiding an import cycle.
 */
import type { ModelDefinition } from '../types';

export class EditError extends Error {}

export interface ApplyEditResult {
  models: ModelDefinition[];
  changed: boolean;
}

/** Maps a single named model; throws if the model does not exist. */
export function mapModel(
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

/** Whitespace-only values clear the key: `undefined` makes the serializer omit it. */
export function blankToUndefined(value: string): string | undefined {
  return value.trim().length === 0 ? undefined : value;
}

/** Maps a string array renaming `oldName` → `newName`; identity-preserving. */
export function mapNames(names: string[], oldName: string, newName: string): string[] {
  if (newName === oldName || !names.includes(oldName)) return names;
  return names.map((n) => (n === oldName ? newName : n));
}

export function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
