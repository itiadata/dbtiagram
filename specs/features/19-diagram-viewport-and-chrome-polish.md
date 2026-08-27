---
id: 19
title: Diagram viewport and chrome polish
status: approved
priority: medium
created: 2026-08-27
owner: unassigned
depends_on: [11, 16]
---

# Diagram viewport and chrome polish

## Summary

As a dbt developer opening a diagram, I want the tables to land already framed
in the window, the properties pane to stay out of my way until I select
something, and every control to be legible in my current VS Code theme, so that
the diagram is usable the moment it opens instead of needing three manual
adjustments first.

## Background

Four unrelated rough edges share one theme — how the diagram presents itself on
open — and the same three files, so they are specified and implemented together:

1. **Initial zoom.** `DiagramCanvas` already fits the view on its first effect
   run, but that happens before React Flow has *measured* the table cards. The
   fit is therefore computed against default/stale node dimensions and the
   diagram lands far more zoomed out than it should.
2. **Properties pane.** `detailsVisible` starts `true` and never closes on its
   own, so an empty properties pane occupies a third of the window from the
   moment the diagram opens. Spec 11 gave the pane a manual collapse; it never
   gave it a policy.
3. **Theming.** The palette in `styles.css` is a hand-rolled light/dark pair
   switched by `prefers-color-scheme`. It never reads VS Code's own theme
   variables, so it is wrong for High Contrast themes and for any case where
   the VS Code theme disagrees with the OS setting. On top of that, React Flow's
   stock `.react-flow__controls-button` CSS (white background, near-black SVG
   icons) is not overridden at all, which is why the zoom / fit / lock buttons
   are washed out and near-unreadable on a dark theme.
4. **Add note button.** Spec 16 shipped both a header "Add note" button and a
   right-click "Add note here" action. The context-menu path is strictly better
   (it places the note where the user pointed) and the button costs header
   space plus a tick-based round trip through `DiagramCanvas`.

## Scope

**In scope**

- Fitting the view once the nodes have been measured, on diagram open.
- A visibility policy for the details (properties) sidebar: hidden by default,
  opens on selection, closes on deselection, respects a manual collapse until
  the selection next changes.
- Repointing the whole webview palette at VS Code theme variables, and theming
  the React Flow `Controls` buttons (zoom in, zoom out, fit view, lock).
- Removing the header "Add note" button and its `addNoteTick` plumbing.

**Out of scope**

- The filter (left) sidebar's default visibility — it stays visible by default.
- Any change to note creation via the canvas context menu, or to note behavior.
- Changing `fitView` padding/`maxZoom` values, or the refit triggers already
  defined by specs 04, 05 and 13 (grow / auto-layout / filter / seed).
- Adding a VS Code setting for any of the above.

## Scenarios

### Diagram opens framed to the models

```
Given a model.yml with several models
When I open the dbt Diagram for it
Then the viewport is fitted to all table cards once they have been measured
And the cards are legible rather than shrunk to a corner of the canvas
```

### Properties pane is hidden until something is selected

```
Given I have just opened a diagram and selected nothing
Then the details sidebar is collapsed to its rail
When I click a table header or a column row
Then the details sidebar opens showing that entity's properties
```

### Properties pane closes when the selection is cleared

```
Given a table is selected and the details sidebar is open
When I click the empty canvas
Then the selection is cleared
And the details sidebar collapses to its rail
```

### A manual collapse survives until the selection changes

```
Given a table is selected and I collapse the details sidebar by hand
When I hover, drag or pan without changing the selection
Then the details sidebar stays collapsed
When I then select a different table or column
Then the details sidebar opens again
```

### Canvas controls follow the VS Code theme

```
Given VS Code is using a dark theme
When I look at the zoom in, zoom out, fit view and lock buttons
Then their background and icons are drawn from the active VS Code theme colors
And the icons are clearly legible against their background
```

### No Add note button in the header

```
Given a diagram is open
Then the header shows no "Add note" button
When I right-click empty canvas
Then "Add note here" still creates a note at the pointer
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/details-visibility.ts` | create | Pure details-sidebar visibility policy + selection-key helper. |
| `webview-ui/App.tsx` | modify | Apply the visibility policy; drop the Add note button and `addNoteTick`; `useSelection()` without `revealDetails`. |
| `webview-ui/DiagramCanvas.tsx` | modify | Fit the view once nodes are measured; drop the `addNoteTick`/`onAddNoteAt` props and their effect. |
| `webview-ui/hooks/useSelection.ts` | modify | Drop the `revealDetails` parameter (visibility now lives in `App`). |
| `webview-ui/styles.css` | modify | Repoint `:root` at VS Code theme variables; theme `.react-flow__controls-button`. |
| `test/unit/webview/detailsVisibility.test.ts` | create | Unit tests for the visibility policy. |
| `specs/ARCHITECTURE.md` | modify | Add `webview-ui/details-visibility.ts`; update the `useSelection` entry. |
| `specs/README.md` | modify | Add feature 19 to the index. |

### Signatures

```ts
// webview-ui/details-visibility.ts  (webview — pure module, no React/vscode imports)

/**
 * Stable identity of the current selection: `null` when nothing is selected,
 * `table:<model>` for a table, `column:<model>.<column>` for a column.
 */
export type SelectionKey = string | null;

/** Builds the selection key from the current selection. */
export function selectionKey(selection: Selection): SelectionKey;

/**
 * The details sidebar's next visibility.
 * - selection unchanged  -> `previous` (a manual collapse sticks)
 * - selection changed to null -> false
 * - selection changed to an entity -> true
 */
export function nextDetailsVisible(
  previous: boolean,
  key: SelectionKey,
  previousKey: SelectionKey,
): boolean;
```

`Selection` is imported as a type from `webview-ui/hooks/useSelection.ts`.

```ts
// webview-ui/hooks/useSelection.ts  (webview)
export function useSelection(): SelectionState;   // was useSelection(revealDetails: () => void)
```

```ts
// webview-ui/DiagramCanvas.tsx  (webview)
// DiagramCanvasProps: REMOVE `addNoteTick: number` and `onAddNoteAt: (x, y) => void`.
// All other props keep their current names and types.
```

### Behavior notes

**Initial fit.** Import `useNodesInitialized` from `@xyflow/react`. Keep the
existing adopt effect exactly as it is *except* for the `isFirst` branch: remove
`firstFitRef` and the `isFirst ||` term from its refit condition, so that effect
refits only on `added || reset || filterChanged || seeded`. Add a separate
effect:

- guard with a `didInitialFitRef` (initial `false`);
- when `useNodesInitialized()` is `true` and `didInitialFitRef.current` is
  `false`, set the ref to `true` and call
  `void fitView({ padding: 0.15, maxZoom: 1 })`.

The `fitView` prop and `fitViewOptions` on `<ReactFlow>` stay as they are; they
are the pre-measurement fit and the new effect is the corrective one. The ref
guard is what keeps this to a single fit for the life of the panel — later
measurement churn (a card growing after an inline edit) must not refit, or spec
04's "typing never moves the viewport" rule would break.

**Details visibility.** In `App`, `detailsVisible` starts `false`. Compute
`const key = selectionKey(selection.selection)` and hold `previousKeyRef`
(initial `null`). One effect, keyed on `key`:

```
setDetailsVisible((previous) => nextDetailsVisible(previous, key, previousKeyRef.current));
previousKeyRef.current = key;
```

Because the effect early-returns nothing and `nextDetailsVisible` returns
`previous` for an unchanged key, an unrelated re-render never reopens a manually
collapsed pane. Remove the `revealDetails` callback, the `setDetailsVisible(true)`
line inside `onRevealed`, and the `revealDetails` parameter of `useSelection`
(and its two call sites inside that hook plus its doc comment). Selecting via
"Locate model" then opens the pane through the same effect as any other
selection. `onPaneClick` keeps clearing the selection only; the pane closes as a
consequence of the key going `null`.

**Theme.** Replace the `:root` block's colors with VS Code variables, each with
the current literal as its final fallback, and delete the
`@media (prefers-color-scheme: dark)` block entirely (the variables already
carry the theme). `color-scheme: light dark` stays.

```
--bg:           var(--vscode-editor-background, #f5f5f5)
--card:         var(--vscode-editorWidget-background, var(--vscode-sideBar-background, #ffffff))
--border:       var(--vscode-widget-border, var(--vscode-editorWidget-border, #d0d0d0))
--accent:       var(--vscode-focusBorder, #2563eb)
--accent-hover: var(--vscode-textLink-activeForeground, #1e40af)
--text:         var(--vscode-editor-foreground, var(--vscode-foreground, #1f1f1f))
--muted:        var(--vscode-descriptionForeground, #6b6b6b)
--error:        var(--vscode-errorForeground, #b91c1c)
```

Then append control-button rules (these must come after the imported React Flow
stylesheet, i.e. at the end of `styles.css`):

- `.react-flow__controls` — `box-shadow: none;`
- `.react-flow__controls-button` — `background: var(--card); border-bottom: 1px solid var(--border); color: var(--text); fill: currentColor;`
- `.react-flow__controls-button:hover` — `background: color-mix(in srgb, var(--accent) 20%, var(--card));`
- `.react-flow__controls-button svg` — `fill: currentColor;` (React Flow hardcodes a dark fill on the `path`, so `fill: currentColor` is also set on `.react-flow__controls-button path`).

`fill: currentColor` on both the button and its `path` is what actually flips
the icons; setting only the button's `color` leaves React Flow's own `fill`
winning.

**Add note removal.** From `App.tsx`: delete the `addNoteTick` state, the header
`<button>Add note</button>`, and the `addNoteTick`/`onAddNoteAt` props passed to
`DiagramCanvas`. Keep `onAddNoteAt`'s body logic inline in the context-menu
handler that already exists (`onPaneContextMenu` calls
`focusNoteText(notes.addNote(flowPoint.x, flowPoint.y))` today — unchanged), and
delete the now-unused standalone `onAddNoteAt` callback. From
`DiagramCanvas.tsx`: delete the two props, `lastAddNoteTickRef`, and the effect
that resolves the viewport center. `containerRef` and `screenToFlowPosition`
stay — they are still used by the keydown wrapper and the pane context menu.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/detailsVisibility.test.ts` | `builds a selection key for a table` | `selectionKey({ kind: 'table', id: 'orders' })` | `'table:orders'` |
| `test/unit/webview/detailsVisibility.test.ts` | `builds a selection key for a column` | `selectionKey({ kind: 'column', model: 'orders', column: 'id' })` | `'column:orders.id'` |
| `test/unit/webview/detailsVisibility.test.ts` | `builds a null key for no selection` | `selectionKey(null)` | `null` |
| `test/unit/webview/detailsVisibility.test.ts` | `opens the pane when a selection appears` | `nextDetailsVisible(false, 'table:orders', null)` | `true` |
| `test/unit/webview/detailsVisibility.test.ts` | `opens the pane when the selection changes` | `nextDetailsVisible(false, 'column:orders.id', 'table:orders')` | `true` |
| `test/unit/webview/detailsVisibility.test.ts` | `closes the pane when the selection is cleared` | `nextDetailsVisible(true, null, 'table:orders')` | `false` |
| `test/unit/webview/detailsVisibility.test.ts` | `keeps a manual collapse while the selection is unchanged` | `nextDetailsVisible(false, 'table:orders', 'table:orders')` | `false` |
| `test/unit/webview/detailsVisibility.test.ts` | `keeps an open pane while the selection is unchanged` | `nextDetailsVisible(true, 'table:orders', 'table:orders')` | `true` |
| `test/unit/webview/detailsVisibility.test.ts` | `stays closed with no selection at all` | `nextDetailsVisible(false, null, null)` | `false` |

The "Diagram opens framed", "Canvas controls follow the VS Code theme" and "No
Add note button in the header" scenarios have no unit-testable seam — they are
React Flow measurement behavior, CSS, and a deleted DOM node respectively, and
the repo has no DOM test harness. They are verified in Manual Verify (step 5)
and by `npm run typecheck` + `npm run build`. **This is a conscious deviation
from the Definition of Ready and is part of what is being approved here.**

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm run build` — the webview bundle must build (the two deleted props must
  not leave a dangling reference).
- `npm test` — before the commit, must be green.

### Do not touch

- The refit triggers in the adopt effect (`added` / `reset` / `filterChanged` /
  `seeded`) and `mergeFlowNodes` — specs 04, 05 and 13 depend on them exactly as
  written. The only change permitted there is dropping the `isFirst` term.
- `webview-ui/hooks/useNotes.ts`, `NoteNode.tsx` and the note context-menu
  items — note behavior is unchanged; only the header button is removed.
- The filter sidebar's `filterVisible` default (`true`) and `SidebarRail` /
  `SidebarResizer`.
- Every existing CSS class body other than `:root`, the deleted
  `prefers-color-scheme` block, and the appended `.react-flow__controls*` rules.

## Acceptance Criteria

- [ ] Opening a diagram frames all table cards after measurement, at a legible zoom.
- [ ] The details sidebar is collapsed when a diagram opens with nothing selected.
- [ ] Selecting a table or column opens the details sidebar.
- [ ] Clicking empty canvas clears the selection and collapses the details sidebar.
- [ ] A manual collapse persists until the selection next changes.
- [ ] The `:root` palette reads VS Code theme variables and the
      `prefers-color-scheme` block is gone.
- [ ] The zoom / fit / lock control buttons render with theme background and
      legible `currentColor` icons on a dark theme.
- [ ] The header has no "Add note" button; `addNoteTick` and `onAddNoteAt` are
      gone from `App.tsx` and `DiagramCanvas.tsx`.
- [ ] Right-click "Add note here" still works.
- [ ] `npm run verify` is green.
