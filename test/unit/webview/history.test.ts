import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../../src/dbt/modelStore';
import { createSourceStore } from '../../../src/dbt/sourceStore';
import { createUndoJournal, clearUndoJournal, modelFileDeltas, moveTo, pushUndoEntry, redo, sourceFileDeltas, toHistoryState, undo, type NewUndoEntry } from '../../../src/webview/history';
import type { DiagramLayout } from '../../../src/diagram/layoutFile';

const modelFile = (name: string) => ({ version: 2, models: [{ name, columns: [] }] });
const sourceFile = (name: string) => ({ version: 2, sources: [{ name, tables: [] }] });
const layout = (name: string): DiagramLayout => ({ version: 2, mode: 'model', name, tables: [], notes: [], groups: [] });
const entry = (label: string): NewUndoEntry => ({ label, domain: 'layout', before: layout('before'), after: layout(label) });

describe('undo journal', () => {
  it('records only changed model files', () => {
    const a = modelFile('a'); const b = modelFile('b'); const changed = modelFile('changed');
    expect(modelFileDeltas(createModelStore([{ uri: 'a', file: a }, { uri: 'b', file: b }]), createModelStore([{ uri: 'a', file: a }, { uri: 'b', file: changed }]))).toEqual([{ uri: 'b', before: b, after: changed }]);
  });
  it('records only changed source files', () => {
    const a = sourceFile('a'); const b = sourceFile('b'); const changed = sourceFile('changed');
    expect(sourceFileDeltas(createSourceStore([{ uri: 'a', file: a }, { uri: 'b', file: b }]), createSourceStore([{ uri: 'a', file: changed }, { uri: 'b', file: b }]))).toEqual([{ uri: 'a', before: a, after: changed }]);
  });
  it('keeps ordering, undo, redo, and travel', () => {
    let journal = createUndoJournal();
    journal = pushUndoEntry(journal, entry('A')); journal = pushUndoEntry(journal, entry('B')); journal = pushUndoEntry(journal, entry('C'));
    expect(journal.entries.map((item) => item.label)).toEqual(['A', 'B', 'C']);
    const back = moveTo(journal, 1);
    expect(back.steps.map((step) => `${step.entry.label}:${step.direction}`)).toEqual(['C:undo', 'B:undo']);
    expect(moveTo(back.journal, 3).steps.map((step) => `${step.entry.label}:${step.direction}`)).toEqual(['B:redo', 'C:redo']);
    const undone = undo(journal); expect(undone.journal.cursor).toBe(2); expect(redo(undone.journal).journal.cursor).toBe(3);
  });
  it('truncates redo and retains newest 50', () => {
    let journal = createUndoJournal();
    for (let index = 1; index <= 51; index += 1) journal = pushUndoEntry(journal, entry(String(index)));
    expect(journal.entries.map((item) => item.label)).toEqual(Array.from({ length: 50 }, (_, index) => String(index + 2)));
    expect(journal.truncated).toBe(true);
    const branch = pushUndoEntry(moveTo(journal, 1).journal, entry('D'));
    expect(branch.entries.map((item) => item.label)).toEqual(['2', 'D']);
  });
  it('bounds are no-ops and clear preserves ids', () => {
    const empty = createUndoJournal(); expect(undo(empty).journal).toBe(empty);
    let journal = pushUndoEntry(empty, entry('A')); expect(redo(journal).journal).toBe(journal);
    journal = pushUndoEntry(clearUndoJournal(journal), entry('B')); expect(journal.entries[0]?.id).toBe(2);
  });
  it('projects no snapshots and journals are independent', () => {
    const first = pushUndoEntry(createUndoJournal(), entry('A'));
    const second = pushUndoEntry(createUndoJournal(), entry('B'));
    expect(toHistoryState(first)).toEqual({ items: [{ id: 1, label: 'A', domain: 'layout' }], cursor: 1, truncated: false });
    expect(undo(first).journal.cursor).toBe(0); expect(second.cursor).toBe(1);
  });
});
