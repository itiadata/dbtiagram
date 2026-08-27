---
id: 16
title: Sticky notes on the diagram
status: approved
priority: medium
created: 2026-08-27
owner: unassigned
depends_on: [13]
---

# Sticky notes on the diagram

## Summary

As a dbt developer documenting a diagram, I want to **pin free-text notes to
specific points on the canvas**. A note is a resizable rectangle of text that I
can drag anywhere, resize from its bottom-right corner, and set to display
**collapsed** (just a note icon) or **expanded** by default. Double-clicking
toggles between the two. Notes are created from a toolbar button or by
right-clicking empty canvas space, and they are stored in the diagram's
`.dbtiagram.yml` file alongside the table positions.

## Background

Spec 13 introduced `.dbtiagram.yml` as the diagram's own file, holding
`version`, `name`, and `tables[{name,x,y}]`, with live debounced write-back
whenever the user drags a table or changes visibility. Its Out of scope section
explicitly deferred "anything beyond `tables`" and noted the schema is versioned
so more can be added later. This feature is the first such addition.

The canvas is React Flow (spec 03), so a note is naturally a **custom node
type** — it inherits dragging, canvas coordinates, pan/zoom, and selection for
free, exactly like `TableNode` does.

## Scope

- **A `note` node type** on the canvas with:
  - free text (multi-line, plain text — no markdown rendering),
  - a position (`x`/`y` in canvas coordinates),
  - a size (`width`/`height`) resizable by dragging the **bottom-right corner**,
  - a **`collapsedByDefault`** flag deciding how the note renders when the
    diagram is opened, independent of the runtime collapsed/expanded state that
    double-click toggles,
  - drag support in **both** states (the collapsed icon is draggable too).
- **Collapsed rendering**: a small fixed-size square (28×28) showing a note
  icon, with the note's first line as its tooltip.
- **Expanded rendering**: the rectangle at its stored size, showing the text.
  Clicking into the text starts editing it in place; blur commits.
- **Two creation paths**:
  - an **"Add note"** button in the diagram toolbar — places a note at the
    center of the current viewport,
  - a **canvas context menu** on empty space with an "Add note here" item —
    places the note at the right-clicked point (converted to canvas
    coordinates).
- **A note context menu** (right-click on a note) with `Edit text`,
  `Collapse` / `Expand` (the runtime state), `Collapsed by default` (a checkable
  item writing the stored flag), and `Delete`.
- **Persistence** in `.dbtiagram.yml` under a new optional `notes` key
  (Implementation Notes §1), written through spec 13's existing debounced
  live write-back and included in the explicit "Save diagram" action.
- **Deleting a note** with the `Delete`/`Backspace` key while it is selected, as
  well as from its context menu.

### Out of scope

- Markdown or rich text, links, images, colours, or per-note styling.
- Attaching a note to a table (anchored/child notes that move with a node).
- Notes acting as obstacles for FK edge routing (spec 12) — edges route as if
  notes were not there.
- Notes in the left sidebar (no "Notes" list, no filtering by note).
- Undo/redo of note operations beyond VS Code's own undo of the `.dbtiagram.yml`
  file.
- Resizing from any handle other than the bottom-right corner.
- Notes when **no** layout file is active: they are still fully usable but exist
  only in webview state until the diagram is saved (see Confirm at Approval (c)).

## Implementation Notes

### 1. File format (`src/diagram/layoutFile.ts`)

The schema stays at `version: 1` and gains an **optional** `notes` array, so
existing files keep loading unchanged and files written by this version keep
loading in the previous one (which simply drops the unknown key).

```yaml
version: 1
name: Order marts
tables:
  - name: orders
    x: 120
    y: 40
notes:
  - id: n-3f2a91
    text: |-
      Grain: one row per order.
      Backfilled 2026-06.
    x: 480
    y: -120
    width: 240
    height: 140
    collapsedByDefault: false
```

The file stores `collapsedByDefault`, **not** the runtime state: double-clicking
a note to peek at it never rewrites the file (see §4).

New pure API, all additive:

```ts
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
```

- `DiagramLayout` gains `notes: DiagramNote[]` (always present in memory, `[]`
  when the file has none).
- `parseDiagramLayout` accepts a missing `notes` key as `[]`, rejects a
  non-array `notes`, and for each entry requires a non-empty string `id`, a
  string `text`, finite numeric `x`/`y`/`width`/`height`, and a boolean
  `collapsedByDefault` (missing `collapsedByDefault` defaults to `false`;
  missing `width`/`height` default to the constants above). Sizes are clamped to
  the minimums. Duplicate `id`s keep the first entry. Any other invalid entry
  raises `DiagramLayoutParseError` with a message naming the note id.
- `serializeDiagramLayout` writes `notes` **after** `tables`, with the key order
  `id`, `text`, `x`, `y`, `width`, `height`, `collapsedByDefault`, sorted by `id`
  for stable diffs. The key is **omitted entirely** when there are no notes, so
  existing files are not churned.
- `buildLayout(name, visible, notes = [])` gains a third parameter; it rounds
  note coordinates and sizes to integers exactly as it does table coordinates.
- `applyLayout` returns the notes untouched in a new `notes: DiagramNote[]`
  field (notes have no workspace reconciliation — they reference nothing).
- `export function createNote(x: number, y: number, id: string): DiagramNote` —
  a default-sized, empty note at the given point with
  `collapsedByDefault: false`. `id` is supplied by the caller so the function
  stays pure and testable; the webview passes a `n-<random hex>` value.

### 2. Protocol (`src/shared/protocol.ts`)

No new message types. `layout:save` / `layout:changed` / `layout:apply` already
carry a whole `DiagramLayout`, which now includes `notes`.

### 3. Node type (`webview-ui/NoteNode.tsx`)

- Registered in the `nodeTypes` map as `note` next to the existing `table` type.
- Node `data` is the `DiagramNote`, its runtime collapsed state, plus callbacks
  for text/size/collapse changes.
- Expanded: a `<div className="note">` with `width`/`height` from the node data,
  a header strip used as the React Flow drag handle, a `<textarea>` for the
  text, and a bottom-right resize grip.
  - The grip uses pointer events (`setPointerCapture`) and divides the pointer
    delta by the current React Flow zoom so resizing tracks the cursor at any
    zoom level; the resulting size is clamped to `NOTE_MIN_*`.
  - The `<textarea>` and the grip set `nodrag`/`nowheel` so typing and resizing
    do not pan the canvas or drag the node.
- Collapsed: a 28×28 button showing a note glyph, `title` = the note's first
  non-empty line (or "Empty note"), draggable as a whole.
- `onDoubleClick` on either form toggles the **runtime** collapsed state only
  (§4); it does not touch `collapsedByDefault` and triggers no file write.
- Notes render **behind** table nodes (a lower `zIndex`) unless selected, so a
  note never hides a table.
- Notes are excluded from everything that reasons about tables: dagre layout
  (`src/diagram/layout.ts` input), `mergeFlowNodes`' table-position merge, FK
  edge building and routing, and `buildLayout`'s `tables` argument. The webview
  keeps notes in a separate `notes` state array and concatenates them into the
  React Flow node array at render time.

### 4. Collapse semantics

There are **two distinct** values:

- `note.collapsedByDefault` — persisted in `.dbtiagram.yml`. It decides how the
  note renders the moment a diagram is opened or a layout is applied.
- a webview-only `collapsedNow: Map<noteId, boolean>` — the runtime state.
  Double-click toggles **this** and nothing else, so peeking into a note (or
  collapsing one to get it out of the way) **never** writes to disk and never
  changes what a teammate sees when they open the file.

On `layout:apply`, `collapsedNow` is reset so every note's runtime state equals
its `collapsedByDefault`. The note context menu's checkable
`Collapsed by default` item is the **only** control that writes the persisted
flag; toggling it does not change the current runtime state (the note stays as
it is on screen). The `Collapse`/`Expand` item is a synonym for double-click and
is likewise not persisted.

### 5. Creation and the canvas context menu (`webview-ui/App.tsx`)

- Toolbar: an **"Add note"** button next to the existing "Save diagram" button.
  It creates a note at the viewport center via
  `screenToFlowPosition(centerOfCanvasRect)`, selects it, and focuses its
  textarea for immediate typing.
- Canvas context menu: `onPaneContextMenu` on `<ReactFlow>` (which
  `preventDefault()`s) opens the same lightweight menu component introduced in
  spec 15, containing `Add note here`. The click point is converted with
  `screenToFlowPosition`.
- Note context menu: `onNodeContextMenu`, filtered to `node.type === 'note'`,
  with `Edit text`, `Collapse`/`Expand` (runtime only), `Collapsed by default`
  (checkable, persisted), and `Delete`.
- Table-node context menu: `onNodeContextMenu` filtered to `node.type ===
  'table'` opens the menu specified in feature 15 §3 (`Open in model.yml`).
- All menus close on Escape, outside pointerdown, canvas pan, and zoom.

### 6. Persistence wiring

- The existing debounced (400 ms) `layout:changed` effect from spec 13 §8 gains
  the notes array as a dependency, so creating, dragging, resizing, editing,
  deleting a note, or changing its `collapsedByDefault` rewrites the active
  layout file. Typing in a note therefore autosaves 400 ms after the last
  keystroke. Runtime collapse toggles are **not** a dependency and write
  nothing.
- `layout:save` includes the notes.
- `layout:apply` seeds the notes state from `layout.notes` and resets every
  note's runtime collapsed state to its `collapsedByDefault`.
- With no active layout, notes live in webview state only; the first
  "Save diagram" writes them.

### 7. Styles (`webview-ui/styles.css`)

`.note`, `.note__header`, `.note__text`, `.note__grip`, `.note--collapsed`, and
the shared `.context-menu` rules (shared with spec 15). Colours come from the
existing VS Code theme variables; the note uses the editor widget background
with a subtle border, and the collapsed icon uses the same accent as the toolbar
buttons.

### 8. Fixture

`fixtures/sample-dbt/diagrams/orders.dbtiagram.yml` gains one note with
`collapsedByDefault: false` and one with `collapsedByDefault: true` so F5
debugging exercises both states.
`test/unit/fixture.test.ts` asserts the file parses and that its notes have
sane, in-range values.

### 9. Tests (`test/unit/diagram/layoutFile.test.ts`)

- Round-trip: a layout with notes serializes and re-parses identically.
- A file with **no** `notes` key parses to `notes: []`.
- A layout with no notes serializes **without** a `notes` key.
- Notes are sorted by `id` and coordinates/sizes rounded on write.
- Defaults: missing `collapsedByDefault` → `false`; missing `width`/`height` →
  the constants; below-minimum sizes clamp to `NOTE_MIN_*`.
- Rejects: non-array `notes`, an entry that is not a mapping, a missing/empty
  `id`, a non-string `text`, non-finite coordinates — each with a message naming
  the note.
- Duplicate ids keep the first entry.
- `createNote` returns a default-sized, empty note with
  `collapsedByDefault: false` at the given point.
- `applyLayout` passes notes through unchanged and still reconciles tables.
- Every existing `layoutFile.test.ts` case keeps passing unchanged.

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

## Acceptance Criteria

- [ ] A note can be created from an "Add note" toolbar button and from an
      "Add note here" item in the empty-canvas context menu, at the viewport
      center and at the clicked point respectively.
- [ ] A note is draggable in both expanded and collapsed form, and resizable from
      its bottom-right corner, clamped to a minimum size, correct at any zoom.
- [ ] Double-click toggles the **runtime** collapsed state only and writes
      nothing to disk; collapsed shows only a note icon with the first line as
      its tooltip.
- [ ] A note's persisted `collapsedByDefault` is changed only by its context
      menu's checkable item, and decides how the note renders when the diagram is
      opened.
- [ ] A note's text is editable in place and committed on blur.
- [ ] Notes are deletable via the Delete key and via their context menu.
- [ ] Right-clicking a table node opens the feature 15 menu with
      "Open in model.yml".
- [ ] Notes persist in `.dbtiagram.yml` under an optional `notes` array
      (`id`, `text`, `x`, `y`, `width`, `height`, `collapsedByDefault`), sorted
      by `id`, with integer coordinates, written through the existing debounced
      write-back and the explicit save; the key is omitted when there are no
      notes.
- [ ] `.dbtiagram.yml` files written before this feature load unchanged, and the
      schema stays at `version: 1`.
- [ ] Notes never affect table layout, FK edge routing, the filter sidebar, or
      any `model.yml`.
- [ ] `src/diagram/layoutFile.ts` stays pure (no `vscode` import) and every new
      parse/serialize/default/clamp rule is covered by sub-second Vitest unit
      tests; all existing `layoutFile.test.ts` cases still pass.
- [ ] `npm test` and `npm run typecheck` pass; `src/dbt/*` is unchanged.

## Confirm at Approval

- **(a) Schema stays `version: 1` with an optional `notes` key.** This keeps
  forward and backward compatibility (older builds ignore the key). The
  alternative is bumping to `version: 2`, which would make older builds reject
  the file outright. Confirm the non-breaking choice.
- **(b) `collapsedByDefault` is separate from the runtime state.** *(Confirmed.)*
  The file stores only `collapsedByDefault`; double-click toggles a webview-only
  state and never writes to disk. Opening a diagram always renders each note per
  its stored default.
- **(c) Notes without an active layout.** They are fully usable but unsaved until
  the diagram is saved, matching how table positions already behave. Confirm, or
  ask for "Add note" to prompt for a save first.
- **(d) Plain text only.** No markdown, colours, or per-note styling in v1.
- **(e) Defaults.** New note: 220×120, `collapsedByDefault: false`, empty;
  minimum 120×64; collapsed icon 28×28. Say if you want different numbers.
- **(f) Z-order.** Notes render behind tables so a note can never hide a table.
  Confirm, or ask for notes on top.
- **(g) Shared context-menu component.** *(Confirmed: table nodes get the
  "Open in model.yml" menu.)* The canvas, note, and table menus all reuse the
  menu component specified in feature 15 §3, so feature 15 must land first.
