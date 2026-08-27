---
id: 21
title: Fix details pane auto-reveal and the lost first click after opening a diagram
status: done
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [19]
---

# Fix details pane auto-reveal and the lost first click after opening a diagram

## Summary

As a dbt modeller, I want the properties pane to appear the moment I select a
table or column, and I want my very first click on a freshly opened diagram to
register, so that I can start inspecting and editing models immediately instead
of hunting for the collapsed sidebar rail or clicking twice.

## Background

Spec 19 introduced an auto-revealing details sidebar governed by the pure policy
in `webview-ui/details-visibility.ts`. The policy itself is correct and unit
tested, but its wiring in `webview-ui/App.tsx` is not:

```tsx
const previousSelectionKeyRef = useRef(selectionKey(selection.selection));
useEffect(() => {
  const key = selectionKey(selection.selection);
  setDetailsVisible((previous) => nextDetailsVisible(previous, key, previousSelectionKeyRef.current));
  previousSelectionKeyRef.current = key;   // <-- mutated before the updater runs
}, [selection.selection]);
```

`setDetailsVisible` is given a **lazy** updater. React 18 does not invoke it at
call time; it invokes it during the following render — *after* line 3 has already
overwritten the ref. The updater therefore always observes
`previousKey === key`, `nextDetailsVisible` takes its "selection unchanged"
branch and returns `previous`, and the pane never opens. The bug is structural:
a ref read inside a lazy updater is a read-after-write hazard. The fix is to
stop storing the previous key outside React state and instead advance
`{ visible, key }` as one atomic piece of state through a pure transition.

Separately, on a fresh F5 the first click on a table card is sometimes swallowed.
`DiagramCanvas` performs a corrective `fitView` once `useNodesInitialized()`
reports the cards have been measured (spec 19, `DiagramCanvas.tsx:158-164`). That
runs in a passive `useEffect`, i.e. *after* the browser has painted the
un-fitted layout, so the user can already see and click the cards. If the
corrective fit lands between the user's pointerdown and pointerup, the viewport
zooms, the card slides out from under the cursor, the pointerup lands on a
different element and no `click` event is ever dispatched to the card header —
so `onTableSelect` never fires and the user has to click again.

## Scope

**In scope**

- Making the details sidebar reliably open when the selection changes to a table
  or column, and close when the selection is cleared, while preserving spec 19's
  rule that a manual collapse sticks until the selection next changes.
- Making the post-measurement corrective `fitView` run before the first paint,
  and suppressing it outright once the user has begun interacting with the
  canvas, so it can never cancel an in-flight click.

**Out of scope**

- Any change to the details sidebar's contents, layout, width or resizer.
- Any change to the selection model itself (`useSelection`), to what a click on
  a header/row/edge selects, or to `reconcileToGraph`.
- The other `fitView` calls in the adopt effect (node set grew, Auto-layout,
  filter toggle, saved-layout seed) — these stay exactly as they are.
- Focus management for the webview iframe or keyboard navigation.

## Scenarios

### Selecting a table reveals the details pane

```
Given a diagram is open and the details sidebar is collapsed
When I click a table header
Then the table is selected
And the details sidebar is visible and shows that table's properties
```

### Selecting a column while a table is selected keeps the pane open

```
Given a table is selected and the details sidebar is visible
When I click one of that table's column rows
Then the column is selected
And the details sidebar remains visible and shows that column's properties
```

### Clearing the selection collapses the pane

```
Given a table is selected and the details sidebar is visible
When I click empty canvas
Then the selection is cleared
And the details sidebar collapses to its rail
```

### A manual collapse sticks until the selection changes

```
Given a table is selected and the details sidebar is visible
When I collapse the details sidebar with its collapse button
Then the sidebar stays collapsed
And re-selecting the same table by clicking its header again leaves it collapsed
And selecting a different table re-opens it
```

### The first click on a freshly opened diagram registers

```
Given I have just opened a diagram panel and the tables have appeared
When I click a table header as soon as it is visible
Then that table is selected on that first click
And the viewport does not shift underneath the pointer during the click
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/details-visibility.ts` | modify | Add the `DetailsVisibility` state shape plus the pure `initialDetailsVisibility` / `advanceDetailsVisibility` transition that replaces the ref-based wiring. `selectionKey` and `nextDetailsVisible` stay as-is. |
| `webview-ui/initial-fit.ts` | create | Pure predicate deciding whether the post-measurement corrective fit should still run. |
| `webview-ui/App.tsx` | modify | Hold details visibility as `{ visible, key }` state advanced by the pure transition; drop `previousSelectionKeyRef`; route the manual collapse/expand through the new state. |
| `webview-ui/DiagramCanvas.tsx` | modify | Run the corrective fit in `useLayoutEffect`, gated by `shouldRunInitialFit`; record canvas pointer interaction. |
| `test/unit/webview/detailsVisibility.test.ts` | modify | Add cases for `initialDetailsVisibility` and `advanceDetailsVisibility`, including the regression that two successive different selections both open the pane. |
| `test/unit/webview/initialFit.test.ts` | create | Cases for `shouldRunInitialFit`. |
| `specs/ARCHITECTURE.md` | modify | Add `webview-ui/initial-fit.ts`; update the `details-visibility.ts` exports. |

### Signatures

```ts
// webview-ui/details-visibility.ts  (webview — pure module, no React/vscode imports)

/** Details-sidebar visibility paired with the selection key it was decided for. */
export interface DetailsVisibility {
  readonly visible: boolean;
  readonly key: SelectionKey;
}

/** Starting state: collapsed, anchored to the selection present at mount. */
export function initialDetailsVisibility(selection: Selection): DetailsVisibility;

/**
 * Advances the state for the current selection. Pure and idempotent: applying
 * it twice with the same selection yields the same state, so it is safe inside
 * a React state updater and under StrictMode double-invocation.
 */
export function advanceDetailsVisibility(
  previous: DetailsVisibility,
  selection: Selection,
): DetailsVisibility;
```

```ts
// webview-ui/initial-fit.ts  (webview — pure module, no React/vscode imports)

/**
 * Whether the one-off post-measurement corrective fit should run now.
 * True only when the cards have been measured, the fit has not already run,
 * and the user has not yet touched the canvas.
 */
export function shouldRunInitialFit(
  nodesInitialized: boolean,
  alreadyFitted: boolean,
  userInteracted: boolean,
): boolean;
```

### Behavior notes

- `initialDetailsVisibility(selection)` returns
  `{ visible: false, key: selectionKey(selection) }` — the sidebar always starts
  collapsed, exactly as spec 19 requires, regardless of the selection it is
  anchored to.
- `advanceDetailsVisibility(previous, selection)` computes
  `key = selectionKey(selection)` and returns
  `{ visible: nextDetailsVisible(previous.visible, key, previous.key), key }`.
  Because both the old key and the old visibility come from `previous`, there is
  no read-after-write hazard: the transition is correct whenever React chooses to
  invoke it. When `key === previous.key` the returned object must be
  **referentially `previous`**, not a fresh equal object, so a no-op selection
  change cannot trigger a re-render loop.
- In `App.tsx`, `detailsVisible` becomes `details.visible`. The effect is
  `useEffect(() => { setDetails((p) => advanceDetailsVisibility(p, selection.selection)); }, [selection.selection])`.
  `previousSelectionKeyRef` and the `nextDetailsVisible` / `selectionKey` imports
  it needed are deleted from `App.tsx`.
- The manual collapse button becomes
  `setDetails((p) => ({ ...p, visible: false }))` and the rail's expand becomes
  `setDetails((p) => ({ ...p, visible: true }))`. Neither touches `key`, which is
  what makes a manual collapse survive until the selection next changes
  (scenario "A manual collapse sticks until the selection changes").
- `DiagramCanvas` gains `userInteractedRef = useRef(false)`, set to `true` by an
  `onPointerDown` handler on the existing `.canvas__surface` wrapper `div`
  (capture phase, so it is recorded before React Flow's own drag handling and
  before any child `stopPropagation`). The handler only writes the ref; it must
  not call `setState` or `preventDefault`.
- The corrective fit effect changes from `useEffect` to `useLayoutEffect` and
  becomes:
  `if (!shouldRunInitialFit(nodesInitialized, didInitialFitRef.current, userInteractedRef.current)) { return; }`
  followed by the existing `didInitialFitRef.current = true;` and
  `void fitView({ padding: 0.15, maxZoom: 1 });`. `didInitialFitRef` is set to
  `true` **only when the fit actually runs**, so a suppressed-by-interaction pass
  does not permanently consume the one-off fit; the guard on `userInteracted`
  keeps it from ever firing later anyway. The dependency array becomes
  `[nodesInitialized, fitView]` — unchanged.
- Running the fit in `useLayoutEffect` means it is applied in the same commit as
  the measurement, before the browser paints, so the user never sees — and so can
  never click — the pre-fit viewport (scenario "The first click on a freshly
  opened diagram registers").

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/detailsVisibility.test.ts` | `starts collapsed with no selection` | `initialDetailsVisibility(null)` | `{ visible: false, key: null }` |
| `test/unit/webview/detailsVisibility.test.ts` | `starts collapsed even when a selection is present` | `initialDetailsVisibility({ kind: 'table', id: 'orders' })` | `{ visible: false, key: 'table:orders' }` |
| `test/unit/webview/detailsVisibility.test.ts` | `opens when the selection changes to a table` | `advanceDetailsVisibility({ visible: false, key: null }, { kind: 'table', id: 'orders' })` | `{ visible: true, key: 'table:orders' }` |
| `test/unit/webview/detailsVisibility.test.ts` | `stays open when the selection changes to a column` | `advanceDetailsVisibility({ visible: true, key: 'table:orders' }, { kind: 'column', model: 'orders', column: 'id' })` | `{ visible: true, key: 'column:orders.id' }` |
| `test/unit/webview/detailsVisibility.test.ts` | `closes when the selection is cleared` | `advanceDetailsVisibility({ visible: true, key: 'table:orders' }, null)` | `{ visible: false, key: null }` |
| `test/unit/webview/detailsVisibility.test.ts` | `keeps a manual collapse for an unchanged selection` | `advanceDetailsVisibility({ visible: false, key: 'table:orders' }, { kind: 'table', id: 'orders' })` | `{ visible: false, key: 'table:orders' }` |
| `test/unit/webview/detailsVisibility.test.ts` | `returns the same object for an unchanged selection` | `const s = { visible: true, key: 'table:orders' }; advanceDetailsVisibility(s, { kind: 'table', id: 'orders' })` | `toBe(s)` (referential identity) |
| `test/unit/webview/detailsVisibility.test.ts` | `re-opens after a manual collapse when a different table is selected` | `advanceDetailsVisibility({ visible: false, key: 'table:orders' }, { kind: 'table', id: 'customers' })` | `{ visible: true, key: 'table:customers' }` |
| `test/unit/webview/detailsVisibility.test.ts` | `opens on each of two successive selections (regression: spec 19 ref hazard)` | fold `advanceDetailsVisibility` from `initialDetailsVisibility(null)` over `[{table orders}, null, {table customers}]` | states `{true,'table:orders'}`, `{false,null}`, `{true,'table:customers'}` |
| `test/unit/webview/detailsVisibility.test.ts` | `is idempotent when applied twice with the same selection` | apply `advanceDetailsVisibility(_, {kind:'table',id:'orders'})` twice from `{ visible: false, key: null }` | both applications yield `{ visible: true, key: 'table:orders' }` |
| `test/unit/webview/initialFit.test.ts` | `does not fit before nodes are measured` | `shouldRunInitialFit(false, false, false)` | `false` |
| `test/unit/webview/initialFit.test.ts` | `fits once nodes are measured` | `shouldRunInitialFit(true, false, false)` | `true` |
| `test/unit/webview/initialFit.test.ts` | `does not fit twice` | `shouldRunInitialFit(true, true, false)` | `false` |
| `test/unit/webview/initialFit.test.ts` | `does not fit after the user has touched the canvas` | `shouldRunInitialFit(true, false, true)` | `false` |

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.
- Manual (F5 on `fixtures/sample-dbt`): click a table header — it is selected and
  the properties pane appears on that first click; click a column row — the pane
  stays open and switches to the column; click empty canvas — the pane collapses;
  collapse the pane manually, re-click the same header — it stays collapsed;
  click a different table — it re-opens. Reload the panel and click a card as
  soon as it renders — the selection takes on the first click.

### Do not touch

- `webview-ui/hooks/useSelection.ts` — the selection model and `reconcileToGraph`
  must stay byte-identical; this feature only changes how the *sidebar* reacts.
- `selectionKey` and `nextDetailsVisible` bodies and their existing tests — the
  policy is correct and stays the single source of truth for the new transition.
- The adopt effect in `DiagramCanvas.tsx` (lines 120-150) including all four of
  its `fitView` triggers, `mergeFlowNodes`, `routeEdges`, the `<ReactFlow>` prop
  set, and the note/reveal/context-menu wiring — unrelated to both defects.
- `webview-ui/TableNode.tsx` — the click handlers already do the right thing.
- `webview-ui/DetailsSidebar.tsx` and `webview-ui/SidebarChrome.tsx` — contents
  and chrome are unchanged; only the callbacks passed from `App.tsx` differ.

## Acceptance Criteria

- [x] Clicking a table header selects it and reveals the details sidebar on the
      first click.
- [x] Clicking a column row while the pane is open switches it to that column and
      keeps it open.
- [x] Clicking empty canvas clears the selection and collapses the pane.
- [x] A manual collapse survives re-selecting the same entity and is undone by
      selecting a different entity.
- [x] `App.tsx` no longer contains `previousSelectionKeyRef` or any ref read
      inside a state updater.
- [x] The post-measurement corrective fit runs in `useLayoutEffect` and is
      skipped once the user has interacted with the canvas.
- [x] The first click on a freshly opened diagram selects the clicked table.
- [x] `npm run verify` is green.
