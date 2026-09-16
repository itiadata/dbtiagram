---
id: 47
title: Undo, redo, and action history
status: done
priority: high
created: 2026-09-16
owner: unassigned
depends_on: [22, 29, 31, 46]
---

# Undo, redo, and action history

## Summary

As a dbtiagram user, I want to undo and redo important actions with familiar
keyboard shortcuts and toolbar buttons, and inspect recent actions in a simple
history view, so that I can recover from mistakes or return to a retained state
without manually reconstructing YAML or diagram content. History includes YAML
changes made through dbtiagram plus table positions, auto-layout, sticky notes,
and groups, while deliberately omitting lower-value UI state.

## Background

Model/source edits are owned and persisted by the extension host, while table
positions, notes, and groups are owned by the webview and saved through the
layout path. Undo therefore needs one ordered, panel-local stack coordinating
both sides.

Large YAML files make full-workspace or raw-text snapshots undesirable. YAML
history entries instead retain only the parsed file records changed by one
action, with before/after values. Existing immutable domain edits share
unchanged object graphs, and unaffected files are absent from the entry. Layout
entries retain before/after `DiagramLayout` values, which are comparatively
small. This keeps a 50-action history practical even with 5,000-line YAML files.
Once that ordered stack exists, exposing its labels and cursor in a simple
history overlay adds limited complexity without changing persistence semantics.

## Scope

**In scope**

- Undo, Redo, and History toolbar buttons.
- Ctrl/Cmd+Z for Undo.
- Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z for Redo.
- One chronological undo/redo stack per open diagram tab.
- A simple History overlay showing the retained actions, their YAML/Layout kind,
  and the currently applied state.
- Selecting any retained state travels there by applying the required Undo or
  Redo steps in order.
- Every successful YAML action performed directly through dbtiagram, including
  model/column edits, PK/FK edits, column add/move/copy/reorder, AI rename/type
  imports, source edits, and source-table imports.
- Table movement and Auto-layout.
- Persisted sticky-note actions: add, edit text, move, resize, delete, and change
  `collapsedByDefault`.
- Group actions: create, edit membership, add/remove a table, rename, recolour,
  and remove.
- One entry per completed gesture or bulk action, never one per pointer movement.
- At most 50 entries. New work after Undo discards the redo branch.
- YAML restoration is written to disk immediately. Layout restoration follows
  the existing dirty/manual-Save behavior.
- External model/source YAML changes and explicitly reopening a layout clear the
  stack, preventing stale undo from overwriting changes made outside the tool.

**Out of scope**

- Diffs, previews, timestamps, search, grouping, a branching tree, or editing
  history entries.
- Undoing displayed-table visibility/filter changes or per-table/diagram-wide
  column-display choices. These can be added in a later feature after the core
  mechanism is proven.
- Undoing edits made directly in a VS Code text editor, by git, or by another
  program.
- Persisting history across panel close, extension reload, or VS Code restart.
- Sharing history between tabs, even when they show the same files.
- Undoing selection, search, pan/zoom, sidebar state, settings, clipboard Copy or
  Cut before Paste, runtime-only note collapse, modal state, or Save itself.
- Restoring comments already excluded by an existing operation, such as comments
  on transferred columns under spec 46.

## Scenarios

### Undo and redo a YAML edit

```
Given the user changes orders.status data type from "text" to "varchar"
And the edit has been written to model.yml
When the user presses Ctrl+Z outside an editable field
Then orders.status has data type "text" in the diagram and model.yml
And Redo becomes available
When the user presses Ctrl+Y
Then orders.status has data type "varchar" in the diagram and model.yml
```

### Retain only changed YAML files

```
Given the workspace contains several large model.yml files
When one action changes only models/orders.yml
Then its history entry contains before and after parsed records for models/orders.yml
And it contains no snapshots of unaffected YAML files
```

### Undo and redo a moved table

```
Given orders is at (10, 20)
When the user drags it to (300, 400)
And invokes Undo
Then orders returns to (10, 20)
And no model/source YAML file is written
When the user invokes Redo
Then orders returns to (300, 400)
```

### Treat table dragging and auto-layout as single actions

```
Given the user drags a table through many pointer positions
When the drag ends
Then one Undo returns it directly to its drag-start position
And a second Undo addresses the action before the drag
Given the user runs Auto-layout for several tables
Then one Undo restores every table's pre-layout position
```

### Undo persisted note actions

```
Given the user adds a note, edits its text, moves it, resizes it, and deletes it
When Undo is invoked repeatedly
Then each completed action is reversed in reverse order
And Redo reapplies each action in chronological order
And runtime-only Collapse or Expand created no entry
```

### Undo group actions

```
Given the user creates group "Sales", changes its membership, and recolours it
When Undo is invoked repeatedly
Then the colour, membership, and creation are reversed one action at a time
And no model/source YAML file is written
```

### Keep YAML and layout actions in one order

```
Given the user renames a column, moves a table, and edits a note in that order
When Undo is invoked three times
Then the note edit, table move, and column rename are reversed in that order
When Redo is invoked three times
Then they are reapplied in the original order
```

### Inspect and travel through recent history

```
Given the retained actions are "Rename column orders.state to status", "Move table orders", and "Add note"
And all three actions are currently applied
When the user opens History
Then those actions appear newest-to-oldest with YAML or Layout indicators
And "Add note" is marked as the current state
When the user selects the state after "Rename column orders.state to status"
Then "Add note" and "Move table orders" are undone in reverse order
And the selected row is marked current
When the user selects "Add note"
Then the two actions are redone in chronological order
```

### New work discards redo

```
Given three actions exist and the user has undone the latest two
When the user performs a new supported action
Then the two undone entries are discarded
And Redo is disabled
```

### Preserve native field undo

```
Given keyboard focus is in an input, textarea, select, or contenteditable element
When the user presses an Undo or Redo shortcut
Then the browser's native field behavior is allowed
And dbtiagram's undo cursor does not move
```

### Ignore failed and unchanged actions

```
Given a YAML action is rejected or a drag ends where it started
When the operation finishes
Then no undo entry is added
And the prior Undo and Redo availability is unchanged
```

### Clear stale history after an external change

```
Given the current diagram tab has undo history
When a watched model/source YAML file changes outside dbtiagram
Then Undo and Redo are cleared in that tab
And the external content remains authoritative
```

### Keep tab histories independent

```
Given two diagram tabs have performed different actions
When Undo is invoked in the first tab
Then only the first tab's content and undo/redo state change
```

### Bound memory use

```
Given 50 actions are retained
When one more successful action is performed
Then the oldest entry is discarded
And the newest 50 actions remain undoable
And the first state in History is labelled "Earlier state"
```

### Leave visibility and column display outside history

```
Given the user hides a table or changes which columns a table displays
When the user invokes Undo
Then that visibility/display choice is not reversed
And Undo addresses the latest supported YAML, position, note, or group action
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/README.md` | modify | Index feature 47 and track its lifecycle status. |
| `specs/ARCHITECTURE.md` | modify | Register history modules and revised panel/webview responsibilities. |
| `src/shared/history.ts` | create | Shared history row/state types, retention limit, and deterministic labels for every model edit. |
| `src/webview/history.ts` | create | Pure bounded mixed journal using changed-file deltas for YAML and full layout values for layout actions, including cursor travel. |
| `src/shared/protocol.ts` | modify | Add layout-record, undo/redo/go-to, history-state, and layout-restore messages. |
| `src/webview/panel.ts` | modify | Own one journal per panel, serialize mutations, record successful YAML/import actions, persist restores, apply layout entries, publish history state, and clear stale history. |
| `src/webview/layoutMessages.ts` | modify | Notify the panel when an explicit layout open replaces the undo baseline. |
| `webview-ui/layout-history.ts` | create | Pure before/after layout capture and structural no-op detection. |
| `webview-ui/history-shortcuts.ts` | create | Pure shortcut classification with editable-target protection. |
| `webview-ui/hooks/useUndoRedo.ts` | create | Track history state/overlay, bind shortcuts, capture named layout gestures, request cursor travel, and apply host-requested layout restoration. |
| `webview-ui/UndoRedoControls.tsx` | create | Render compact Undo, Redo, and History header buttons without increasing `App.tsx` further. |
| `webview-ui/HistoryPanel.tsx` | create | Render retained actions, domain indicators, current state, and selectable cursor states. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch history-state and historical-layout messages. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Expose the normalized current layout and apply historical positions without replacing the saved dirty baseline. |
| `webview-ui/hooks/useNotes.ts` | modify | Delimit persisted note mutations and support historical replacement. |
| `webview-ui/hooks/useGroups.ts` | modify | Delimit group mutations and support historical replacement. |
| `webview-ui/DiagramCanvas.tsx` | modify | Delimit table/note drags and auto-layout as one action each. |
| `webview-ui/App.tsx` | modify | Compose undo/redo, bind current layout/restoration, and render controls. |
| `webview-ui/icons.ts` | modify | Re-export Undo and Redo icons. |
| `webview-ui/styles.css` | modify | Style undo/redo controls, disabled states, and history overlay rows/badges. |
| `test/unit/shared/history.test.ts` | create | Exact edit labels, shared state shape, and retention constant tests. |
| `test/unit/webview/history.test.ts` | create | Journal tests for changed-file deltas, ordering, branching, limits, bounds, and independence. |
| `test/unit/webview/layoutHistory.test.ts` | create | Layout capture tests for one gesture and unchanged results. |
| `test/unit/webview/historyShortcuts.test.ts` | create | Shortcut and editable-target tests. |
| `test/unit/webview/layout-dirty.test.ts` | modify | Verify layout undo recomputes dirty state against the unchanged saved snapshot. |

### Signatures

```ts
// src/shared/history.ts (shared — must not import `vscode`)
export type HistoryDomain = 'yaml' | 'layout';
export interface HistoryItem {
  id: number;
  label: string;
  domain: HistoryDomain;
}
export interface HistoryState {
  items: HistoryItem[];
  /** Number of retained actions currently applied; 0..items.length. */
  cursor: number;
  truncated: boolean;
}
export const HISTORY_LIMIT = 50;
export function describeModelEdit(edit: ModelEdit): string;
```

```ts
// src/webview/history.ts (pure — must not import `vscode`)
export type ModelFileDelta = {
  uri: string;
  before: ModelYmlFile;
  after: ModelYmlFile;
};
export type SourceFileDelta = {
  uri: string;
  before: SourceYmlFile;
  after: SourceYmlFile;
};
export type NewUndoEntry =
  | { label: string; domain: 'modelYaml'; files: ModelFileDelta[] }
  | { label: string; domain: 'sourceYaml'; files: SourceFileDelta[] }
  | { label: string; domain: 'layout'; before: DiagramLayout; after: DiagramLayout };
export type UndoEntry = NewUndoEntry & { id: number };
export interface UndoJournal {
  entries: UndoEntry[];
  /** Number of entries currently applied; 0..entries.length. */
  cursor: number;
  nextId: number;
  truncated: boolean;
}
export interface UndoStep { entry: UndoEntry; direction: 'undo' | 'redo' }
export interface UndoTransition {
  journal: UndoJournal;
  steps: UndoStep[];
}
export function createUndoJournal(): UndoJournal;
export function pushUndoEntry(journal: UndoJournal, entry: NewUndoEntry): UndoJournal;
export function undo(journal: UndoJournal): UndoTransition;
export function redo(journal: UndoJournal): UndoTransition;
export function moveTo(journal: UndoJournal, cursor: number): UndoTransition;
export function clearUndoJournal(journal: UndoJournal): UndoJournal;
export function toHistoryState(journal: UndoJournal): HistoryState;
export function modelFileDeltas(before: ModelStore, after: ModelStore): ModelFileDelta[];
export function sourceFileDeltas(before: SourceStore, after: SourceStore): SourceFileDelta[];
```

```ts
// src/shared/protocol.ts (shared — additions)
// MessageToExtension:
// | { type: 'history:recordLayout'; label: string; before: DiagramLayout; after: DiagramLayout }
// | { type: 'history:undo' }
// | { type: 'history:redo' }
// | { type: 'history:goTo'; cursor: number }
// MessageToWebview:
// | { type: 'history:state'; state: HistoryState }
// | { type: 'history:applyLayout'; layout: DiagramLayout }
```

```ts
// src/webview/layoutMessages.ts (pure — LayoutHost addition)
export interface LayoutHost {
  // existing members remain
  onLayoutReplaced(): void;
}
```

```ts
// webview-ui/layout-history.ts (webview, pure)
export interface LayoutCapture {
  label: string;
  before: DiagramLayout;
}
export interface CompletedLayoutCapture {
  label: string;
  before: DiagramLayout;
  after: DiagramLayout;
}
export function beginLayoutCapture(label: string, before: DiagramLayout): LayoutCapture;
export function finishLayoutCapture(
  capture: LayoutCapture,
  after: DiagramLayout,
): CompletedLayoutCapture | null;
```

```ts
// webview-ui/history-shortcuts.ts (webview, pure)
export interface HistoryKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  editable: boolean;
}
export function historyShortcut(input: HistoryKeyInput): 'undo' | 'redo' | null;
```

```ts
// webview-ui/hooks/useUndoRedo.ts (webview)
export interface UndoRedoState {
  history: HistoryState;
  historyOpen: boolean;
  undo: () => void;
  redo: () => void;
  goTo: (cursor: number) => void;
  openHistory: () => void;
  closeHistory: () => void;
  applyHistoryState: (state: HistoryState) => void;
  bindLayout: (layout: DiagramLayout, apply: (layout: DiagramLayout) => void) => void;
  applyLayout: (layout: DiagramLayout) => void;
  recordMutation: (label: string, mutate: () => void) => void;
  beginGesture: (label: string) => void;
  finishGesture: () => void;
}
export function useUndoRedo(): UndoRedoState;
```

```ts
// webview-ui/UndoRedoControls.tsx (webview)
export interface UndoRedoControlsProps {
  state: HistoryState;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
}
export function UndoRedoControls(props: UndoRedoControlsProps): JSX.Element;

// webview-ui/HistoryPanel.tsx (webview)
export interface HistoryPanelProps {
  state: HistoryState;
  onGoTo: (cursor: number) => void;
  onClose: () => void;
}
export function HistoryPanel(props: HistoryPanelProps): JSX.Element;
```

```ts
// webview-ui/hooks/useLayoutPersistence.ts (webview — additions)
export interface LayoutPersistenceState {
  // existing members remain
  currentLayout: DiagramLayout;
  applyHistoryTables: (tables: readonly DiagramLayoutTable[]) => void;
}

// webview-ui/hooks/useNotes.ts (webview — changed/new)
export function useNotes(recordMutation?: (label: string, mutate: () => void) => void): NotesState;
export interface NotesState {
  // existing members remain unchanged
  replaceFromHistory: (notes: readonly DiagramNote[]) => void;
}

// webview-ui/hooks/useGroups.ts (webview — changed/new)
export function useGroups(recordMutation?: (label: string, mutate: () => void) => void): GroupsState;
export interface GroupsState {
  // existing members remain unchanged
  replaceFromHistory: (groups: readonly DiagramGroup[]) => void;
}

// webview-ui/DiagramCanvas.tsx (webview — additions)
export interface DiagramCanvasProps {
  // existing members remain unchanged
  onLayoutGestureStart: (label: string) => void;
  onLayoutGestureFinish: () => void;
}
```

### Behavior notes

1. **One panel-local journal.** `DiagramPanel` owns the canonical journal. No
   static or workspace-global history is introduced. Mutating messages and
   undo/redo requests run through a panel-local promise queue so YAML and layout
   entries preserve user-action order.
2. **Changed-file YAML deltas.** Before a YAML operation, the panel retains its
   current immutable store. After successful persistence, `modelFileDeltas` or
   `sourceFileDeltas` compares records by URI and file reference and emits only
   changed records. Each delta stores the complete parsed file value before and
   after, but no raw YAML text and no unaffected file. An empty delta creates no
   entry. A multi-file operation remains one entry containing several deltas.
3. **YAML restoration.** Undo writes every delta's `before`; Redo writes every
   delta's `after`, using existing `writeModelYmlFile`/`writeSourceYmlFile`
   surgical persistence. The matching store records are replaced, self-write
   timestamps are set, and the graph is republished only after all writes
   succeed. Before writing, the panel validates that every target record still
   matches the expected current side of the delta. A validation or write failure
   reports through `diagram:error`, leaves the journal cursor unchanged, clears
   the journal to prevent a stale retry, and refreshes from disk so any partial
   multi-file write becomes the new authoritative baseline.
4. **Labels.** Every entry receives a concise deterministic label when created.
   `describeModelEdit` exhaustively labels every `ModelEdit`: rename model/column,
   change descriptions/types/meta, change PK, create/edit/delete FK, move/copy/
   reorder/add columns, and AI import. Source import uses `Import <n> source
   table(s)`. Layout labels include `Move table <name>`, `Auto-layout diagram`,
   `Add/Edit/Move/Resize/Delete note`, `Change note default`, `Create group
   <name>`, `Edit group <name> tables`, `Rename group <old> to <new>`, `Change
   group <name> color`, and `Remove group <name>`.
5. **Source import and AI import.** Source-table import captures the store before
   and after the complete import workflow, producing one entry regardless of
   imported table count. AI import already funnels through `applyEditAndPersist`
   and produces one YAML entry for its bulk edit, not one per column.
6. **Linear bounded stack.** `cursor` is the count of currently applied entries.
   Undo selects `entries[cursor - 1]`; Redo selects `entries[cursor]`. A new push
   first removes `entries.slice(cursor)`, appends the new entry, then discards
   oldest entries above `HISTORY_LIMIT`. The resulting cursor equals the retained
   entry count. Entry IDs increase monotonically and are not reused after clear
   or truncation. Once the oldest entry is dropped, `truncated` remains true.
7. **History state and travel.** `toHistoryState` maps model/source domains to
   `yaml`, retains layout as `layout`, and exposes IDs, labels, cursor, and
   truncation only—never snapshots. `moveTo` clamps a requested cursor into the
   retained range and returns every required step: newest-to-oldest for backward
   travel and oldest-to-newest for forward travel. The panel persists/applies
   steps sequentially and publishes the final state only after all succeed.
8. **Layout capture.** The webview binds the latest normalized `currentLayout` to
   `useUndoRedo`. `recordMutation` captures it, invokes one synchronous state
   mutation, and posts before/after only after a subsequent render exposes a
   structurally different normalized layout. `beginGesture`/`finishGesture`
   bracket drags and Auto-layout so intermediate renders are ignored.
9. **Layout restoration.** Undo/Redo/history travel of a layout entry posts
   `history:applyLayout`. `App` replaces table visibility and positions, notes,
   groups, and the layout values carried incidentally by `DiagramLayout`; because
   visibility and column display are out of scope, user changes to those two
   concerns made after the captured action are preserved rather than taken from
   the historical snapshot. `activeLayout` and the last-saved dirty baseline are
   never replaced. No YAML is written.
10. **Table gestures.** React Flow `onNodeDragStart` starts a gesture only for a
   table or note. `onNodeDragStop` finishes it. One table drag is one entry. One
   note drag is one entry. Auto-layout begins before the layout tick and finishes
   after the resulting positions report. An unchanged final layout is a no-op.
11. **Notes.** Add, text commit on blur, resize commit on pointer-up, delete, and
   default-collapse toggle each call `recordMutation`. Runtime Collapse/Expand
   remains excluded. Note movement uses the gesture boundary, avoiding one entry
   per pointer event.
12. **Groups.** Confirmed picker/prompt results and direct add/remove/recolour/
    delete actions each call `recordMutation`. Cancelled results and pure no-ops
    produce no entry. Derived group rectangles are never snapshotted separately.
13. **History UI.** The compact, Settings-sized header controls use the Lucide
    `Undo`, `Redo`, and `RotateCcwClock` icons with secondary styling; Undo and
    Redo are disabled from `cursor === 0` and `cursor === items.length`, while
    History is always available.
    Its dismissible overlay lists `Earlier state` when truncated, otherwise
     `Initial state`, followed by retained actions newest-to-oldest. Rows show a
    `YAML` or `Layout` badge. The row representing `cursor` is marked `Current`
    and disabled; selecting another row sends its cursor through `history:goTo`.
    No snapshots or file contents are sent to the webview.
14. **State publication.** After create, push, successful undo/redo/go-to, clear,
    and `webview:ready`, the panel posts the exact `HistoryState`; no speculative
    local cursor is maintained.
15. **Keyboard.** A window listener accepts Ctrl or Cmd. Z without Shift is Undo;
    Y or Shift+Z is Redo. It ignores input, textarea, select, and contenteditable
    targets so native field history wins. It calls `preventDefault()` only when
    the requested dbtiagram operation is available.
16. **Invalidation.** A non-self model/source document change, file create/delete/
    rename, a refresh that replaces YAML records, or successful explicit
    `openLayout` calls `clearUndoJournal` and republishes availability. Self-write
    echoes, Save, `sendActiveLayout` on `webview:ready`, panel hide/reveal, filter
    changes, and column-display changes do not clear or append history.
17. **File formats.** Neither model/source YAML schema nor `.dbtiagram.yml`
    schema/version changes. Undo entries exist only in memory.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/history.test.ts` | `describes every ModelEdit kind` | one value for every current union member | exact concise labels from Behavior note 4; exhaustive switch compiles |
| same | `sets retention to 50` | `HISTORY_LIMIT` | `50` |
| `test/unit/webview/history.test.ts` | `records only changed model files` | before store A/B, after with only B file reference changed | one delta for B with exact before/after file references |
| same | `records only changed source files` | before sources A/B, after with only A changed | one delta for A; B absent |
| same | `keeps a multi-file action in one entry` | two changed file deltas | one entry whose `files.length` is `2` |
| same | `pushes labelled YAML and layout entries in action order` | model A, layout B, source C | labels `[A,B,C]`, domains `[modelYaml,layout,sourceYaml]`, ids `[1,2,3]`, cursor `3` |
| same | `undo and redo select exact entries` | three entries at cursor 3, then Undo, then Redo | Undo steps contain third/undo with cursor `2`; Redo steps contain third/redo with cursor `3` |
| same | `moves backward and forward in order` | cursor 3 -> 1 -> 3 | backward steps `[C undo,B undo]`; forward `[B redo,C redo]` |
| same | `new work truncates redo` | A/B/C, cursor 1, push D | entries `[A,D]`; cursor `2`; `canRedo:false` |
| same | `retains only the newest 50 entries` | push 51 distinct entries | entries 2..51; cursor `50` |
| same | `bounds are no-ops` | Undo empty; Redo fully applied | unchanged journal reference; `entry:undefined` |
| same | `clear empties state without reusing ids` | ids 1/2, clear, push C | one entry id `3`; cursor `1`; `truncated:false` |
| same | `projects snapshots to safe history state` | model/layout entries at cursor 1 | items expose only id/label/domain; cursor `1`; no file/layout snapshots |
| same | `two journals remain independent` | push A into first, B into second; undo first | first cursor `0`; second cursor `1` |
| `test/unit/webview/layoutHistory.test.ts` | `captures one completed changed layout` | begin orders `(10,20)`, finish `(300,400)` | exact before/after layouts |
| same | `ignores an unchanged gesture` | structurally equal normalized before/after layouts | `null` |
| `test/unit/webview/historyShortcuts.test.ts` | `classifies Windows and macOS shortcuts` | Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Meta+Z, Meta+Shift+Z | `undo,redo,redo,undo,redo` |
| same | `ignores editable targets and unrelated keys` | Ctrl+Z with `editable:true`; Ctrl+K | `null`; `null` |
| `test/unit/webview/layout-dirty.test.ts` | `undoing to the saved layout is clean` | saved A, current B, historical A | `true`, then `false` |
| same | `redoing away from the saved layout is dirty` | saved A, historical B | `true` |

Manual verification covers actual YAML writes, source/AI imports as one entry,
table/note drag coalescing, Auto-layout, every note/group action, mixed YAML and
layout order, native field undo, branch truncation, external-change clearing,
50-entry retention, history-row travel, dirty-state behavior, and independent
tabs.

Scenario mapping: *Undo and redo a YAML edit*, *Retain only changed YAML files*,
*Inspect and travel through recent history*, *New work discards redo*, *Ignore failed and unchanged actions*, *Clear stale
history*, *Keep tab histories independent*, and *Bound memory use* map to the
`history.test.ts` cases. *Undo and redo a moved table*, *Treat table dragging and
auto-layout as single actions*, *Undo persisted note actions*, *Undo group
actions*, *Keep YAML and layout actions in one order*, and *Leave visibility and
column display outside history* map to `layoutHistory.test.ts`,
`layout-dirty.test.ts`, and the named manual checks above. *Preserve native field
undo* maps to `historyShortcuts.test.ts` plus its manual browser check.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- `npm run typecheck` — explicit final strict-TypeScript check must be green.
- Manual: exercise the scenarios in model and source modes against
  `fixtures/sample-dbt`, inspect affected YAML/layout files, and confirm excluded
  visibility/column-display actions are not consumed by Undo.

### Do not touch

- YAML parser, serializer, merge policy, and layout-file schema/version: history
  restores existing parsed records through existing persistence paths.
- `src/dbt/edit/**` and `src/dbt/sourceEdit.ts`: mutation semantics stay
  unchanged; history wraps successful operations rather than adding inverse edits.
- `webview-ui/hooks/useDiagramFilter.ts` and `useColumnDisplay.ts`: visibility
  and column display are explicitly deferred.
- VS Code workspace-wide undo/redo commands: shortcuts are webview-local and do
  not intercept editor history outside the focused diagram.
- Pan/zoom, selection, search, sidebar, settings, matrix-column preferences,
  clipboard state, and runtime note-collapse state.
- Sample fixtures: no fixture change is required.

## Acceptance Criteria

- [ ] Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes the latest supported dbtiagram action.
- [ ] Disabled Undo and Redo buttons accurately reflect host-owned availability.
- [ ] History lists the latest 50 labelled actions, marks the current state, and can travel to any retained state.
- [ ] Native undo/redo remains available while focus is in an editable control.
- [ ] YAML actions store only changed parsed files and restore them to disk immediately.
- [ ] Table movement, Auto-layout, note actions, and group actions participate in the same ordered stack as YAML actions.
- [ ] Drags, auto-layout, bulk imports, and bulk edits each create one entry.
- [ ] Layout restoration follows existing dirty/manual-Save behavior and never writes model/source YAML.
- [ ] New work after Undo truncates Redo; failures and no-ops create no entry.
- [ ] The newest 50 entries are retained per tab and history is not persisted.
- [ ] External YAML changes and explicit layout reopen clear stale undo/redo.
- [ ] Visibility and column-display changes remain intentionally outside history.
- [ ] `npm test` and `npm run typecheck` are green.

## Confirm at Approval

- **Scope.** Include all YAML actions, table positions/Auto-layout, notes, groups,
  and a simple labelled history overlay with retained-state travel. Defer
  visibility and column-display undo.
- **Large-file strategy.** Each YAML entry stores complete parsed before/after
  values only for changed files—not raw text and not every loaded YAML file.
  Unchanged immutable subtrees remain shared.
- **Retention.** Keep the newest 50 actions in memory per diagram tab.
- **Shortcuts.** Support Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z for Redo, while editable
  controls retain native field undo/redo.
