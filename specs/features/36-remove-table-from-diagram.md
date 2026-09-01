---
id: 36
title: Remove a table from the diagram
status: implemented
priority: high
created: 2026-09-01
owner: unassigned
depends_on: [05, 15, 24]
---

# Remove a table from the diagram

## Summary

As a data engineer arranging a diagram, I want to take a table off the canvas —
with the `Delete`/`Supr` key or a right-click menu item on the table card — so
that I can curate exactly which models a saved diagram shows without hunting for
the model's checkbox in the filter sidebar.

## Background

Today the only way to drop a table from the canvas is to find it in the left
sidebar's Models list and uncheck it. On a diagram with many models that is slow
and breaks the direct-manipulation feel of the canvas: notes already respond to
`Delete` (spec 16) and the table card already has a context menu (spec 15, spec
24), so the table has an obvious place to hook this onto.

**Removal is a view operation, not a destructive one.** It unchecks the model in
the filter exactly as the sidebar checkbox does; no model.yml file is read or
written, and the model reappears by re-checking it in the sidebar. The wording
"Remove from diagram" is chosen (over "Delete") to make that unmistakable.

## Scope

**In scope**

- A `Remove from diagram` item on the table card's context menu, available from
  both the header and a column row (same menu, per spec 25's precedent).
- `Delete` and `Backspace` on the canvas removing the currently selected table.
- Removal = unchecking that model in the filter sidebar's Models list; the
  sidebar checkbox is left unchecked and can be re-checked to bring it back.
- Clearing the selection when the removed table was the selected entity.

**Out of scope**

- Deleting a model from its `model.yml` file. Nothing is written to disk.
- Removing more than one table at a time (there is no multi-select for tables:
  `elementsSelectable` is `false` for the React Flow canvas).
- Removing a table by dragging it off the canvas.
- Any change to how notes respond to `Delete` (spec 16 behavior is unchanged).
- Automatically hiding tables that become orphaned by the removal.

## Scenarios

### Remove a table from its header context menu

```
Given a diagram showing the tables "orders" and "customers"
When the user right-clicks the header of the "orders" card
And chooses "Remove from diagram"
Then the "orders" card disappears from the canvas
And the "orders" checkbox in the sidebar's Models list is unchecked
And "customers" is still shown
And no model.yml file is written
```

### Remove a table from a column row context menu

```
Given a diagram showing the table "orders" with a column "customer_id"
When the user right-clicks the "customer_id" row of the "orders" card
And chooses "Remove from diagram"
Then the whole "orders" card disappears from the canvas
And the "customer_id" column is untouched in orders' model.yml
```

### Remove the selected table with the keyboard

```
Given a diagram showing the table "orders"
And the user has clicked the "orders" card header, selecting it
When the user presses Delete
Then the "orders" card disappears from the canvas
And the details sidebar shows its empty state
```

### The keyboard does nothing without a table selection

```
Given a diagram whose current selection is a column, a note, or nothing
When the user presses Delete
Then no table is removed
And spec 16's note deletion behaves exactly as before
```

### Typing Delete in a text field never removes a table

```
Given the "orders" table is selected
And the caret is inside a note's textarea or a sidebar input
When the user presses Delete
Then no table is removed
```

### A removed table comes back from the sidebar

```
Given the user removed "orders" from the diagram
When the user re-checks "orders" in the sidebar's Models list
Then the "orders" card is shown again
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/filter.ts` | modify | Add the pure `removeModels` selection helper. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Expose `removeModels(names)` on top of the pure helper, bumping `filterTick`. |
| `webview-ui/hooks/useSelection.ts` | modify | Add `clearSelectionForModel(model)` so a removed table's selection drops. |
| `webview-ui/App.tsx` | modify | `onRemoveTable` callback; the menu item; wire the canvas' new prop. |
| `webview-ui/DiagramCanvas.tsx` | modify | Extend the existing `onKeyDown` to also call `onRemoveSelectedTable`. |
| `webview-ui/icons.ts` | modify | Re-export the `Trash2` Lucide icon. |
| `test/unit/shared/filter.test.ts` | modify | Unit tests for `removeModels`. |
| `specs/ARCHITECTURE.md` | modify | Update the `src/shared/filter.ts`, `useDiagramFilter`, `useSelection` and `icons.ts` rows. |
| `specs/README.md` | modify | Feature index row for 36. |

If `test/unit/shared/filter.test.ts` does not exist under that exact path, the
existing filter suite's real path is used instead; no new suite file is created.

### Signatures

```ts
// src/shared/filter.ts  (shared — must not import `vscode`)
/**
 * The checked-model set with `names` removed. Pure; never mutates `selected`.
 * Names not present are ignored.
 */
export function removeModels(
  selected: ReadonlySet<string>,
  names: readonly string[],
): Set<string>;
```

```ts
// webview-ui/hooks/useDiagramFilter.ts  (webview)
export interface DiagramFilterState {
  // …existing members unchanged…
  /** Unchecks these models, exactly as the sidebar checkbox would (spec 36). */
  removeModels: (names: readonly string[]) => void;
}
```

```ts
// webview-ui/hooks/useSelection.ts  (webview)
export interface SelectionState {
  // …existing members unchanged…
  /** Clears the selection when it points at `model` (table or one of its columns). */
  clearSelectionForModel: (model: string) => void;
}
```

```ts
// webview-ui/DiagramCanvas.tsx  (webview)
export interface DiagramCanvasProps {
  // …existing members unchanged…
  /** Delete/Backspace on the canvas: removes the selected table (spec 36). */
  onRemoveSelectedTable: () => void;
}
```

### Behavior notes

- **Removal is filter-only.** `onRemoveTable(model)` calls
  `filter.removeModels([model])` and `selection.clearSelectionForModel(model)`.
  It never posts a `diagram:edit` message, so no `model.yml` is written
  (scenarios 1 and 2).
- **`filterTick` must bump.** `removeModels` in the hook increments
  `filterTick` like every other explicit filter change, so `DiagramCanvas`
  re-fits the remaining tables — matching what unchecking the box already does.
- **The context-menu item is added to `buildTableMenuItems`** in `App.tsx`, so
  header and column right-clicks get it identically (scenario 2). It is
  appended **last**, after `Edit fields matrix`, with the exact label
  `Remove from diagram` and icon `<Trash2 size={16} />`.
- **Keyboard handling extends the existing `onKeyDown`** in `DiagramCanvas`.
  The order inside the handler is: the existing text-field guard (`INPUT`,
  `TEXTAREA`, `isContentEditable`) first, then `onDeleteSelectedNotes()`, then
  `onRemoveSelectedTable()`. Both are called unconditionally; each is a no-op
  when its own precondition does not hold. This keeps spec 16 byte-identical
  (scenarios 4 and 5).
- **`onRemoveSelectedTable` is a no-op unless `selection.kind === 'table'`.**
  A selected *column* does not remove its table — the keyboard gesture requires
  the table itself to be selected (scenario 4). The context-menu item has no
  such restriction, since the right-click names the table explicitly.
- **`clearSelectionForModel`** clears when the selection is
  `{kind:'table', id: model}` **or** `{kind:'column', model, …}`, and also sets
  `focusedFk` to `null` in that case. It leaves any other selection untouched.
  This is a deliberate exception to spec 06's "a filtered-out selection stays
  editable" rule: an explicit removal is a user statement that they are done
  with that table (scenario 3).
- **No confirmation prompt.** The action is non-destructive and reversible from
  the sidebar (scenario 6).

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/filter.test.ts` | `removeModels drops the named models` | `selected = new Set(['orders','customers','items'])`, `names = ['orders']` | returns `new Set(['customers','items'])` |
| `test/unit/shared/filter.test.ts` | `removeModels ignores unknown names` | `selected = new Set(['orders'])`, `names = ['nope']` | returns `new Set(['orders'])` |
| `test/unit/shared/filter.test.ts` | `removeModels does not mutate its input` | `selected = new Set(['orders','customers'])`, `names = ['orders']` | after the call `selected` still equals `new Set(['orders','customers'])` |
| `test/unit/shared/filter.test.ts` | `removeModels removes several models at once` | `selected = new Set(['a','b','c'])`, `names = ['a','c']` | returns `new Set(['b'])` |
| `test/unit/shared/filter.test.ts` | `computeVisibleModels hides a removed model` | files `[{uri:'f', label:'f', models:['orders','customers']}]`, `selectedFiles = new Set(['f'])`, `selectedModels = removeModels(new Set(['orders','customers']), ['orders'])` | returns `new Set(['customers'])` |

Scenarios 1, 2 and 6 are covered by the `removeModels` +
`computeVisibleModels` tests above (removal is exactly an unchecked model).
Scenarios 3, 4 and 5 are React-level wiring over that same pure helper and are
verified by Manual Verify; no DOM test harness is introduced by this feature.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

- `src/dbt/**` — removal writes nothing to disk; no edit handler is involved.
- `src/shared/protocol.ts` — this feature adds no message; it is entirely
  webview-side state.
- `webview-ui/hooks/useNotes.ts` and the `onDeleteSelectedNotes` path — spec
  16's note deletion must remain byte-identical.
- `src/shared/filter.ts`'s existing exports (`filterGraph`,
  `computeVisibleModels`, `reconcileSelection`, `scopeSelectionToFile`,
  `matchesSearch`, `capInitialSelection`) — only an addition is permitted.

## Acceptance Criteria

- [ ] The table card's context menu, opened from the header or from a column
      row, offers `Remove from diagram`.
- [ ] Choosing it removes the card and unchecks that model in the sidebar.
- [ ] No `model.yml` file is modified by the removal.
- [ ] `Delete`/`Backspace` removes the table when a table is selected, and does
      nothing when the selection is a column, a note, or empty.
- [ ] `Delete` typed inside an input, textarea or contenteditable removes
      nothing.
- [ ] Re-checking the model in the sidebar brings the table back.
- [ ] `npm run verify` is green.
