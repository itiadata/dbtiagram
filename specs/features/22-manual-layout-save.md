---
id: 22
title: Manual save for diagram layout files
status: implemented
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [13, 14, 16]
---

# Manual save for diagram layout files

## Summary

As a dbt developer arranging a saved diagram (`.dbtiagram.yml`), I want layout
changes — table positions and sticky notes — to stay **unsaved until I
explicitly click Save**, so I control when the file on disk changes, the same
way any other editor's Save button works. Model.yml edits are unaffected: they
keep writing back immediately, as today.

## Background

Spec 13 introduced live write-back: once a layout is active, every drag or
visibility change rewrites the file after a 400 ms debounce, and the header
button always reads "Saved" whenever a layout is active — it is never
clickable in a meaningful way, since there is nothing to save. Spec 16 added
notes to the same live write-back.

This is surprising for a "Save" affordance: normal editors leave a file
untouched until the user asks to save, and show a dirty indicator in the
meantime. This feature replaces the always-on live write-back with a manual
save, using a dirty flag computed from the current layout compared to the
last-saved (or last-opened) snapshot.

Model edits (renaming a column, changing a description, etc.) are a completely
separate write path (`src/dbt/edit`, `src/vscode/project.ts`) untouched by
this feature: they must keep writing to `model.yml` immediately.

**Platform constraint on the close confirmation.** The diagram panel is a
plain `vscode.WebviewPanel` (`src/webview/panel.ts`), not a
`CustomEditorProvider`. Only `CustomEditorProvider`-based editors get a
VS Code hook that can *block* a tab close pending user confirmation (the
"backup"/dirty-document machinery used by, e.g., the default image or notebook
editors). A plain `WebviewPanel`'s `onDidDispose` fires **after** the tab is
already gone — there is no cancel. Converting the panel to a
`CustomEditorProvider` to get a true blocking prompt is a large architectural
change out of proportion to this feature, so this spec instead implements the
closest available approximation: the extension host keeps a lightweight,
in-memory cache of the current (unsaved) layout, kept in sync by the webview
as it changes; when the panel is disposed while that cache is dirty, the host
shows a **modal warning dialog** offering to save the cached layout to disk
right then (the tab itself has already closed by that point, but the file
still gets the user's last arrangement if they choose Save).

## Scope

**In scope**

- Remove the debounced live write-back for layout files (`layout:changed` /
  `writeActiveLayout`): dragging a table, moving/resizing/editing a note, or
  changing visibility no longer touches the file on disk until Save is
  clicked.
- A `dirty` flag in the webview, true whenever the current table
  positions/visible set/notes differ from the last-saved (or just-opened)
  layout snapshot.
- The header button now has three states:
  - No active layout: unchanged from today — "Save diagram", clickable,
    opens the save dialog.
  - Active layout, no unsaved changes: **disabled**, labeled "No changes".
  - Active layout, unsaved changes: **enabled**, labeled "Save", clicking it
    writes the file immediately (same write path as today's explicit save).
- Opening a layout (or a fresh apply on `webview:ready`) resets the dirty flag
  to false.
- A successful save resets the dirty flag to false. A cancelled save dialog
  (only reachable when there is no active layout yet) leaves state unchanged.
- **Closing the panel with unsaved layout changes prompts a confirmation
  dialog** offering to save them first (see Implementation Notes below for the
  platform constraint this works within).

**Out of scope**

- Any change to how model.yml edits are written back (still immediate).
- Undo/redo, or a keyboard shortcut for save.
- A confirmation prompt when there is **no** active layout yet (nothing to
  save to without going through the save dialog, which is unchanged).
- Multi-layout / multi-panel dirty tracking beyond what spec 14 already
  provides (each panel already owns one active layout).
- Changing the save dialog, file format, or protocol shapes beyond removing
  the now-unused live write-back message and adding the small state-sync
  message described below.

## Scenarios

### Dragging a table no longer writes to disk immediately

```
Given a saved diagram is open and active with no unsaved changes
When the user drags a table to a new position
Then the .dbtiagram.yml file on disk is not modified
And the header button becomes enabled and reads "Save"
```

### Clicking Save writes the pending changes

```
Given a saved diagram is open and active with unsaved changes
When the user clicks the "Save" button
Then the .dbtiagram.yml file is written with the current table positions and notes
And the header button becomes disabled and reads "No changes"
```

### No changes since opening shows a disabled button

```
Given a saved diagram is opened from the editor title bar
And the user has not moved anything
Then the header button is disabled and reads "No changes"
```

### Adding, moving, resizing, or editing a note marks the diagram dirty

```
Given a saved diagram is open and active with no unsaved changes
When the user types into a sticky note, or moves/resizes it
Then the header button becomes enabled and reads "Save"
When the user clicks "Save"
Then the note's new text/position/size is written to the file
And the header button returns to disabled "No changes"
```

### Model edits still write back immediately regardless of layout dirtiness

```
Given a saved diagram is open and active with unsaved layout changes
When the user renames a column in the details sidebar
Then the corresponding model.yml file is rewritten immediately, as today
And the layout button's dirty state is unaffected by that edit
```

### Saving for the first time still uses the save dialog

```
Given the dbt Diagram is open and no layout is active
Then the header button reads "Save diagram" and is enabled
When the user clicks it and completes the save dialog
Then a new .dbtiagram.yml file is written with the current tables/notes
And the header button becomes disabled and reads "No changes"
```

### Closing the panel with unsaved changes prompts to save

```
Given a saved diagram is open and active with unsaved changes
When the user closes the diagram panel's tab
Then a modal dialog appears asking whether to save "<diagram name>" before closing
And it offers "Save" and "Don't Save"
When the user chooses "Save"
Then the .dbtiagram.yml file is written with the layout as it was right before the tab closed
When the user instead chooses "Don't Save"
Then the file on disk is left exactly as it was at the last explicit save
```

### Closing the panel with no unsaved changes prompts nothing

```
Given a saved diagram is open and active with no unsaved changes
When the user closes the diagram panel's tab
Then no dialog appears
```

### Reopening a layout after choosing "Don't Save" reflects only what was saved

```
Given a saved diagram is open and active with unsaved changes
When the panel is closed and the user chooses "Don't Save" in the confirmation dialog
And the same layout file is reopened
Then the diagram reflects only what was last written to disk
And the header button reads "No changes"
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Drop the disk-writing debounce; repurpose it to post a debounced `layout:pending` cache-sync message (host memory only) instead, and add dirty tracking (snapshot-on-open/save vs. current tables+notes, via `layout-dirty.ts`), exposing `dirty` on the returned state. |
| `webview-ui/layout-dirty.ts` | create | Pure comparison of a current layout snapshot against the last-saved one, used to drive the header button's dirty state. |
| `webview-ui/App.tsx` | modify | Header button: three-state label/disabled logic driven by `activeLayout` + `layout.dirty` instead of the current two-state logic. |
| `src/webview/layoutMessages.ts` | modify | Remove `writeActiveLayout` (the old disk-writing live-write handler). Add `cachePendingLayout(host, layout, dirty)`, a small pure function that just calls `host.setPendingLayout(...)` — no disk I/O. `saveLayout`/`openLayout`/`sendActiveLayout` unchanged apart from clearing the pending cache on success. |
| `src/webview/panel.ts` | modify | Replace the `layout:changed` handler with `layout:pending` (calls `cachePendingLayout`, no `await`/disk write). Add in-memory fields `pendingLayout: DiagramLayout | undefined` and `pendingDirty: boolean` implementing the `LayoutHost` additions. In `dispose()`, before disposing the underlying panel, if `pendingDirty` and an active layout exists, `await` a modal `vscode.window.showWarningMessage` with `Save` / `Don't Save`; on `Save`, write `pendingLayout` to the active layout's path via the existing `writeLayoutFile`. |
| `src/webview/layoutMessages.ts` (types) | modify | Extend `LayoutHost` with `setPendingLayout(layout: DiagramLayout, dirty: boolean): void` and `getPendingLayout(): { layout: DiagramLayout; dirty: boolean } | undefined`. |
| `src/shared/protocol.ts` | modify | Replace the `layout:changed` message in `MessageToExtension` with `{ type: 'layout:pending'; layout: DiagramLayout; dirty: boolean }` (host-cache sync, never written to disk directly). |
| `test/unit/webview/layoutMessages.test.ts` | modify | Remove the `writeActiveLayout` test cases; add cases for `cachePendingLayout` and for the pending cache being cleared after a successful `saveLayout`/`openLayout`. |
| `webview-ui/styles.css` | modify | Add a disabled-state rule for `.app__save` (or reuse the existing `.panel-button:disabled`-style pattern) so "No changes" reads visibly non-interactive. |
| `specs/ARCHITECTURE.md` | modify | Update the `layoutMessages.ts`, `useLayoutPersistence.ts`, and `panel.ts` rows to reflect the new pending-cache responsibility and dropped/added exports. |

Note: `webview-ui/hooks/useLayoutPersistence.test.ts` does not exist today
(the hook has no dedicated unit suite — it is exercised indirectly). This
feature adds one, listed under Tests below, since the dirty-flag logic is pure
state-transition logic worth covering directly.

### Signatures

```ts
// webview-ui/layout-dirty.ts (webview, pure — no `vscode` import)
export interface LayoutSnapshot {
  tables: DiagramLayoutTable[];
  notes: DiagramNote[];
}
export function isLayoutDirty(current: LayoutSnapshot, saved: LayoutSnapshot | null): boolean;
```

```ts
// webview-ui/hooks/useLayoutPersistence.ts (webview)
export interface LayoutPersistenceState {
  activeLayout: { path: string; name: string } | null;
  seedPositions: Map<string, NodePosition> | null;
  seedTick: number;
  layoutMissing: string[];
  dismissLayoutMissing: () => void;
  onPositionsChange: (tables: DiagramLayoutTable[]) => void;
  onSaveDiagram: () => void;
  applyLayout: (message: LayoutApplyMessage) => string[];
  applyActiveLayout: (message: LayoutActiveMessage) => void;
  /** True when the current tables/notes differ from the last-saved/opened snapshot. */
  dirty: boolean;
}
export function useLayoutPersistence(notes: readonly DiagramNote[] = []): LayoutPersistenceState;
```

```ts
// src/webview/layoutMessages.ts (pure)
// `writeActiveLayout` is deleted. `LayoutHost` gains two members:
export interface LayoutHost {
  // ...existing members unchanged...
  setPendingLayout(layout: DiagramLayout, dirty: boolean): void;
  getPendingLayout(): { layout: DiagramLayout; dirty: boolean } | undefined;
}
export function publishActiveLayout(host: LayoutHost): void;
export async function openLayout(host: LayoutHost, fsPath: string): Promise<void>;
export async function sendActiveLayout(host: LayoutHost): Promise<void>;
export async function saveLayout(host: LayoutHost, layout: DiagramLayout): Promise<void>;
/** Caches the webview's latest (unsaved) layout in host memory; never touches disk. */
export function cachePendingLayout(host: LayoutHost, layout: DiagramLayout, dirty: boolean): void;
```

```ts
// src/shared/protocol.ts (shared)
// MessageToExtension's `{ type: 'layout:changed'; layout: DiagramLayout }` becomes:
// { type: 'layout:pending'; layout: DiagramLayout; dirty: boolean }
```

```ts
// src/webview/panel.ts (vscode-facing)
export class DiagramPanel {
  // ...existing members unchanged...
  private pendingLayout: DiagramLayout | undefined;
  private pendingDirty: boolean;
  // dispose() gains an async confirmation step before tearing down; see Behavior notes.
}
```

### Behavior notes

- **Dirty computation.** `useLayoutPersistence` keeps a ref
  `savedSnapshotRef: React.MutableRefObject<{ tables: DiagramLayoutTable[]; notes: DiagramNote[] } | null>`,
  set from `buildLayout(...).tables` / `.notes` (so ordering/rounding matches
  exactly what would be written) at two moments: (1) inside `applyLayout`,
  from `message.layout.tables` / `message.layout.notes` as received (already
  the file's contents); (2) inside `onSaveDiagram`, right after posting
  `layout:save`, from the `tablePositions`/`notes` just sent (optimistic —
  there is no save-ack message in the protocol, matching how `onSaveDiagram`
  already behaves today).
- `dirty` is derived (not stored redundantly) via a `useMemo`/plain comparison
  each render: `false` when `activeLayout === null`, otherwise
  `JSON.stringify(buildLayout('', tablePositions, notes).tables/notes) !== JSON.stringify(savedSnapshotRef.current)`.
  Comparing through `buildLayout` first guarantees both sides are sorted and
  rounded the same way, so drag jitter that resolves back to the same integer
  position does not spuriously flag dirty.
- **Cancelling the initial save dialog** (`onSaveDiagram` when
  `activeLayout === null`): unchanged behavior — `saveLayout` on the host is
  already a no-op on cancel (no `layout:active` reply), so no snapshot is
  taken and the button stays as "Save diagram" (not applicable to the
  dirty/no-changes states, which only exist once a layout is active).
- **Repurposing the debounce**: the existing `useEffect`/`writeArmedRef` in
  `useLayoutPersistence` that used to post a debounced `layout:changed` now
  posts `layout:pending` instead, with the same 400 ms debounce and the same
  arming guard (still needed so an empty initial render never overwrites the
  host's cache with `tables: []`). It carries the freshly computed `dirty`
  value alongside the layout so the host never needs to recompute it.
  `onPositionsChange` is otherwise unchanged.
- **Host-side pending cache** (`src/webview/panel.ts` / `layoutMessages.ts`):
  `cachePendingLayout` just assigns `host.setPendingLayout(layout, dirty)` —
  no `await`, no disk I/O, so it is safe to call on every debounced tick.
  `saveLayout` and `openLayout` clear it (`setPendingLayout` with `dirty:
  false`, or an equivalent "clear" call) once they complete successfully, so a
  save followed immediately by a close does not re-prompt.
- **Close confirmation** (`DiagramPanel.dispose`): reads
  `this.getPendingLayout()` (via the same `layoutHost` adapter already used
  elsewhere in the class). If it is `undefined`, or `dirty` is `false`, or
  `getActiveLayout()` is `undefined` (no active layout — out of scope per the
  Scope section), disposal proceeds exactly as today. Otherwise, **before**
  disposing the underlying `vscode.WebviewPanel` and disposables, it awaits
  `vscode.window.showWarningMessage(`"${name}" has unsaved diagram changes. Save them before closing?"`, { modal: true }, 'Save', "Don't Save")`.
  - `'Save'` → `writeLayoutFile(vscode.Uri.file(activeLayout.fsPath), { ...pendingLayout, name: activeLayout.name })`, awaited, before continuing teardown. A write failure surfaces via `vscode.window.showErrorMessage` (there is no diagram panel left to post a `diagram:error` to).
  - `"Don't Save"` or the dialog dismissed (`undefined`, e.g. clicking outside the modal) → proceed with teardown, discarding the pending layout, matching "Reopening a layout after choosing "Don't Save"" in Scenarios.
  - Because `onDidDispose` (which calls `this.dispose()`) fires once the tab is
    already closed, this prompt necessarily appears **after** the tab visually
    disappears; the write still lands on disk if the user picks Save. This
    matches the documented platform constraint in Background.
- **Header button** (`webview-ui/App.tsx`): 
  ```
  activeLayout === null            -> label "Save diagram", enabled (graph !== null)
  activeLayout !== null && !dirty  -> label "No changes", disabled
  activeLayout !== null && dirty   -> label "Save", enabled
  ```
  The `title` attribute mirrors this: `"Save the visible tables and their
  positions to a diagram file"` / `"No unsaved changes"` / `"Save changes to
  ${activeLayout.path}"`.
- **Model edits are untouched.** They flow through `src/dbt/edit` and
  `src/vscode/project.ts` exactly as today; nothing in this feature's file
  list touches that path. This satisfies the "model changes still reflect
  back directly" requirement by construction (no code there changes).
- **`layout:changed` becomes `layout:pending`, a cache-sync not a disk write.**
  This is the message renamed/repurposed, not a straight removal: the webview
  still posts on the same 400 ms debounce, but the host now only caches, never
  writes to disk from this path. Nothing else in the codebase sent
  `layout:changed` (confirmed by grep during implementation), so the rename is
  safe and keeps `MessageToExtension` exhaustive-switch-clean in
  `src/webview/panel.ts`.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/layout-dirty.test.ts` (new) | `false when there is no saved snapshot` | `isLayoutDirty({tables:[],notes:[]}, null)` | `false` |
| same | `false when current equals saved` | `isLayoutDirty({tables:[{name:'orders',x:1,y:2}],notes:[]}, {tables:[{name:'orders',x:1,y:2}],notes:[]})` | `false` |
| same | `true when a table position differs` | `isLayoutDirty({tables:[{name:'orders',x:5,y:2}],notes:[]}, {tables:[{name:'orders',x:1,y:2}],notes:[]})` | `true` |
| same | `true when the visible table set differs` | current adds/removes a table vs. saved | `true` |
| same | `true when a note's text/position/size differs` | current note `text:'a'` vs saved `text:'b'` | `true` |
| same | `false regardless of input array order (both sides pre-sorted via buildLayout)` | same tables/notes in different array order on each side | `false` |
| `test/unit/webview/layoutMessages.test.ts` | `cachePendingLayout calls host.setPendingLayout with the given layout and dirty flag` | `cachePendingLayout(stubHost, layout, true)` | `stubHost.setPendingLayout` called once with `(layout, true)` |
| same | `saveLayout clears the pending cache on success` | `saveLayout(stubHost, layout)` with an active layout already set | `stubHost.setPendingLayout` called with `dirty: false` after the write |
| same | remove the `writeActiveLayout` describe block | n/a | file compiles and passes without the deleted function's tests |

### Panel dispose confirmation (integration-level)

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/integration/` (extend the existing layout integration suite) | closing a panel with a dirty pending layout and choosing Save writes the file | simulate `pendingDirty = true`, an active layout, and stub `showWarningMessage` to resolve `'Save'` | the layout file on disk is rewritten with the pending layout before disposal completes |
| same | closing a panel with a dirty pending layout and choosing Don't Save leaves the file untouched | stub `showWarningMessage` to resolve `"Don't Save"` | the layout file on disk is unchanged |
| same | closing a panel with no dirty pending layout prompts nothing | `pendingDirty = false` | `showWarningMessage` is never called |

The repo has no `renderHook`/testing-library dependency today, so the plan
uses the pure-helper shape: dirty comparison is factored into
`isLayoutDirty(current: { tables: DiagramLayoutTable[]; notes: DiagramNote[] }, saved: { tables: DiagramLayoutTable[]; notes: DiagramNote[] } | null): boolean`
in a new file `webview-ui/layout-dirty.ts` (webview, pure — no `vscode`
import), tested directly with plain Vitest cases mirroring the table above.
`useLayoutPersistence` becomes a thin wrapper calling it with
`buildLayout('', tablePositions, notes)` and `savedSnapshotRef.current`.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — full suite including integration, must be green before commit.

### Do not touch

- `src/dbt/*`, `src/vscode/project.ts` — model.yml read/write path stays
  byte-identical; this feature only touches layout write-back.
- `src/diagram/layoutFile.ts` — `buildLayout`/`applyLayout`/schema unchanged.
- `src/vscode/layoutFiles.ts` — file read/write/prompt wrappers unchanged.
- The explicit save path (`saveLayout` in `layoutMessages.ts`, `layout:save`
  message, `onSaveDiagram` callback shape) — only its trigger conditions
  (button enablement) change, not its write behavior.
- Note runtime-collapse state (`collapsedNow` in `useNotes`) — already
  excluded from persistence; stays excluded from dirty tracking too (peeking
  at a note must not flag the diagram dirty).
- The no-active-layout path's dispose behavior — closing with no active
  layout never prompts, regardless of unsaved node positions, per Scope.

## Acceptance Criteria

- [x] While a layout is active, no drag, note edit, or visibility change writes
      to the `.dbtiagram.yml` file until Save is clicked.
- [x] The header button reads "No changes" and is disabled when there are no
      unsaved changes, and "Save" and is enabled as soon as something changes.
- [x] Clicking "Save" while dirty writes the current tables and notes to the
      active layout file and returns the button to disabled "No changes".
- [x] Opening a layout (including the `webview:ready` re-apply) starts with the
      button disabled ("No changes").
- [x] With no active layout, the button is unchanged: "Save diagram", enabled,
      opens the save dialog.
- [x] Model.yml edits keep writing back immediately regardless of the layout's
      dirty state.
- [x] `layout:changed` is replaced by `layout:pending`, a host-side in-memory
      cache-sync that never writes to disk by itself.
- [x] Closing the diagram panel while the cached layout is dirty shows a modal
      "Save" / "Don't Save" dialog; choosing Save writes the layout to the
      active file; choosing Don't Save (or dismissing) leaves the file as it
      was at the last explicit save.
- [x] Closing the diagram panel with no unsaved changes, or with no active
      layout, never shows a confirmation dialog.
- [x] `npm run verify` and `npm test` are green.

## Confirm at Approval

- **(a) Button copy — resolved.** Labels "No changes" (disabled) and "Save"
  (enabled) as specified.
- **(b) Close confirmation — resolved, with a platform caveat.** Because the
  panel is a plain `WebviewPanel`, VS Code cannot block the tab from closing
  pending user input; the modal dialog necessarily appears **after** the tab
  is gone, and "Save" writes to disk at that point rather than preventing the
  close. If a true pre-close blocking prompt is required, that needs a
  `CustomEditorProvider` rewrite of the panel — a materially larger change
  this spec does not attempt. Confirm the after-the-fact prompt is
  acceptable, or ask for the `CustomEditorProvider` scope to be estimated
  separately.
- **(c) `LayoutHost` growth.** `setPendingLayout`/`getPendingLayout` are added
  directly to the existing `LayoutHost` interface rather than a new port,
  keeping one adapter object as today. Confirm, or ask for a separate
  `PendingLayoutHost` port if `LayoutHost` is felt to be growing too broad.
