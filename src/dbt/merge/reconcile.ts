/**
 * The recursive YAML node reconciler behind the surgical write-back (spec 29).
 * Pure logic — MUST NOT import `vscode`.
 *
 * The guiding rule: a node that already matches the desired state is left
 * completely untouched, which is what preserves comments, blank lines, quoting
 * and key order. Only nodes that genuinely differ are mutated, and a key is
 * removed only when the policy explicitly allows it.
 */
import { Pair, Scalar, YAMLMap, YAMLSeq, isMap, isPair, isScalar, isSeq } from 'yaml';
import { insertionIndex, type KeyOrder } from './order';

export interface MergePolicy {
  /**
   * Keys this level may delete when absent from `desired`, each mapped to the
   * on-disk value shape the editor understands. A key whose current value has
   * a different shape is never deleted.
   */
  deletable: ReadonlyMap<string, ManagedShape> | 'all';
  /** Ordering used when a key must be created at this level. */
  order: KeyOrder;
  /** Policy for a child value, by key (maps) or by index (sequences). */
  child(key: string | number): MergePolicy;
}

/** The value shapes `parseModelYml` recognizes for a managed key. */
export type ManagedShape = 'string' | 'sequence' | 'mapping';

/** Reconciles `desired` into the YAML node `node` in place. */
export function reconcileNode(node: unknown, desired: unknown, policy: MergePolicy): void {
  if (isMap(node) && isPlainObject(desired)) {
    reconcileMap(node, desired, policy);
    return;
  }
  if (isSeq(node) && Array.isArray(desired)) {
    reconcileSeq(node, desired, policy);
  }
  // Anything else is handled by the parent, which can replace the value node.
}

function reconcileMap(
  node: YAMLMap,
  desired: Record<string, unknown>,
  policy: MergePolicy,
): void {
  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;

    const pair = findPair(node, key);
    if (pair === undefined) {
      const index = insertionIndex(mapKeys(node), key, policy.order);
      node.items.splice(index, 0, new Pair(key, value));
      continue;
    }

    if (deepEqual(toPlain(pair.value), value)) continue;
    pair.value = mergeValue(pair.value, value, policy.child(key));
  }

  if (policy.deletable === 'all') {
    node.items = node.items.filter((item) => {
      const key = pairKey(item);
      return key === undefined || hasDefined(desired, key);
    });
    return;
  }

  const deletable = policy.deletable;
  node.items = node.items.filter((item) => {
    const key = pairKey(item);
    if (key === undefined || hasDefined(desired, key)) return true;

    const shape = deletable.get(key);
    if (shape === undefined) return true;

    // `parseModelYml` ignores a managed key whose value has an unexpected
    // shape (e.g. a scalar `meta:`), so it never reaches the desired state.
    // Absence there means "the editor cannot read it", not "delete it".
    return !matchesShape(isPair(item) ? item.value : undefined, shape);
  });
}

/** Whether a value node has the shape the parser recognizes for a managed key. */
function matchesShape(value: unknown, shape: ManagedShape): boolean {
  switch (shape) {
    case 'string':
      return isScalar(value) && typeof value.value === 'string';
    case 'sequence':
      return isSeq(value);
    case 'mapping':
      return isMap(value);
  }
}

function reconcileSeq(
  node: YAMLSeq,
  desired: readonly unknown[],
  policy: MergePolicy,
): void {
  for (let i = 0; i < desired.length; i += 1) {
    if (i >= node.items.length) {
      node.items.push(desired[i]);
      continue;
    }
    if (deepEqual(toPlain(node.items[i]), desired[i])) continue;
    node.items[i] = mergeValue(node.items[i], desired[i], policy.child(i));
  }
  if (node.items.length > desired.length) {
    node.items.length = desired.length;
  }
}

/**
 * Returns the node that should replace `current`: either `current` itself,
 * mutated in place, or a brand-new value when the kinds are incompatible.
 */
function mergeValue(current: unknown, desired: unknown, policy: MergePolicy): unknown {
  if (isMap(current) && isPlainObject(desired)) {
    reconcileMap(current, desired, policy);
    return current;
  }
  if (isSeq(current) && Array.isArray(desired)) {
    reconcileSeq(current, desired, policy);
    return current;
  }
  if (isScalar(current) && isScalarValue(desired)) {
    current.value = desired;
    if (typeof desired === 'string' && desired.includes('\n') && isFlatStyle(current.type)) {
      // A plain/quoted style cannot represent a multi-line value; let `yaml`
      // pick a valid representation instead.
      current.type = undefined;
    }
    return current;
  }
  return desired;
}

function isFlatStyle(type: Scalar['type']): boolean {
  return type === Scalar.PLAIN || type === Scalar.QUOTE_SINGLE || type === Scalar.QUOTE_DOUBLE;
}

function isScalarValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

// -- map helpers -------------------------------------------------------------

function pairKey(item: unknown): string | undefined {
  if (!isPair(item)) return undefined;
  const key = item.key;
  if (isScalar(key) && (typeof key.value === 'string' || typeof key.value === 'number')) {
    return String(key.value);
  }
  if (typeof key === 'string' || typeof key === 'number') return String(key);
  return undefined;
}

function findPair(node: { items: unknown[] }, key: string): Pair | undefined {
  for (const item of node.items) {
    if (isPair(item) && pairKey(item) === key) return item;
  }
  return undefined;
}

function mapKeys(node: { items: unknown[] }): string[] {
  const keys: string[] = [];
  for (const item of node.items) {
    const key = pairKey(item);
    if (key !== undefined) keys.push(key);
  }
  return keys;
}

function hasDefined(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

/** Plain-JS view of a YAML node (or of an already-plain value). */
function toPlain(value: unknown): unknown {
  if (isMap(value) || isSeq(value) || isScalar(value)) {
    return value.toJSON() as unknown;
  }
  return value;
}

/**
 * Deep equality where `undefined` and a missing key are identical, plain
 * objects compare key-by-key ignoring key order, and arrays index-by-index.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = definedKeys(a);
    const keysB = definedKeys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => hasDefined(b, key) && deepEqual(a[key], b[key]));
  }

  return false;
}

function definedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
