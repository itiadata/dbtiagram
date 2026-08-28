---
id: 26
title: Draw a foreign key with the mouse
status: implemented
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [08, 16]
---

# Draw a foreign key with the mouse

## Summary

As a dbt developer modeling relationships visually, I want to click a
top-left "Add foreign key" button, then draw a line from a child table's
column to a parent table's column, so a real (enforced) foreign key is
created without opening the details sidebar or hand-editing YAML. I also want
a matching top-left "Add note" button (spec 16 only ever shipped the
context-menu path), and once the FK is created I want it highlighted in the
details sidebar exactly like double-clicking an FK edge already does.

## Background

Spec 08 made FKs editable, but only from the details sidebar's Foreign keys
section (`createForeignKey` persists an FK atomically with its first column
pair — this feature reuses that same edit unchanged). Spec 09 merged made
every column a fully-mounted (if often invisible) React Flow handle, but
`nodesConnectable={false}` on `<ReactFlow>` (`DiagramCanvas.tsx`) means
dragging from a handle currently does nothing — there is no mouse-driven way
to create an FK today. Spec 16 promised an "Add note" toolbar button in its
Scope section, but only the context-menu path ("Add note here") was actually
wired into `App.tsx`; this feature adds the missing button alongside the new
one, since both are simple top-left mode-entry buttons.

Rather than teach React Flow's connection system a "child → parent" click
grammar, this feature adds a small explicit mode: a two-click gesture (click
the source/child column, then click the target/parent column) with a
mouse-follow preview line so the interaction still feels like "drawing a
line," plus Escape/click-away to cancel. This avoids any change to
`nodesConnectable` or the handle plumbing spec 09/12 rely on.

## Scope

**In scope**

- A new top-left floating toolbar (`Panel position="top-left"`, mirroring the
  existing top-right `canvas-toolbar`) with two buttons: **Add note** (creates
  a note at the viewport center — the toolbar path spec 16 described but never
  wired up) and **Add foreign key**.
- Clicking **Add foreign key** enters "FK create mode": the cursor becomes a
  crosshair over the canvas, a hint banner explains the two clicks required,
  and the button itself turns into a **Cancel** control.
- Clicking a column while in this mode, with no source picked yet, marks it as
  the FK's source (child) column: it renders selected and a line follows the
  mouse from that column to the pointer.
- Clicking a second column commits the FK — a real (non-virtual), single-pair
  `createForeignKey` edit from the first column to the second — selects the
  source (child) table in the details sidebar, and focuses/highlights the new
  FK in its Foreign keys section exactly like double-clicking an FK edge does
  (spec 08).
- The mode exits automatically the instant a full pair is committed (a single
  FK per activation, as requested).
- **Escape**, at any point in the gesture (mode active with no source, or with
  a source already picked), exits FK create mode with nothing written.
  Clicking empty canvas (the pane) also exits the mode without writing
  anything, mirroring Escape.
- Self-referencing FKs (source and target column on the same table) are
  allowed — clicking a second column on the same table the source came from
  completes the FK exactly like a cross-table pair.
- Re-clicking the exact same column that was just picked as source is a no-op
  (mode stays active, waiting for a different column).

**Out of scope**

- Dragging from a handle dot (`nodesConnectable` stays `false`); the gesture
  is click, click — not click-and-drag.
- Virtual FK creation from the mouse gesture (always creates a real FK; the
  Virtual checkbox in the sidebar still exists for converting it afterward).
- Picking which column-pair *side* (left/right) the temporary line's source
  end renders from — it always tracks toward the current mouse position (see
  Behavior notes), matching the existing FK edge router's side-choice spirit
  without duplicating its full obstacle-aware logic.
- Any change to `createForeignKey`, `setForeignKeyColumns`, or any other
  `src/dbt/edit/foreignKey.ts` export — this feature only calls the existing
  `createForeignKey` edit kind.
- Multi-pair gestures (drawing several pairs for one FK in one activation) —
  add more pairs afterward from the Foreign keys section, as today.
- Any change to the existing "Add foreign key" flow in the Foreign keys
  section (target picker + draft cards) — both creation paths coexist.

## Scenarios

### Drawing a foreign key between two tables

```
Given the dbt Diagram is open showing "order_items" and "orders"
When the user clicks "Add foreign key"
Then the button becomes "Cancel" and a hint banner asks for the source column
And the canvas cursor becomes a crosshair
When the user clicks the "order_id" column on "order_items"
Then that row renders selected and a line follows the pointer from it
And the hint banner now asks for the target column
When the user clicks the "order_id" column on "orders"
Then order_items.yml gains a foreign_key constraint with to: ref('orders'),
  columns: [order_id], to_columns: [order_id]
And FK create mode exits automatically
And the order_items table is selected in the details sidebar with its
  Foreign keys section showing the new FK highlighted and scrolled into view
```

### Escape cancels before a source is picked

```
Given the user clicked "Add foreign key" and no column has been clicked yet
When the user presses Escape
Then FK create mode exits, the button reverts to "Add foreign key"
And no model.yml file is modified
```

### Escape cancels after a source is picked

```
Given the user clicked "Add foreign key" and then clicked "order_id" on
  "order_items"
When the user presses Escape
Then FK create mode exits, the row is no longer marked as a picked source
And no model.yml file is modified
```

### Clicking empty canvas cancels the gesture

```
Given the user clicked "Add foreign key" and then clicked a source column
When the user clicks empty canvas
Then FK create mode exits with nothing written, exactly as Escape would
```

### A self-referencing FK can be drawn

```
Given the user clicked "Add foreign key" and then clicked "parent_id" on
  "categories"
When the user clicks "category_id" on "categories" (the same table)
Then categories.yml gains a foreign_key constraint with to: ref('categories'),
  columns: [parent_id], to_columns: [category_id]
```

### The Add note toolbar button creates a note at the viewport center

```
Given a saved diagram is open and active
When the user clicks "Add note"
Then an empty expanded note appears at the center of the viewport with focus
  in its text area, exactly as "Add note here" from the canvas context menu
  does at the clicked point (spec 16)
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/routing.ts` | modify | Add `chooseSide`, a tiny pure helper picking `'left' \| 'right'` for a point relative to a card's horizontal center, reused by the mouse-follow preview line's anchor side. |
| `webview-ui/fk-create-state.ts` | create | Pure state machine for the two-click FK gesture: idle → source-picked → completed/cancelled. |
| `webview-ui/hooks/useFkCreateMode.ts` | create | Wraps `fk-create-state.ts` in React state, adds the window-level Escape listener, and exposes the hint text. |
| `webview-ui/DiagramCanvas.tsx` | modify | Track live mouse position (flow coordinates) while the mode is active with a source picked; render the mouse-follow preview line via `ViewportPortal`; apply a crosshair cursor class while the mode is active. |
| `webview-ui/App.tsx` | modify | Instantiate `useFkCreateMode`; add the top-left toolbar (`Add note`, `Add foreign key`/`Cancel`); route column clicks through the FK gesture while active (falling back to normal `onColumnSelect` otherwise); on completion, post `createForeignKey`, select the child table, and set `focusedFk`; cancel the gesture from `onPaneClick` too; render the hint banner while active. |
| `webview-ui/styles.css` | modify | `.canvas-toolbar--top-left` (position-only tweak if needed), `.canvas__surface--fk-create` (crosshair cursor), `.fk-draw-line` (preview line stroke). |
| `specs/ARCHITECTURE.md` | modify | Add rows for `fk-create-state.ts` and `useFkCreateMode.ts`; update the `routing.ts`, `DiagramCanvas.tsx`, `App.tsx` rows. |
| `test/unit/diagram/routing.test.ts` | modify | Tests for `chooseSide`. |
| `test/unit/webview/fkCreateState.test.ts` | create | Tests for the pure gesture state machine. |

### Signatures

```ts
// src/diagram/routing.ts  (pure — must not import `vscode`)
/** 'left' when `pointX` is left of `centerX`, else 'right'. Ties go to 'right'. */
export function chooseSide(centerX: number, pointX: number): RouteSide;
```

```ts
// webview-ui/fk-create-state.ts  (webview, pure — no `vscode` import, no DOM)
export interface ColumnRef {
  model: string;
  column: string;
}

/** `active: false` = idle; `active: true, source: null` = waiting for the
 * source column; `active: true, source: ColumnRef` = waiting for the target. */
export type FkCreateState =
  | { active: false }
  | { active: true; source: ColumnRef | null };

export const FK_CREATE_IDLE: FkCreateState;

export function startFkCreate(): FkCreateState;
export function cancelFkCreate(): FkCreateState;

export interface FkClickOutcome {
  /** The state after this click. */
  state: FkCreateState;
  /** Present only when this click completed a source→target pair. */
  completed?: { source: ColumnRef; target: ColumnRef };
}

/** Applies a column click to the current gesture state. A no-op (state
 * unchanged) when `state.active` is false or `ref` repeats the current source. */
export function clickColumnForFk(state: FkCreateState, ref: ColumnRef): FkClickOutcome;
```

```ts
// webview-ui/hooks/useFkCreateMode.ts  (webview)
export interface FkCreateModeState {
  state: FkCreateState;
  /** Hint banner text, or null while idle. */
  hint: string | null;
  start: () => void;
  cancel: () => void;
  /** Feeds a column click through the gesture; returns whether the mode
   * consumed the click (so callers skip their normal column-select handling). */
  handleColumnClick: (model: string, column: string) => FkClickOutcome | null;
}

export function useFkCreateMode(): FkCreateModeState;
```

### Behavior notes

- **`chooseSide`.** `pointX < centerX ? 'left' : 'right'` — matches scenario
  "Drawing a foreign key between two tables" (the preview line always points
  toward the cursor's side of the source card).
- **Gesture state machine (`fk-create-state.ts`).**
  - `startFkCreate()` → `{ active: true, source: null }`.
  - `cancelFkCreate()` → `{ active: false }` (used by Escape, pane click, and
    automatically right after a completed pair).
  - `clickColumnForFk`:
    - `state.active === false` → `{ state }` unchanged, no `completed` (the
      caller is expected not to call this while inactive, but the function
      stays total/safe).
    - `state.source === null` → `{ state: { active: true, source: ref } }`.
    - `state.source` equals `ref` (`model` and `column` both match) → `{
      state }` unchanged — clicking the same column again does not cancel or
      advance (Scope: "Re-clicking the exact same column ... is a no-op").
    - Otherwise → `{ state: { active: false }, completed: { source:
      state.source, target: ref } }` — self-references (`source.model ===
      ref.model`, different column) complete exactly the same way.
- **`useFkCreateMode`.**
  - Wraps the pure state in `useState<FkCreateState>(FK_CREATE_IDLE)`.
  - `start` → `setState(startFkCreate())`. `cancel` → `setState(cancelFkCreate())`.
  - `handleColumnClick(model, column)`: if `!state.active` returns `null`
    (nothing consumed — caller falls through to normal selection); otherwise
    calls `clickColumnForFk(state, { model, column })`, sets `state` to the
    result's `state`, and returns the full outcome (including `completed` when
    present) so `App.tsx` can post the edit.
  - A `useEffect` registers a `window` `keydown` listener only while
    `state.active` is true; on `Escape` it calls `cancel()`. Cleans up on
    unmount/deactivation (standard escape-hatch pattern already used
    elsewhere in this codebase, e.g. `InlineEditField`'s Escape handling,
    though that one is local to an input rather than window-level).
  - `hint`: `null` while idle; `'Click a column to start a foreign key (Esc to
    cancel)'` while `source === null`; `` `Click the target column for
    ${source.model}.${source.column} (Esc to cancel)` `` while a source is
    picked.
- **`App.tsx` wiring.**
  - `const fkCreate = useFkCreateMode();`
  - The interaction context's `onColumnSelect` becomes a wrapper:
    ```ts
    const onColumnSelectOrDraw = useCallback(
      (model: string, column: string): void => {
        const outcome = fkCreate.handleColumnClick(model, column);
        if (outcome === null) {
          onColumnSelect(model, column);
          return;
        }
        if (outcome.completed !== undefined) {
          const { source, target } = outcome.completed;
          onEdit({
            kind: 'createForeignKey',
            model: source.model,
            target: target.model,
            columns: [source.column],
            toColumns: [target.column],
            virtual: false,
          });
          onTableSelect(source.model);
          setFocusedFk({
            to: `ref('${target.model}')`,
            target: target.model,
            columns: [source.column],
            toColumns: [target.column],
            virtual: false,
          });
        }
      },
      [fkCreate, onColumnSelect, onEdit, onTableSelect, setFocusedFk],
    );
    ```
    This is what feeds `DiagramInteractionContextValue.onColumnSelect` instead
    of the bare `onColumnSelect` from `useSelection`. Ordinary column selection
    (mode inactive) is byte-identical to before, since `handleColumnClick`
    returns `null` and the wrapper falls through.
  - `setFocusedFk` surviving the next `diagram:update`: `reconcileToGraph`
    (spec 08, unchanged) keeps a `focusedFk` alive only while a matching
    descriptor exists via `sameFkContent` (`to`/`columns`/`toColumns`, ignores
    `virtual`), so the hand-built descriptor above matches the real one the
    next diagram update produces without needing to wait for it.
  - `onPaneClick` wrapper: when `fkCreate.state.active`, call `fkCreate.cancel()`
    in addition to the existing `selection.onPaneClick()` — clicking empty
    canvas cancels the gesture without writing anything (scenario "Clicking
    empty canvas cancels the gesture").
  - Toolbar button label/handler: `fkCreate.state.active ? 'Cancel' :
    'Add foreign key'`, `onClick={fkCreate.state.active ? fkCreate.cancel :
    fkCreate.start}`.
  - `Add note` button: `onClick={() => focusNoteText(notes.addNote(viewportCenterX, viewportCenterY))}`
    where the viewport center in flow coordinates comes from React Flow's
    `useReactFlow().screenToFlowPosition` applied to the canvas container's
    bounding-rect center — the same conversion `onPaneContextMenuInternal`
    already performs for a click point, just centered instead of at the
    cursor. Since `App.tsx` sits outside the `<ReactFlowProvider>`'s direct
    child that owns `screenToFlowPosition` today (`DiagramCanvas`), this
    button is rendered *inside* `DiagramCanvas`'s toolbar (new top-left
    `Panel`), which already has `screenToFlowPosition` and `notes`/
    `focusNoteText` passed down as callbacks — i.e. `DiagramCanvas` gains
    `onAddNote: () => void` and `onAddForeignKey: () => void` /
    `fkCreateHint: string | null` /`fkCreateActive: boolean` /`onCancelFkCreate:
    () => void` props, and `App.tsx` supplies `onAddNote={() =>
    focusNoteText(notes.addNote(...))}` — but the center point must be
    computed where `screenToFlowPosition` lives. Resolution: `DiagramCanvas`
    computes the center itself (its own `containerRef` + `screenToFlowPosition`,
    both already in scope there) and calls a passed-in `onAddNoteAt: (point:
    {x,y}) => void` prop, mirroring `onPaneContextMenu`'s existing shape
    exactly — no new coordinate-conversion plumbing crosses the component
    boundary.
  - Hint banner: rendered in `App.tsx`'s existing banner stack (alongside the
    error/pendingErrors banners), `className="banner banner--info"`, shown
    only when `fkCreate.hint !== null`.
- **`DiagramCanvas.tsx` preview line.**
  - New props: `fkSource: { model: string; column: string } | null` (derived
    in `App.tsx` from `fkCreate.state`: `state.active && state.source !== null
    ? state.source : null`) and `fkCreateActive: boolean`.
  - A `useState<{ x: number; y: number } | null>` tracks the live mouse
    position in **flow** coordinates, updated from an `onMouseMove` on the
    existing `canvas__surface` div, but only while `fkCreateActive &&
    fkSource !== null` (a no-op handler otherwise, avoiding a re-render per
    mouse move when the mode is off).
  - The source anchor point: find `node = rfNodes.find((n) => n.id ===
    fkSource.model)`; `rowIndex = columnIndexOf(fkSource.model,
    fkSource.column)` (the same `columnIndexOf` map `DiagramCanvas` already
    builds for the live routing pass); `y = node.position.y + (rowIndex
    !== undefined ? columnRowCenterY(rowIndex) : HEADER_HEIGHT / 2)`; `side =
    chooseSide(node.position.x + (node.width ?? NODE_WIDTH) / 2, mouse.x)`;
    `x = node.position.x + (side === 'right' ? (node.width ?? NODE_WIDTH) : 0)`.
    When `node` is `undefined` (should not happen — the source table is on
    screen since the user just clicked its column) the preview line is
    skipped for that render.
  - Rendered via `<ViewportPortal>` (from `@xyflow/react`, already a listed
    export of the pinned `^12.11.2` version) wrapping an `<svg>` positioned to
    cover the flow plane with a single `<line>` from the anchor to the
    tracked mouse point, `className="fk-draw-line"`, only mounted when
    `fkCreateActive && fkSource !== null && mousePoint !== null`.
  - Cursor: the outer `canvas__surface` div gets an additional
    `canvas__surface--fk-create` class while `fkCreateActive` is true (CSS:
    `cursor: crosshair`).
  - New top-left `Panel`, placed before the existing top-right one:
    ```tsx
    <Panel position="top-left">
      <div className="canvas-toolbar">
        <button type="button" className="panel-button panel-button--secondary" onClick={onAddNote}>
          Add note
        </button>
        <button
          type="button"
          className="panel-button panel-button--secondary"
          onClick={fkCreateActive ? onCancelFkCreate : onStartFkCreate}
        >
          {fkCreateActive ? 'Cancel' : 'Add foreign key'}
        </button>
      </div>
    </Panel>
    ```
    `onAddNote` computes the viewport-center flow point from
    `containerRef.current!.getBoundingClientRect()`'s center via
    `screenToFlowPosition` and calls the `onAddNoteAt(point)` prop.
- **Highlighting the just-picked source column.** Reuses the existing
  selected-column rendering already in `TableNode.tsx`
  (`table-node__row--selected`, driven by
  `interaction.selectedColumnRef`) — `App.tsx`'s `interaction` memo's
  `selectedColumnRef` is extended to also read from `fkCreate.state` when a
  source is picked (`fkCreate.state.active && fkCreate.state.source !== null
  ? fkCreate.state.source : (existing selection-derived value)`), so no new
  CSS or `TableNode` change is needed for the "that row renders selected"
  scenario outcome.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/routing.test.ts` | `chooseSide picks left when the point is left of center` | `chooseSide(100, 40)` | `'left'` |
| `test/unit/diagram/routing.test.ts` | `chooseSide picks right when the point is right of center` | `chooseSide(100, 160)` | `'right'` |
| `test/unit/diagram/routing.test.ts` | `chooseSide ties go right` | `chooseSide(100, 100)` | `'right'` |
| `test/unit/webview/fkCreateState.test.ts` | `startFkCreate begins with no source` | `startFkCreate()` | `{ active: true, source: null }` |
| `test/unit/webview/fkCreateState.test.ts` | `cancelFkCreate returns idle` | `cancelFkCreate()` | `{ active: false }` |
| `test/unit/webview/fkCreateState.test.ts` | `first click picks the source, no completion` | `clickColumnForFk({active:true,source:null}, {model:'order_items',column:'order_id'})` | `{ state: { active: true, source: { model: 'order_items', column: 'order_id' } } }`, no `completed` |
| `test/unit/webview/fkCreateState.test.ts` | `re-clicking the same column is a no-op` | state with `source: {model:'order_items',column:'order_id'}`, click same ref | returned `state` deep-equals the input state, no `completed` |
| `test/unit/webview/fkCreateState.test.ts` | `second click on a different column completes the pair and returns to idle` | state with source `order_items.order_id`, click `orders.order_id` | `{ state: { active: false }, completed: { source: { model: 'order_items', column: 'order_id' }, target: { model: 'orders', column: 'order_id' } } }` |
| `test/unit/webview/fkCreateState.test.ts` | `a self-referencing pair completes like a cross-table one` | source `categories.parent_id`, click `categories.category_id` | `completed` present with both refs on `model: 'categories'` |
| `test/unit/webview/fkCreateState.test.ts` | `clicking while inactive is a no-op` | `clickColumnForFk({active:false}, {model:'x',column:'y'})` | `{ state: { active: false } }`, no `completed` |

### Verification

1. `npm run verify` — typecheck + unit suites, must be green.
2. `npm test` — before the commit, must be green.
3. Manual (F5 on `fixtures/sample-dbt`): click "Add foreign key", draw a line
   from `order_items.order_id` to `orders.order_id`, confirm the file gains
   the constraint and the sidebar focuses it; press Escape mid-gesture on a
   second attempt and confirm nothing is written; click "Add note" and
   confirm a note appears centered with focus.

### Do not touch

- `src/dbt/edit/foreignKey.ts` and every other `src/dbt/edit/*` module — this
  feature only calls the existing `createForeignKey` edit kind, unchanged.
- `nodesConnectable`, handle mounting (`TableNode.tsx`'s always-mounted four
  handles per column), and the live routing pass in `flow.ts`/`routing.ts`
  beyond the additive `chooseSide` export — the FK gesture is a parallel,
  click-driven interaction, not a React Flow connection.
- The Foreign keys section / draft-FK flow (`ForeignKeySection.tsx`,
  `useDraftForeignKeys.ts`) — untouched; both creation paths coexist.
- `webview-ui/hooks/useNotes.ts` and the "Add note here" context-menu path —
  unchanged; the new toolbar button calls the same `notes.addNote` +
  `focusNoteText` already used there.

## Acceptance Criteria

- [ ] A top-left toolbar shows "Add note" and "Add foreign key" buttons,
      styled like the existing top-right toolbar.
- [ ] "Add note" creates an empty, focused, expanded note at the viewport
      center.
- [ ] "Add foreign key" enters FK create mode: crosshair cursor, a hint
      banner, and the button becomes "Cancel".
- [ ] Clicking a column while active picks it as the source (rendered
      selected) and shows a line following the pointer from it; the hint
      updates to ask for the target column.
- [ ] Clicking a second column (any table, including the same table as the
      source) commits a real, single-pair `createForeignKey` edit, exits FK
      create mode, selects the child table, and highlights/scrolls the new FK
      into view in the Foreign keys section exactly like an FK-edge
      double-click does.
- [ ] Escape at any point in the gesture, and clicking empty canvas, exit FK
      create mode without writing anything.
- [ ] Re-clicking the exact same column that was just picked as source is a
      no-op; the mode keeps waiting.
- [ ] `chooseSide` and the FK gesture state machine are pure, `vscode`-free,
      and covered by sub-second Vitest unit tests.
- [ ] `specs/ARCHITECTURE.md` reflects the new/changed modules.
- [ ] `npm test` and `npm run typecheck` pass.

## Confirm at Approval

- **(a) Click-click, not click-drag.** The gesture is two clicks (source,
  then target) with a mouse-follow preview line, not a press-and-drag. Chosen
  to avoid touching `nodesConnectable`/handle-drag plumbing (spec 09/12) and
  because a click-click connector is a common, low-risk pattern. If a true
  click-and-drag feel is required instead, say so — it changes the
  `DiagramCanvas` wiring materially (would need `onConnectStart`/`onConnect`/
  `onConnectEnd` and a temporary `nodesConnectable` toggle).
- **(b) New FKs are always real.** Mirrors spec 08 (h)'s "new FKs are real and
  table-level" precedent for the existing Add-foreign-key path; the Virtual
  checkbox still exists to convert afterward.
- **(c) One FK per activation.** Confirmed by the request ("Once a first FK
  is created we exit aswell the create FK mode").
- **(d) Click-away (pane click) cancels, same as Escape.** Not explicitly
  requested but a natural extension of "if I hit escape ... we exit"; flagged
  here in case only Escape (not click-away) should cancel.
- **(e) Self-references allowed.** Not explicitly requested or forbidden;
  `createForeignKey` itself has no such restriction, so this spec allows it
  for consistency. Say so if self-referencing FKs should be blocked from this
  gesture specifically.
