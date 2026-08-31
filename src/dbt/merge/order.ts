/**
 * Key-insertion ordering for the surgical write-back (spec 29). Pure logic —
 * MUST NOT import `vscode`.
 *
 * These orders are consulted **only when a key has to be created**. Keys that
 * already exist on disk are never reordered.
 */

export interface KeyOrder {
  /** Keys in their canonical relative order. */
  readonly preferred: readonly string[];
  /** Keys pinned to the end of the mapping. */
  readonly last: readonly string[];
}

export const MODEL_KEY_ORDER: KeyOrder = {
  preferred: ['name', 'description', 'data_tests', 'constraints'],
  last: ['columns'],
};

export const COLUMN_KEY_ORDER: KeyOrder = {
  preferred: ['name', 'data_type', 'description', 'config'],
  last: [],
};

/** Used everywhere else: new keys are simply appended. */
export const FREE_KEY_ORDER: KeyOrder = { preferred: [], last: [] };

/**
 * Index at which `key` should be inserted into a mapping whose current keys
 * are `existing`, honouring `order` (spec 29, "Ordering").
 */
export function insertionIndex(
  existing: readonly string[],
  key: string,
  order: KeyOrder,
): number {
  if (order.last.includes(key)) {
    return existing.length;
  }

  const rank = order.preferred.indexOf(key);
  if (rank >= 0) {
    // Immediately after the last existing key that precedes `key`.
    for (let i = existing.length - 1; i >= 0; i -= 1) {
      const r = order.preferred.indexOf(existing[i]);
      if (r >= 0 && r < rank) {
        return i + 1;
      }
    }
    // Otherwise immediately before the first existing key that follows it.
    for (let i = 0; i < existing.length; i += 1) {
      const r = order.preferred.indexOf(existing[i]);
      if (r > rank) {
        return i;
      }
    }
  }

  return beforePinnedTail(existing, order);
}

/** Position of the first existing key pinned to the tail, else the end. */
function beforePinnedTail(existing: readonly string[], order: KeyOrder): number {
  for (let i = 0; i < existing.length; i += 1) {
    if (order.last.includes(existing[i])) {
      return i;
    }
  }
  return existing.length;
}
