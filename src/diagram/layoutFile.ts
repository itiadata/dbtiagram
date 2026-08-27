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

/** A free-text sticky note pinned to the canvas (spec 16). */
export interface DiagramNote {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** How the note renders when the diagram is opened. Runtime toggles never change it. */
  collapsedByDefault: boolean;
}

export const NOTE_DEFAULT_WIDTH = 220;
export const NOTE_DEFAULT_HEIGHT = 120;
export const NOTE_MIN_WIDTH = 120;
export const NOTE_MIN_HEIGHT = 64;

/** The full contents of a saved diagram layout file. */
export interface DiagramLayout {
  version: typeof LAYOUT_VERSION;
  name: string;
  tables: DiagramLayoutTable[];
  /** Always present in memory; `[]` when the file has no notes. */
  notes: DiagramNote[];
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
  return stripLayoutSuffix(base);
}

/**
 * Removes a trailing `.dbtiagram.yml`. The save dialog suggests this bare name:
 * VS Code appends the filter's extension itself, so suggesting a name that
 * already carries the suffix produces `x.dbtiagram.yml.dbtiagram.yml`.
 */
export function stripLayoutSuffix(name: string): string {
  return name.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX)
    ? name.slice(0, name.length - LAYOUT_FILE_SUFFIX.length)
    : name;
}

/**
 * Builds a layout from the currently visible tables. Tables are sorted by name
 * and coordinates rounded to integers so repeated writes produce minimal diffs.
 * Notes (spec 16) get the same treatment, sorted by id.
 */
export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
  notes: readonly DiagramNote[] = [],
): DiagramLayout {
  const tables = visible
    .map((table) => ({
      name: table.name,
      x: Math.round(table.x),
      y: Math.round(table.y),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const sortedNotes = notes
    .map((note) => ({
      ...note,
      x: Math.round(note.x),
      y: Math.round(note.y),
      width: Math.round(note.width),
      height: Math.round(note.height),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: LAYOUT_VERSION, name, tables, notes: sortedNotes };
}

/**
 * A default-sized empty note at the given canvas point. `id` is supplied by the
 * caller so this stays pure (id generation lives in the webview).
 */
export function createNote(x: number, y: number, id: string): DiagramNote {
  return {
    id,
    text: '',
    x,
    y,
    width: NOTE_DEFAULT_WIDTH,
    height: NOTE_DEFAULT_HEIGHT,
    collapsedByDefault: false,
  };
}

/**
 * Serializes a layout deterministically (fixed key order, sorted entries). The
 * `notes` key is omitted entirely when there are none, so files written before
 * spec 16 are not churned by an empty array.
 */
export function serializeDiagramLayout(layout: DiagramLayout): string {
  const root: Record<string, unknown> = {
    version: layout.version,
    name: layout.name,
    tables: layout.tables.map((table) => ({ name: table.name, x: table.x, y: table.y })),
  };
  if (layout.notes.length > 0) {
    root.notes = layout.notes.map((note) => ({
      id: note.id,
      text: note.text,
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      collapsedByDefault: note.collapsedByDefault,
    }));
  }
  return stringify(root);
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
  return { version: LAYOUT_VERSION, name, tables, notes: parseNotes(raw.notes, fallbackName) };
}

/**
 * Parses the optional `notes` key (spec 16). Missing means "no notes", so files
 * written before spec 16 load unchanged; anything present but malformed is a
 * hard error rather than a silently dropped note.
 */
function parseNotes(raw: unknown, fallbackName: string): DiagramNote[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new DiagramLayoutParseError(fallbackName, 'Diagram file "notes" must be an array');
  }

  const seen = new Set<string>();
  const notes: DiagramNote[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      throw new DiagramLayoutParseError(fallbackName, 'Every entry in "notes" must be a mapping');
    }
    const { id, text, x, y, width, height, collapsedByDefault } = entry;
    if (typeof id !== 'string' || id === '') {
      throw new DiagramLayoutParseError(fallbackName, 'Every note entry needs an "id"');
    }
    if (text !== undefined && text !== null && typeof text !== 'string') {
      throw new DiagramLayoutParseError(fallbackName, `Note "${id}" needs a string "text"`);
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      throw new DiagramLayoutParseError(
        fallbackName,
        `Note "${id}" needs numeric "x" and "y" coordinates`,
      );
    }
    const hasWidth = width !== undefined && width !== null;
    const hasHeight = height !== undefined && height !== null;
    if ((hasWidth && !isFiniteNumber(width)) || (hasHeight && !isFiniteNumber(height))) {
      throw new DiagramLayoutParseError(
        fallbackName,
        `Note "${id}" needs numeric "width" and "height"`,
      );
    }
    if (
      collapsedByDefault !== undefined &&
      collapsedByDefault !== null &&
      typeof collapsedByDefault !== 'boolean'
    ) {
      throw new DiagramLayoutParseError(
        fallbackName,
        `Note "${id}" needs a boolean "collapsedByDefault"`,
      );
    }
    // Duplicates keep the first entry, mirroring the table rule above.
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    notes.push({
      id,
      text: typeof text === 'string' ? text : '',
      x,
      y,
      // A note smaller than the minimum would be unusable, so sizes are clamped
      // rather than rejected.
      width: Math.max(hasWidth ? (width as number) : NOTE_DEFAULT_WIDTH, NOTE_MIN_WIDTH),
      height: Math.max(hasHeight ? (height as number) : NOTE_DEFAULT_HEIGHT, NOTE_MIN_HEIGHT),
      collapsedByDefault: collapsedByDefault === true,
    });
  }

  return notes;
}

/** The result of reconciling a layout against the models that actually exist. */
export interface AppliedLayout {
  /** Model names that should be visible. */
  visible: Set<string>;
  /** Stored position per visible model. */
  positions: Map<string, NodePosition>;
  /** Layout entries naming models that no longer exist, in file order. */
  missing: string[];
  /** Passed through untouched — notes reference nothing in the workspace. */
  notes: DiagramNote[];
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

  return { visible, positions, missing, notes: layout.notes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
