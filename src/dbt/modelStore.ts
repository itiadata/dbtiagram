/**
 * Pure in-memory store of parsed model.yml files, with last-good retention.
 * MUST NOT import `vscode`.
 *
 * The store is the single source of truth for the diagram's model set on the
 * extension-host side (spec 04). Every function is pure: it returns a new
 * store and never mutates its inputs. Files whose most recent parse failed are
 * tracked in `pendingErrors` while their **last good** record stays in
 * `records`, so a mid-edit (as-you-type) YAML slip never blanks the diagram.
 */
import { ModelYmlParseError, parseModelYml } from './parse';
import type { ModelYmlFile } from './types';

/** A parsed model.yml file keyed by its file-system path. */
export interface ModelFileRecord {
  uri: string;
  file: ModelYmlFile;
}

/** A successfully parsed file produced by a workspace scan. */
export interface LoadedModelFile {
  uri: string;
  file: ModelYmlFile;
}

/** A file that failed to parse during a workspace scan. */
export interface FailedModelFile {
  uri: string;
  error: string;
}

export interface ModelStore {
  records: ModelFileRecord[];
  /** uri -> human-readable parse error for files whose last parse failed. */
  pendingErrors: Map<string, string>;
}

/** Creates an empty (or seeded) store. */
export function createModelStore(records: ModelFileRecord[] = []): ModelStore {
  return { records: [...records], pendingErrors: new Map() };
}

/**
 * Replaces or inserts a record for `uri` and clears its pending error,
 * preserving the existing record order.
 */
export function upsertRecord(store: ModelStore, uri: string, file: ModelYmlFile): ModelStore {
  const records = [...store.records];
  const index = records.findIndex((record) => record.uri === uri);
  const next: ModelFileRecord = { uri, file };
  if (index === -1) {
    records.push(next);
  } else {
    records[index] = next;
  }
  const pendingErrors = new Map(store.pendingErrors);
  pendingErrors.delete(uri);
  return { records, pendingErrors };
}

/**
 * Applies a text change to a model.yml file. A successful parse upserts the
 * record and clears any pending error; a failed parse keeps the last good
 * record (if any) and records the error.
 */
export function applyTextChange(store: ModelStore, uri: string, content: string): ModelStore {
  try {
    return upsertRecord(store, uri, parseModelYml(content, uri));
  } catch (err) {
    const message = err instanceof ModelYmlParseError ? err.message : String(err);
    const pendingErrors = new Map(store.pendingErrors);
    pendingErrors.set(uri, message);
    return { ...store, pendingErrors };
  }
}

/** Drops a file's record and its pending error. */
export function applyFileDeleted(store: ModelStore, uri: string): ModelStore {
  const records = store.records.filter((record) => record.uri !== uri);
  const pendingErrors = new Map(store.pendingErrors);
  pendingErrors.delete(uri);
  return { records, pendingErrors };
}

/** Moves a file's record to a new path, parsing the new content. */
export function applyFileRenamed(
  store: ModelStore,
  oldUri: string,
  newUri: string,
  content: string,
): ModelStore {
  return applyTextChange(applyFileDeleted(store, oldUri), newUri, content);
}

/**
 * Merges the result of a full workspace scan into the store: successfully
 * loaded files replace their records; failed files keep their last good record
 * (if any) and move into `pendingErrors`; files that are neither loaded nor
 * failed were deleted since the last scan and drop out.
 */
export function replaceModelStore(
  store: ModelStore,
  loaded: readonly LoadedModelFile[],
  failed: readonly FailedModelFile[],
): ModelStore {
  const records: ModelFileRecord[] = loaded.map((entry) => ({ uri: entry.uri, file: entry.file }));
  const loadedUris = new Set(loaded.map((entry) => entry.uri));
  const previousByUri = new Map(store.records.map((record) => [record.uri, record]));
  const pendingErrors = new Map<string, string>();

  for (const failure of failed) {
    if (!loadedUris.has(failure.uri)) {
      const previous = previousByUri.get(failure.uri);
      if (previous !== undefined) {
        records.push(previous);
      }
    }
    pendingErrors.set(failure.uri, failure.error);
  }

  return { records, pendingErrors };
}
