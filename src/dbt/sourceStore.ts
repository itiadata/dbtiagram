import { NotASourceYmlFileError, SourceYmlParseError, parseSourceYml } from './sourceParse';
import type { SourceDefinition, SourceYmlFile } from './sourceTypes';

export interface SourceFileRecord { uri: string; file: SourceYmlFile }
export interface LoadedSourceFile { uri: string; file: SourceYmlFile }
export interface FailedSourceFile { uri: string; error: string }
export interface SourceStore { records: SourceFileRecord[]; pendingErrors: Map<string, string> }

export function createSourceStore(records: SourceFileRecord[] = []): SourceStore { return { records: [...records], pendingErrors: new Map() }; }
export function upsertSourceRecord(store: SourceStore, uri: string, file: SourceYmlFile): SourceStore {
  const records = [...store.records]; const index = records.findIndex((record) => record.uri === uri);
  if (index < 0) records.push({ uri, file }); else records[index] = { uri, file };
  const pendingErrors = new Map(store.pendingErrors); pendingErrors.delete(uri); return { records, pendingErrors };
}
export function applySourceFileDeleted(store: SourceStore, uri: string): SourceStore {
  const pendingErrors = new Map(store.pendingErrors); pendingErrors.delete(uri);
  return { records: store.records.filter((record) => record.uri !== uri), pendingErrors };
}
export function applySourceTextChange(store: SourceStore, uri: string, content: string): SourceStore {
  try { return upsertSourceRecord(store, uri, parseSourceYml(content, uri)); }
  catch (error) {
    if (error instanceof NotASourceYmlFileError) return applySourceFileDeleted(store, uri);
    const pendingErrors = new Map(store.pendingErrors);
    pendingErrors.set(uri, error instanceof SourceYmlParseError ? error.message : String(error));
    return { ...store, pendingErrors };
  }
}
export function applySourceFileRenamed(store: SourceStore, oldUri: string, newUri: string, content: string): SourceStore { return applySourceTextChange(applySourceFileDeleted(store, oldUri), newUri, content); }
export function replaceSourceStore(store: SourceStore, loaded: readonly LoadedSourceFile[], failed: readonly FailedSourceFile[]): SourceStore {
  const records = loaded.map((entry) => ({ ...entry })); const previous = new Map(store.records.map((record) => [record.uri, record])); const pendingErrors = new Map<string, string>();
  for (const failure of failed) { const record = previous.get(failure.uri); if (record !== undefined) records.push(record); pendingErrors.set(failure.uri, failure.error); }
  return { records, pendingErrors };
}
export function distributeEditedSources(store: SourceStore, edited: SourceDefinition[]): SourceFileRecord[] {
  const changed: SourceFileRecord[] = []; let offset = 0;
  for (const record of store.records) {
    const length = record.file.sources.length; const slice = edited.slice(offset, offset + length); offset += length;
    if (slice.length !== length) throw new Error('distributeEditedSources: edited source count does not match the store');
    if (slice.some((source, index) => source !== record.file.sources[index])) changed.push({ uri: record.uri, file: { ...record.file, sources: slice } });
  }
  return changed;
}
