---
id: 16
title: Sticky notes on the diagram
status: approved
priority: medium
created: 2026-08-27
owner: unassigned
depends_on: [13, 15]
---

# Sticky notes on the diagram

## Summary

As a dbt developer documenting a diagram, I want to pin free-text notes to
specific points on the canvas — resizable rectangles I can drag anywhere, set to
display collapsed or expanded by default, and toggle with a double-click — so
that the diagram carries its own explanation. Notes are created from a toolbar
button or the canvas context menu and are stored in the diagram's
`.dbtiagram.yml` file alongside the table positions.

## Background

Spec 13 introduced `.dbtiagram.yml` as the diagram's own file, holding `version`,
`name`, and `tables[{name,x,y}]`, with live debounced write-back whenever the
user drags a table or changes visibility. Its Out of scope section explicitly
deferred "anything beyond `tables`" and noted the schema is versioned so more can
be added later. This feature is the first such addition.

The canvas is React Flow (spec 03), so a note is naturally a **custom node
type** — it inherits dragging, canvas coordinates, pan/zoom, and selection for
free, exactly like `TableNode` does. The reusable `ContextMenu` component comes
from feature 15, which must land first.

## Scope

**In scope**

- A `note` node type with free plain text, a canvas position, a size resizable
  from its bottom-right corner, and a persisted `collapsedByDefault` flag,
  draggable in both collapsed and expanded form.
- Collapsed rendering as a 28×28 icon whose tooltip is the note's first
  non-empty line; expanded rendering as the stored rectangle with in-place text
  editing committed on blur.
- Two creation paths: an "Add note" toolbar button (viewport center) and an
  "Add note here" item in the empty-canvas context menu (the clicked point).
- A note context menu with `Edit text`, `Collapse`/`Expand` (runtime only),
  `Collapsed by default` (checkable, persisted), and `Delete`.
- Persistence under a new optional `notes` key in `.dbtiagram.yml`, written
  through spec 13's existing debounced write-back and the explicit "Save
  diagram".
- Deleting a note with `Delete`/`Backspace` while it is selected, and from its
  context menu.

**Out of scope**

- Markdown or rich text, links, images, colours, or per-note styling.
- Attaching a note to a table (anchored notes that move with a node).
- Notes acting as obstacles for FK edge routing (spec 12).
- Notes in the left sidebar (no "Notes" list, no filtering by note).
- Undo/redo beyond VS Code's own undo of the `.dbtiagram.yml` file.
- Resizing from any handle other than the bottom-right corner.
- Persisting notes when no layout file is active — they live in webview state
  until the diagram is saved.

## Scenarios

### Adding a note from the toolbar

```
Given a saved diagram is open and active
When the user clicks "Add note"
Then an empty expanded note appears at the center of the viewport
And its text area has focus
When the user types "Grain: one row per order."
Then within a moment the .dbtiagram.yml file contains that note with its
  position, size, and collapsedByDefault: false
And no model.yml file is modified
```

### Adding a note by right-clicking the canvas

```
Given a saved diagram is open
When the user right-clicks an empty area of the canvas
Then a context menu appears with "Add note here"
When the user chooses it
Then a new note appears at the point that was right-clicked
```

### Dragging and resizing a note

```
Given a note exists on the diagram
When the user drags its header to a new position
Then the note follows the cursor and the layout file records the new x/y
When the user drags the bottom-right corner
Then the note resizes with the cursor at any zoom level
And it never shrinks below its minimum size
And the new width/height are written to the layout file
```

### Double-click collapse is temporary, not saved

```
Given an expanded note whose collapsedByDefault is false
When the user double-clicks it
Then it collapses to a small note icon showing its first line as a tooltip
And the .dbtiagram.yml file is NOT rewritten
When the user drags the icon
Then the collapsed note moves and its new position IS saved
When the user double-clicks the icon
Then the note expands again at its stored size
When the user closes and reopens the diagram
Then the note is expanded again, because collapsedByDefault is still false
```

### Choosing the default display state

```
Given a note that is currently expanded
When the user right-clicks it and ticks "Collapsed by default"
Then the note stays expanded on screen
And the .dbtiagram.yml file records collapsedByDefault: true
When the user closes and reopens the diagram
Then the note is rendered as a collapsed icon
```

### Notes are restored when the diagram is reopened

```
Given a saved diagram with one note whose collapsedByDefault is false and one
  whose collapsedByDefault is true
When the user closes the diagram panel and reopens the .dbtiagram.yml
Then both notes reappear at their stored positions and sizes
And the first renders expanded and the second renders as a collapsed icon
And the tables are restored exactly as before
```

### Deleting a note

```
Given a note is selected on the diagram
When the user presses Delete
Then the note disappears
And it is removed from the layout file
When the user instead right-clicks a note and chooses "Delete"
Then the same happens
```

### Notes do not interfere with tables

```
Given a note overlaps a table on the canvas
Then the table is drawn on top of the note
And FK edges route exactly as they did before the note was added
And the note appears nowhere in the Models filter list
And dragging tables is unaffected
```

### Notes in a diagram with no layout file yet

```
Given the diagram was opened from a model.yml and no layout is active
When the user adds a note and types into it
Then the note works fully on the canvas
And nothing is written to disk
When the user clicks "Save diagram" and names the file
Then the saved .dbtiagram.yml contains the note
```

### An older diagram file still opens

```
Given a .dbtiagram.yml written before this feature, with no notes key
When the user opens it
Then it loads with no notes and no error
And the next write does not add an empty notes key
```

### A malformed note entry is reported

```
Given a .dbtiagram.yml whose notes array contains an entry with no id
When the user opens it
Then the diagram reports a parse error naming the "notes" problem
And no partial layout is applied
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/layoutFile.ts` | modify | `DiagramNote`, note constants, `createNote`; notes in `DiagramLayout`, `buildLayout`, `serializeDiagramLayout`, `parseDiagramLayout`, `applyLayout`. |
| `webview-ui/NoteNode.tsx` | create | The `note` React Flow node: expanded rectangle, collapsed icon, textarea, resize grip. |
| `webview-ui/hooks/useNotes.ts` | create | Note state: the persisted notes array, the runtime collapse map, node projection, and every mutation callback. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Accept the notes array; include it in `buildLayout` for both the explicit save and the debounced write-back. |
| `webview-ui/DiagramCanvas.tsx` | modify | Register the `note` node type, render note nodes behind tables, split node changes, `onPaneContextMenu`, Delete-key handling. |
| `webview-ui/App.tsx` | modify | "Add note" toolbar button; wire `useNotes`, the canvas/note context menus, and `layout:apply` notes. |
| `webview-ui/styles.css` | modify | `.note`, `.note__header`, `.note__text`, `.note__grip`, `.note--collapsed`. |
| `fixtures/sample-dbt/diagrams/orders.dbtiagram.yml` | modify | Add one expanded-by-default and one collapsed-by-default note. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Cover every new parse/serialize/default/clamp rule. |
| `test/unit/fixture.test.ts` | modify | Assert the fixture diagram's notes parse with in-range values. |
| `specs/ARCHITECTURE.md` | modify | Update the `layoutFile.ts` exports row; add `NoteNode.tsx` and `useNotes.ts`. |

### Signatures

```ts
// src/diagram/layoutFile.ts  (pure — must not import `vscode`)
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

export interface DiagramLayout {
  version: typeof LAYOUT_VERSION;
  name: string;
  tables: DiagramLayoutTable[];
  /** Always present in memory; `[]` when the file has no notes. */
  notes: DiagramNote[];
}

export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
  notes?: readonly DiagramNote[], // default []
): DiagramLayout;

/** A default-sized empty note. `id` is supplied so this stays pure. */
export function createNote(x: number, y: number, id: string): DiagramNote;

export interface AppliedLayout {
  visible: Set<string>;
  positions: Map<string, NodePosition>;
  missing: string[];
  /** Passed through untouched — notes reference nothing in the workspace. */
  notes: DiagramNote[];
}
```

```ts
// webview-ui/hooks/useNotes.ts  (webview)
import type { Node, NodeChange } from '@xyflow/react';
import type { DiagramNote } from '../../src/diagram/layoutFile';

export interface NotesState {
  /** The persisted notes, in insertion order. */
  notes: DiagramNote[];
  /** React Flow nodes of type 'note', carrying data + callbacks. */
  noteNodes: Node[];
  noteIds: ReadonlySet<string>;
  /** Applies position/select/remove changes that belong to notes. */
  applyNoteNodeChanges: (changes: NodeChange[]) => void;
  /** Creates a note at canvas coordinates and returns its new id. */
  addNote: (x: number, y: number) => string;
  updateNoteText: (id: string, text: string) => void;
  resizeNote: (id: string, width: number, height: number) => void;
  deleteNote: (id: string) => void;
  setCollapsedByDefault: (id: string, value: boolean) => void;
  /** Runtime-only toggle; never persisted. */
  toggleCollapsedNow: (id: string) => void;
  isCollapsed: (id: string) => boolean;
  /** Seeds from an opened layout and resets every runtime collapse state. */
  applyLayoutNotes: (notes: DiagramNote[]) => void;
  /** Ids of currently selected notes, for the Delete key. */
  selectedNoteIds: string[];
}

export function useNotes(): NotesState;
```

```ts
// webview-ui/NoteNode.tsx  (webview)
export interface NoteNodeData extends Record<string, unknown> {
  note: DiagramNote;
  collapsed: boolean;
  onTextChange: (id: string, text: string) => void;
  onResize: (id: string, width: number, height: number) => void;
  onToggleCollapsed: (id: string) => void;
}

export function NoteNode(props: NodeProps): JSX.Element;
```

```ts
// webview-ui/hooks/useLayoutPersistence.ts  (webview) — changed signature
export function useLayoutPersistence(
  notes: readonly DiagramNote[],
): LayoutPersistenceState;
```

```ts
// webview-ui/DiagramCanvas.tsx  (webview) — added props
//   noteNodes: Node[];
//   noteIds: ReadonlySet<string>;
//   onNoteNodeChanges: (changes: NodeChange[]) => void;
//   onPaneContextMenu: (event: ReactMouseEvent) => void;
//   onDeleteSelectedNotes: () => void;
```

### Behavior notes

- **Schema stays `version: 1`.** `notes` is optional, so files written before
  this feature load unchanged and files written by this version still load in
  older builds (which drop the unknown key). (Scenario: *An older diagram file
  still opens*.)
- **`parseDiagramLayout` note rules**, in this order per entry, with these
  literal messages (all raised as `DiagramLayoutParseError`):
  - `notes` missing ⇒ `[]`. `notes` present but not an array ⇒
    `Diagram file "notes" must be an array`.
  - entry not a mapping ⇒ `Every entry in "notes" must be a mapping`.
  - `id` not a non-empty string ⇒ `Every note entry needs an "id"`.
  - `text` present and not a string ⇒ `Note "<id>" needs a string "text"`;
    missing `text` ⇒ `''`.
  - `x`/`y` not finite numbers ⇒
    `Note "<id>" needs numeric "x" and "y" coordinates`.
  - `width`/`height` missing ⇒ `NOTE_DEFAULT_WIDTH` / `NOTE_DEFAULT_HEIGHT`;
    present but not finite numbers ⇒ `Note "<id>" needs numeric "width" and "height"`.
  - `collapsedByDefault` missing ⇒ `false`; present but not a boolean ⇒
    `Note "<id>" needs a boolean "collapsedByDefault"`.
  - Sizes are then clamped with `Math.max(value, NOTE_MIN_*)`.
  - Duplicate `id`s keep the **first** entry and skip the rest, mirroring the
    existing duplicate-table rule.
- **`serializeDiagramLayout`** writes `notes` **after** `tables`, each entry with
  the key order `id`, `text`, `x`, `y`, `width`, `height`, `collapsedByDefault`.
  The `notes` key is **omitted entirely** when the array is empty, so existing
  files are not churned.
- **`buildLayout`** sorts notes by `id` ascending and rounds `x`, `y`, `width`,
  `height` with `Math.round`, exactly as it already does for tables.
- **`createNote(x, y, id)`** returns
  `{ id, text: '', x, y, width: NOTE_DEFAULT_WIDTH, height: NOTE_DEFAULT_HEIGHT,
  collapsedByDefault: false }` — no rounding (that is `buildLayout`'s job).
- **`applyLayout`** copies `layout.notes` into its result unchanged; table
  reconciliation is untouched.
- **Two distinct collapse values.** `note.collapsedByDefault` is persisted and
  decides rendering the moment a diagram is opened. A webview-only
  `collapsedNow: Map<string, boolean>` inside `useNotes` is the runtime state;
  `toggleCollapsedNow` and the `Collapse`/`Expand` menu item change **only**
  that, so peeking into a note never writes to disk. `isCollapsed(id)` returns
  `collapsedNow.get(id) ?? note.collapsedByDefault`. `applyLayoutNotes` clears
  `collapsedNow` entirely. (Scenarios: *Double-click collapse is temporary*,
  *Choosing the default display state*.)
- **Note ids** are generated in `useNotes` as `` `n-${hex}` `` where `hex` is 6
  lowercase hex characters from `crypto.getRandomValues`. Generation stays out of
  the pure module.
- **Persistence wiring.** `useLayoutPersistence(notes)` adds `notes` to the
  debounced (400 ms) `layout:changed` effect's dependency list and passes it to
  `buildLayout` in both `onSaveDiagram` and the effect. Runtime collapse state is
  **not** a dependency and writes nothing. The existing `writeArmedRef` guard is
  unchanged, so opening a diagram still cannot truncate its file.
- **`layout:apply`** wiring in `App.tsx` calls both
  `filter.applyLayoutTables(layout.applyLayout(message))` and
  `notesState.applyLayoutNotes(message.layout.notes)`.
- **Canvas integration.** `DiagramCanvas` keeps `rfNodes` as **tables only**:
  `nodeRects`, `routeEdges`, `mergeFlowNodes`, the fit effect, and the
  `onPositionsChange` report all continue to see only tables, so notes never
  affect layout or FK routing. It renders `[...noteNodes, ...liveNodes]` so notes
  paint first; note nodes carry `zIndex: 0` (or `5` when selected) and table
  nodes `zIndex: 1`. (Scenario: *Notes do not interfere with tables*.)
- **`onNodesChange`** partitions incoming changes by `noteIds.has(change.id)`:
  note changes go to `onNoteNodeChanges`, the rest to `setRfNodes` via
  `applyNodeChanges`. Changes without an `id` field go to the table branch.
- Note nodes are `selectable: true` while tables keep the app's own selection
  model; `elementsSelectable` stays `false` on `<ReactFlow>` and note selection
  is tracked by React Flow node `selected` flags applied through
  `applyNoteNodeChanges`.
- **Delete key.** `DiagramCanvas` listens for `keydown` of `Delete` or
  `Backspace` on its container and calls `onDeleteSelectedNotes()` when the event
  target is not an input/textarea and at least one note is selected.
- **`NoteNode` expanded** renders `<div className="note" style={{ width, height }}>`
  with a `.note__header` acting as the React Flow `dragHandle`, a
  `.note__text` `<textarea>` whose value is local state committed to
  `onTextChange` on blur, and a `.note__grip`. The textarea and the grip carry
  the `nodrag nowheel` classes so typing and resizing never pan the canvas or
  drag the node.
- **The grip** uses `setPointerCapture` and divides the pointer delta by the
  current React Flow zoom (`useReactFlow().getZoom()`) so it tracks the cursor at
  any zoom; the result is clamped to `NOTE_MIN_WIDTH`/`NOTE_MIN_HEIGHT` and
  reported through `onResize` on pointer-up. (Scenario: *Dragging and resizing*.)
- **`NoteNode` collapsed** renders a 28×28 `<button className="note note--collapsed">`
  with a note glyph and `title` = the note's first non-empty line, or
  `Empty note` when the text is blank. It is draggable as a whole.
- `onDoubleClick` on either form calls `onToggleCollapsed(id)` only.
- **Menus.** `onPaneContextMenu` (which `preventDefault()`s) opens the feature 15
  `ContextMenu` with a single `Add note here` item placed at
  `screenToFlowPosition({ x: event.clientX, y: event.clientY })`.
  `onNodeContextMenu` filtered to `node.type === 'note'` opens
  `Edit text`, `Collapse` or `Expand` (whichever applies to the current runtime
  state), `Collapsed by default` (`checked: note.collapsedByDefault`), and
  `Delete`. `node.type === 'table'` keeps the feature 15 menu. All menus close on
  Escape, outside pointerdown, and scroll, per feature 15.
- **Toolbar.** An `Add note` button sits next to `Save diagram` in the
  `app__header`. It creates the note at `screenToFlowPosition` of the canvas
  rect's center, selects it, and focuses its textarea.
- With **no active layout**, notes live in webview state only and the first
  "Save diagram" writes them; nothing else changes. (Scenario: *Notes in a
  diagram with no layout file yet*.)

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/layoutFile.test.ts` | `round-trips a layout with notes` | layout with `tables: []` and one note `{id:'n-1',text:'Grain: one row per order.',x:10,y:20,width:240,height:140,collapsedByDefault:false}` | `parseDiagramLayout(serializeDiagramLayout(layout), 'd')` deep-equals the layout |
| `test/unit/diagram/layoutFile.test.ts` | `parses a file with no notes key as an empty array` | `"version: 1\nname: d\ntables: []\n"` | `.notes` is `[]` |
| `test/unit/diagram/layoutFile.test.ts` | `omits the notes key when there are none` | `serializeDiagramLayout(buildLayout('d', []))` | output does not contain `notes` |
| `test/unit/diagram/layoutFile.test.ts` | `sorts notes by id and rounds coordinates and sizes` | `buildLayout('d', [], [{id:'n-b',...,x:10.6,y:20.4,width:200.5,height:100.4,...},{id:'n-a',...}])` | notes are `['n-a','n-b']`; the `n-b` entry has `x:11, y:20, width:201, height:100` |
| `test/unit/diagram/layoutFile.test.ts` | `defaults a missing collapsedByDefault to false` | note entry without the key | `.collapsedByDefault === false` |
| `test/unit/diagram/layoutFile.test.ts` | `defaults missing width and height` | note entry without `width`/`height` | `{ width: 220, height: 120 }` |
| `test/unit/diagram/layoutFile.test.ts` | `clamps below-minimum sizes` | note with `width: 10, height: 10` | `{ width: 120, height: 64 }` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a non-array notes key` | `"version: 1\nname: d\ntables: []\nnotes: nope\n"` | throws `DiagramLayoutParseError` with message `Diagram file "notes" must be an array` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a note entry that is not a mapping` | `notes: ['x']` | message `Every entry in "notes" must be a mapping` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a note with no id` | note entry `{x: 1, y: 2}` | message `Every note entry needs an "id"` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a non-string text` | note `{id:'n-1', text: 5, x:1, y:2}` | message `Note "n-1" needs a string "text"` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects non-finite coordinates` | note `{id:'n-1', x:'a', y:2}` | message `Note "n-1" needs numeric "x" and "y" coordinates` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a non-boolean collapsedByDefault` | note `{id:'n-1', x:1, y:2, collapsedByDefault:'yes'}` | message `Note "n-1" needs a boolean "collapsedByDefault"` |
| `test/unit/diagram/layoutFile.test.ts` | `keeps the first of duplicate note ids` | two notes with `id: 'n-1'`, texts `'first'` and `'second'` | one note, `text === 'first'` |
| `test/unit/diagram/layoutFile.test.ts` | `createNote returns a default-sized empty note` | `createNote(30, 40, 'n-7')` | `{id:'n-7',text:'',x:30,y:40,width:220,height:120,collapsedByDefault:false}` |
| `test/unit/diagram/layoutFile.test.ts` | `applyLayout passes notes through and still reconciles tables` | layout with tables `['orders','ghost']` and one note, known models `{'orders'}` | `visible` is `{'orders'}`, `missing` is `['ghost']`, `notes` deep-equals the input note array |
| `test/unit/fixture.test.ts` | `the fixture diagram notes parse with sane values` | `fixtures/sample-dbt/diagrams/orders.dbtiagram.yml` | 2 notes; ids non-empty; `width >= 120`, `height >= 64`; exactly one has `collapsedByDefault === true` |

Scenario coverage: *Adding a note from the toolbar*, *Adding a note by
right-clicking*, *Dragging and resizing*, *Double-click collapse is temporary*,
*Choosing the default display state*, *Deleting a note*, *Notes do not interfere
with tables*, and *Notes in a diagram with no layout file yet* are React webview
behaviors with no unit-test harness in this repo (matching spec 11) and are
verified in the Manual Verify step; their **persisted** halves are covered by the
`layoutFile.test.ts` rows above. *Notes are restored when reopened* maps to the
round-trip and `applyLayout` rows plus the fixture row; *An older diagram file
still opens* maps to the no-notes-key and omits-the-key rows; *A malformed note
entry is reported* maps to the reject rows.

### Verification

1. `npm run verify` — typecheck + unit suites, must be green. Every pre-existing
   `layoutFile.test.ts` case must still pass unchanged.
2. `npm test` — before the commit, must be green.
3. Manual (F5 on `fixtures/sample-dbt`, open `diagrams/orders.dbtiagram.yml`):
   both fixture notes render in their stored states; add, drag, resize, edit,
   collapse, and delete a note and confirm the file contents.

### Do not touch

- `src/dbt/**` — notes never touch a `model.yml`.
- `src/shared/protocol.ts` — no new message types; `layout:save`,
  `layout:changed` and `layout:apply` already carry a whole `DiagramLayout`.
- `src/diagram/graph.ts`, `layout.ts`, `positions.ts`, `routing.ts`, `flow.ts` —
  notes are excluded from dagre layout, position merging, and FK routing.
- `src/shared/filter.ts` and `webview-ui/FilterSidebar.tsx` — notes never appear
  in the sidebar.
- `LAYOUT_VERSION`, `LAYOUT_FILE_SUFFIX`, `isLayoutFilePath`,
  `defaultLayoutName`, `stripLayoutSuffix`, and the existing table parse/
  serialize rules — all must stay byte-compatible.
- The `writeArmedRef` guard in `useLayoutPersistence`.

## Acceptance Criteria

- [ ] A note can be created from an "Add note" toolbar button and from an
      "Add note here" item in the empty-canvas context menu, at the viewport
      center and at the clicked point respectively.
- [ ] A note is draggable in both expanded and collapsed form, and resizable from
      its bottom-right corner, clamped to 120×64, correct at any zoom.
- [ ] Double-click toggles the **runtime** collapsed state only and writes
      nothing to disk; collapsed shows a 28×28 icon with the first non-empty line
      as its tooltip.
- [ ] `collapsedByDefault` is changed only by the note context menu's checkable
      item and decides how the note renders when the diagram is opened.
- [ ] A note's text is editable in place and committed on blur.
- [ ] Notes are deletable via the Delete key and via their context menu.
- [ ] Notes persist under an optional `notes` array (`id`, `text`, `x`, `y`,
      `width`, `height`, `collapsedByDefault`), sorted by `id`, with integer
      values, through the existing debounced write-back and the explicit save;
      the key is omitted when there are no notes.
- [ ] Files written before this feature load unchanged and the schema stays at
      `version: 1`.
- [ ] Notes never affect table layout, FK edge routing, the filter sidebar, or
      any `model.yml`.
- [ ] `src/diagram/layoutFile.ts` stays pure and every new parse/serialize/
      default/clamp rule is covered by Vitest unit tests; all existing
      `layoutFile.test.ts` cases still pass.
- [ ] `specs/ARCHITECTURE.md` reflects the new and changed modules.
- [ ] `npm run verify` is green.

## Confirm at Approval

- **(a) Schema stays `version: 1`** with an optional `notes` key, keeping forward
  and backward compatibility. The alternative — bumping to `version: 2` — would
  make older builds reject the file outright. Confirm the non-breaking choice.
- **(b) Notes without an active layout** are fully usable but unsaved until the
  diagram is saved, matching how table positions already behave. Confirm, or ask
  for "Add note" to prompt for a save first.
- **(c) Defaults.** New note 220×120, empty, `collapsedByDefault: false`; minimum
  120×64; collapsed icon 28×28. Say if you want different numbers.
- **(d) Z-order.** Notes render behind tables so a note can never hide a table.
  Confirm, or ask for notes on top.
