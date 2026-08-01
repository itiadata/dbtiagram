/**
 * Helpers for the `config.meta.dbtiagram.virtual` block that stores virtual
 * (unenforced) primary and foreign keys (spec 08). Pure logic — MUST NOT
 * import `vscode`.
 *
 * Virtual definitions live in the model's `config > meta > dbtiagram > virtual`
 * block — a `dbtiagram`-namespaced key so user meta never collides — and write
 * no constraints/data_tests. When the block becomes empty the `dbtiagram`,
 * `meta`, and `config` keys are removed (no empty scaffolding left behind).
 */
import type {
  ModelConfig,
  ModelDefinition,
  VirtualConstraintsBlock,
  VirtualForeignKey,
  VirtualPrimaryKey,
} from './types';

/** The meta key under which the dbtiagram block lives inside `config.meta`. */
const DBTIAGRAM_KEY = 'dbtiagram';
/** The meta key under which virtual constraints live inside the dbtiagram block. */
const VIRTUAL_KEY = 'virtual';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the virtual constraints block from a model. Returns a fresh block
 * (callers never mutate shared records); missing or malformed values are
 * ignored and default to an empty block. An empty virtual PK (`primary_key`
 * with no usable columns) reads as absent — the write side never emits one.
 */
export function readVirtualConstraints(model: ModelDefinition): VirtualConstraintsBlock {
  const meta = model.config?.meta;
  const dbtiagram = isRecord(meta) ? meta[DBTIAGRAM_KEY] : undefined;
  const block = isRecord(dbtiagram) ? dbtiagram[VIRTUAL_KEY] : undefined;
  if (!isRecord(block)) return {};

  const out: VirtualConstraintsBlock = {};
  const primaryKey = readPrimaryKey(block.primary_key);
  if (primaryKey !== undefined) out.primaryKey = primaryKey;
  const foreignKeys = readForeignKeys(block.foreign_keys);
  if (foreignKeys !== undefined) out.foreignKeys = foreignKeys;
  return out;
}

function readPrimaryKey(raw: unknown): VirtualPrimaryKey | undefined {
  if (!isRecord(raw)) return undefined;
  const columns = stringArray(raw.columns);
  if (columns.length === 0) return undefined;
  return { columns };
}

function readForeignKeys(raw: unknown): VirtualForeignKey[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fks: VirtualForeignKey[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const to = entry.to;
    if (typeof to !== 'string') continue;
    // Empty column arrays are legal: they describe a table-level FK.
    fks.push({
      to,
      columns: stringArray(entry.columns),
      toColumns: stringArray(entry.to_columns),
    });
  }
  return fks.length > 0 ? fks : undefined;
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Writes a virtual constraints block into a copy of the model, building the
 * YAML-shaped value (`virtual.primary_key.columns`, `virtual.foreign_keys[].{
 * to, columns, to_columns}`). An empty block deletes the `dbtiagram` key (and
 * prunes `meta`/`config` when they become empty). Returns the original model
 * object when nothing changed, preserving identity for
 * `distributeEditedModels` (spec 06).
 */
export function writeVirtualConstraints(
  model: ModelDefinition,
  block: VirtualConstraintsBlock,
): ModelDefinition {
  if (blocksEqual(readVirtualConstraints(model), block)) return model;

  const virtual: Record<string, unknown> = {};
  if (block.primaryKey !== undefined && block.primaryKey.columns.length > 0) {
    virtual.primary_key = { columns: [...block.primaryKey.columns] };
  }
  if (block.foreignKeys !== undefined && block.foreignKeys.length > 0) {
    virtual.foreign_keys = block.foreignKeys.map((fk) => ({
      to: fk.to,
      columns: [...fk.columns],
      to_columns: [...fk.toColumns],
    }));
  }

  const config = applyVirtualBlock(model.config, Object.keys(virtual).length > 0 ? virtual : undefined);
  if (config === undefined && model.config === undefined) return model;
  return { ...model, config };
}

/**
 * Returns a new `ModelConfig` with the virtual block written (or removed).
 * `undefined` config keys are pruned: when the block empties, `dbtiagram` is
 * deleted, then `meta`, then `config` itself.
 */
function applyVirtualBlock(
  config: ModelConfig | undefined,
  virtual: Record<string, unknown> | undefined,
): ModelConfig | undefined {
  const base: ModelConfig = config === undefined ? {} : { ...config };
  const meta = isRecord(base.meta) ? { ...(base.meta as Record<string, unknown>) } : undefined;

  if (virtual === undefined) {
    if (meta === undefined) return Object.keys(base).length > 0 ? base : undefined;
    const dbtiagram = isRecord(meta[DBTIAGRAM_KEY])
      ? { ...(meta[DBTIAGRAM_KEY] as Record<string, unknown>) }
      : undefined;
    if (dbtiagram !== undefined) {
      delete dbtiagram[VIRTUAL_KEY];
      if (Object.keys(dbtiagram).length === 0) delete meta[DBTIAGRAM_KEY];
      else meta[DBTIAGRAM_KEY] = dbtiagram;
    }
    if (Object.keys(meta).length === 0) delete base.meta;
    else base.meta = meta;
    return Object.keys(base).length > 0 ? base : undefined;
  }

  const nextMeta = meta ?? {};
  const dbtiagram = isRecord(nextMeta[DBTIAGRAM_KEY])
    ? { ...(nextMeta[DBTIAGRAM_KEY] as Record<string, unknown>) }
    : {};
  dbtiagram[VIRTUAL_KEY] = virtual;
  nextMeta[DBTIAGRAM_KEY] = dbtiagram;
  base.meta = nextMeta;
  return base;
}

/** Structural equality of two blocks (identity-safe no-op detection). */
function blocksEqual(a: VirtualConstraintsBlock, b: VirtualConstraintsBlock): boolean {
  const aPk = a.primaryKey;
  const bPk = b.primaryKey;
  if (aPk === undefined || bPk === undefined) {
    if (aPk !== bPk) return false;
  } else if (!arraysEqual(aPk.columns, bPk.columns)) {
    return false;
  }

  const aFks = a.foreignKeys ?? [];
  const bFks = b.foreignKeys ?? [];
  if (aFks.length !== bFks.length) return false;
  return aFks.every((fk, index) => {
    const other = bFks[index];
    return (
      fk.to === other.to &&
      arraysEqual(fk.columns, other.columns) &&
      arraysEqual(fk.toColumns, other.toColumns)
    );
  });
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
