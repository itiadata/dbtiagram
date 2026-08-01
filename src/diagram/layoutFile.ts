/**
 * Saved diagram layout files (spec 13): parsing, serialization, and application
 * of `*.dbtiagram.yml` documents. Pure logic — MUST NOT import `vscode`.
 *
 * A layout file stores which tables are visible and where they sit. It is
 * completely separate from any `model.yml`: no model/column data is ever kept
 * here.
 */
import { parse, stringify } from 'yaml';
import type { NodePosition } from './positions';

/** File name suffix identifying a saved diagram layout. */
export const LAYOUT_FILE_SUFFIX = '.dbtiagram.yml';

/** Current layout schema version. Unknown versions are rejected. */
export const LAYOUT_VERSION = 1;

/** A visible table and its position on the canvas. */
export interface DiagramLayoutTable {
  name: string;
  x: number;
  y: number;
}

/** The full contents of a saved diagram layout file. */
export interface DiagramLayout {
  version: typeof LAYOUT_VERSION;
  name: string;
  tables: DiagramLayoutTable[];
}

export class DiagramLayoutParseError extends Error {
  public readonly source: string;

  constructor(source: string, message: string) {
    super(message);
    this.name = 'DiagramLayoutParseError';
    this.source = source;
  }
}

/** True when `fsPath` names a saved diagram layout file (case-insensitive). */
export function isLayoutFilePath(fsPath: string | undefined): boolean {
  if (fsPath === undefined || fsPath === '') {
    return false;
  }
  return fsPath.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX);
}

/** The default diagram name for a path: its base name minus the suffix. */
export function defaultLayoutName(fsPath: string): string {
  const base = fsPath.split(/[\\/]/).pop() ?? fsPath;
  return base.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX)
    ? base.slice(0, base.length - LAYOUT_FILE_SUFFIX.length)
    : base;
}

/**
 * Builds a layout from the currently visible tables. Tables are sorted by name
 * and coordinates rounded to integers so repeated writes produce minimal diffs.
 */
export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
): DiagramLayout {
  const tables = visible
    .map((table) => ({
      name: table.name,
      x: Math.round(table.x),
      y: Math.round(table.y),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { version: LAYOUT_VERSION, name, tables };
}

/** Serializes a layout deterministically (fixed key order, sorted tables). */
export function serializeDiagramLayout(layout: DiagramLayout): string {
  return stringify({
    version: layout.version,
    name: layout.name,
    tables: layout.tables.map((table) => ({ name: table.name, x: table.x, y: table.y })),
  });
}

/**
 * Parses layout file text. Throws `DiagramLayoutParseError` with a readable
 * message for malformed YAML, a non-mapping root, a missing or unknown
 * `version`, a non-array `tables`, or an invalid table entry.
 */
export function parseDiagramLayout(text: string, fallbackName: string): DiagramLayout {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new DiagramLayoutParseError(fallbackName, `File is not valid YAML: ${String(err)}`);
  }

  if (!isRecord(raw)) {
    throw new DiagramLayoutParseError(
      fallbackName,
      'Top level of a diagram file must be a YAML mapping',
    );
  }

  if (raw.version !== LAYOUT_VERSION) {
    throw new DiagramLayoutParseError(
      fallbackName,
      `Unsupported diagram version ${String(raw.version)}; expected ${LAYOUT_VERSION}`,
    );
  }

  if (!Array.isArray(raw.tables)) {
    throw new DiagramLayoutParseError(
      fallbackName,
      'Diagram file is missing the required "tables" array',
    );
  }

  const seen = new Set<string>();
  const tables: DiagramLayoutTable[] = [];
  for (const entry of raw.tables) {
    if (!isRecord(entry)) {
      throw new DiagramLayoutParseError(fallbackName, 'Every entry in "tables" must be a mapping');
    }
    const { name, x, y } = entry;
    if (typeof name !== 'string' || name === '') {
      throw new DiagramLayoutParseError(fallbackName, 'Every table entry needs a "name"');
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      throw new DiagramLayoutParseError(
        fallbackName,
        `Table "${name}" needs numeric "x" and "y" coordinates`,
      );
    }
    // Duplicates keep the first entry.
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    tables.push({ name, x, y });
  }

  const name = typeof raw.name === 'string' && raw.name !== '' ? raw.name : fallbackName;
  return { version: LAYOUT_VERSION, name, tables };
}

/** The result of reconciling a layout against the models that actually exist. */
export interface AppliedLayout {
  /** Model names that should be visible. */
  visible: Set<string>;
  /** Stored position per visible model. */
  positions: Map<string, NodePosition>;
  /** Layout entries naming models that no longer exist, in file order. */
  missing: string[];
}

/**
 * Reconciles a layout with the workspace: entries for models that no longer
 * exist are dropped and reported so the webview can warn the user.
 */
export function applyLayout(
  layout: DiagramLayout,
  knownModels: ReadonlySet<string>,
): AppliedLayout {
  const visible = new Set<string>();
  const positions = new Map<string, NodePosition>();
  const missing: string[] = [];

  for (const table of layout.tables) {
    if (!knownModels.has(table.name)) {
      missing.push(table.name);
      continue;
    }
    visible.add(table.name);
    positions.set(table.name, { x: table.x, y: table.y });
  }

  return { visible, positions, missing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
