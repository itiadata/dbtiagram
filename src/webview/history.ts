import type { ModelStore } from '../dbt/modelStore';
import type { ModelYmlFile } from '../dbt/types';
import type { SourceStore } from '../dbt/sourceStore';
import type { SourceYmlFile } from '../dbt/sourceTypes';
import type { DiagramLayout } from '../diagram/layoutFile';
import { HISTORY_LIMIT, type HistoryState } from '../shared/history';

export type ModelFileDelta = { uri: string; before: ModelYmlFile; after: ModelYmlFile };
export type SourceFileDelta = { uri: string; before: SourceYmlFile; after: SourceYmlFile };
export type NewUndoEntry =
  | { label: string; domain: 'modelYaml'; files: ModelFileDelta[] }
  | { label: string; domain: 'sourceYaml'; files: SourceFileDelta[] }
  | { label: string; domain: 'layout'; before: DiagramLayout; after: DiagramLayout };
export type UndoEntry = NewUndoEntry & { id: number };

export interface UndoJournal {
  entries: UndoEntry[];
  cursor: number;
  nextId: number;
  truncated: boolean;
}

export interface UndoStep { entry: UndoEntry; direction: 'undo' | 'redo' }
export interface UndoTransition { journal: UndoJournal; steps: UndoStep[] }

export function createUndoJournal(): UndoJournal {
  return { entries: [], cursor: 0, nextId: 1, truncated: false };
}

export function pushUndoEntry(journal: UndoJournal, entry: NewUndoEntry): UndoJournal {
  const branch = journal.entries.slice(0, journal.cursor);
  const entries = [...branch, { ...entry, id: journal.nextId } as UndoEntry];
  const overflow = Math.max(0, entries.length - HISTORY_LIMIT);
  return {
    entries: entries.slice(overflow),
    cursor: entries.length - overflow,
    nextId: journal.nextId + 1,
    truncated: journal.truncated || overflow > 0,
  };
}

export function undo(journal: UndoJournal): UndoTransition {
  return moveTo(journal, journal.cursor - 1);
}

export function redo(journal: UndoJournal): UndoTransition {
  return moveTo(journal, journal.cursor + 1);
}

export function moveTo(journal: UndoJournal, requestedCursor: number): UndoTransition {
  const cursor = Math.max(0, Math.min(journal.entries.length, requestedCursor));
  if (cursor === journal.cursor) return { journal, steps: [] };
  const steps: UndoStep[] = [];
  if (cursor < journal.cursor) {
    for (let index = journal.cursor - 1; index >= cursor; index -= 1) {
      const entry = journal.entries[index];
      if (entry !== undefined) steps.push({ entry, direction: 'undo' });
    }
  } else {
    for (let index = journal.cursor; index < cursor; index += 1) {
      const entry = journal.entries[index];
      if (entry !== undefined) steps.push({ entry, direction: 'redo' });
    }
  }
  return { journal: { ...journal, cursor }, steps };
}

export function clearUndoJournal(journal: UndoJournal): UndoJournal {
  return { entries: [], cursor: 0, nextId: journal.nextId, truncated: false };
}

export function toHistoryState(journal: UndoJournal): HistoryState {
  return {
    items: journal.entries.map(({ id, label, domain }) => ({
      id,
      label,
      domain: domain === 'layout' ? 'layout' : 'yaml',
    })),
    cursor: journal.cursor,
    truncated: journal.truncated,
  };
}

export function modelFileDeltas(before: ModelStore, after: ModelStore): ModelFileDelta[] {
  const previous = new Map(before.records.map((record) => [record.uri, record.file]));
  return after.records.flatMap((record) => {
    const old = previous.get(record.uri);
    return old === undefined || old === record.file ? [] : [{ uri: record.uri, before: old, after: record.file }];
  });
}

export function sourceFileDeltas(before: SourceStore, after: SourceStore): SourceFileDelta[] {
  const previous = new Map(before.records.map((record) => [record.uri, record.file]));
  return after.records.flatMap((record) => {
    const old = previous.get(record.uri);
    return old === undefined || old === record.file ? [] : [{ uri: record.uri, before: old, after: record.file }];
  });
}
