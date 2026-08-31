---
id: 32
title: Fit the view after auto-layout
status: approved
priority: medium
created: 2026-08-31
owner: unassigned
depends_on: [19, 21]
---

# Fit the view after auto-layout

## Summary

As a user of the diagram, I want the viewport to fit the whole diagram right
after I press Auto-layout, so that I immediately see the arrangement I just asked
for instead of having to pan and zoom to find it.

## Background

`DiagramCanvas` already *intends* to refit after an auto-layout: the adopt effect
(`webview-ui/DiagramCanvas.tsx`, the `useEffect` over
`[flow, layoutTick, filterTick, seedTick, seedPositions, fitView]`) calls
`fitView({ padding: 0.15, maxZoom: 1 })` whenever
`added || reset || filterChanged || seeded`.

It calls it too early. `setRfNodes(...)` in the same effect body only *schedules*
the new node list; React Flow's store still holds the previous positions when
`fitView` runs on the next line. The viewport is therefore fitted to the
arrangement the diagram had *before* the auto-layout, which after a dagre
re-arrangement can be a completely different region of the canvas. The same
one-commit-too-early problem applies to the other three triggers (node added,
filter toggled, layout seeded); auto-layout is simply where it is most visible,
because it is the trigger that moves every node at once.

The fix is to defer the fit by one commit, mirroring what spec 21 already does
for the post-measurement corrective fit: record that a fit is owed, then perform
it from an effect that runs after the new nodes have reached the store.

## Scope

**In scope**

- Deferring the adopt effect's `fitView` until after the new node positions are
  committed, for all four of its triggers.
- A pure policy function for "should the owed fit run now", unit-tested next to
  `shouldRunInitialFit`.

**Out of scope**

- Changing when a fit is triggered. The trigger set —
  `added || reset || filterChanged || seeded` — stays exactly as it is; only the
  timing changes.
- The declarative `fitView` prop on `<ReactFlow>` and the spec 21 corrective fit,
  both unchanged.
- Fit padding or `maxZoom`, which stay `0.15` and `1`.

## Scenarios

### Auto-layout fits the whole diagram

```
Given a diagram whose tables have been dragged far apart and partly off screen
When I press the Auto-layout button
Then the tables are re-arranged by dagre
And the viewport fits every table with the standard padding
```

### Auto-layout fits even after the user has panned

```
Given I have panned and zoomed the canvas
When I press the Auto-layout button
Then the viewport still fits the whole re-arranged diagram
```

### Typing does not refit

```
Given I am editing a column description inline
When the diagram updates from the edit
Then the viewport does not move
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/initial-fit.ts` | modify | Add `shouldRunPendingFit`, the pure policy for the deferred fit, alongside the existing `shouldRunInitialFit`. |
| `webview-ui/DiagramCanvas.tsx` | modify | Record an owed fit in the adopt effect instead of fitting inline; consume it in a follow-up effect once the new nodes are committed. |
| `specs/ARCHITECTURE.md` | modify | Update the `webview-ui/initial-fit.ts` row's responsibility and key exports. |
| `test/unit/webview/initialFit.test.ts` | modify | Unit tests for `shouldRunPendingFit`. |

### Signatures

```ts
// webview-ui/initial-fit.ts  (webview — pure)

/**
 * Whether an owed viewport fit (spec 32) should run now: a fit was requested by
 * the adopt effect and React Flow has measured the nodes. Unlike
 * `shouldRunInitialFit`, this ignores whether the user has touched the canvas —
 * the fit is the direct result of an action the user just took (Auto-layout,
 * a filter toggle, opening a layout, a new table appearing).
 */
export function shouldRunPendingFit(nodesInitialized: boolean, fitPending: boolean): boolean;
```

### Behavior notes

1. In `DiagramCanvas`, add `const pendingFitRef = useRef(false);` next to
   `didInitialFitRef`. The adopt effect's final block becomes:

   ```ts
   if (added || reset || filterChanged || seeded) {
     pendingFitRef.current = true;
   }
   ```

   The inline `void fitView(...)` on that line is removed. No other line of the
   adopt effect changes, and its dependency array is unchanged.
2. Add a new effect immediately after the adopt effect:

   ```ts
   useEffect(() => {
     if (!shouldRunPendingFit(nodesInitialized, pendingFitRef.current)) return;
     pendingFitRef.current = false;
     void fitView({ padding: 0.15, maxZoom: 1 });
   }, [rfNodes, nodesInitialized, fitView]);
   ```

   Keying on `rfNodes` is what buys the deferral: the effect runs after the new
   node list has been committed and pushed into React Flow's store, so `fitView`
   measures the arrangement the user just asked for.
3. `pendingFitRef` is a ref, not state, so setting it never causes a render; the
   `rfNodes` change that the adopt effect already causes is what schedules the
   consuming effect. When the adopt effect requests a fit without changing
   `rfNodes` (impossible for the four current triggers, but harmless), the fit is
   simply performed at the next node change.
4. The fit is owed at most once: the flag is cleared before `fitView` is called,
   so two rapid Auto-layout presses still produce one fit per press and never a
   stale extra fit.
5. The spec 21 corrective fit (`shouldRunInitialFit`, in a `useLayoutEffect`) is
   untouched and keeps its own `didInitialFitRef` guard and its
   `userInteractedRef` abandon rule. The two policies are independent: the
   corrective fit is a one-off repair of a pre-measurement fit, the owed fit is a
   response to an explicit action. If both are due on the same commit, the
   corrective layout effect runs first and the owed fit runs after with the same
   parameters, so the result is identical either way.
6. `shouldRunPendingFit` deliberately does **not** take `userInteracted`. Ignoring
   it is the whole point of scenario "Auto-layout fits even after the user has
   panned".

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/initialFit.test.ts` | `runs an owed fit once nodes are measured` | `shouldRunPendingFit(true, true)` | `true` |
| `test/unit/webview/initialFit.test.ts` | `waits for measurement` | `shouldRunPendingFit(false, true)` | `false` |
| `test/unit/webview/initialFit.test.ts` | `does nothing when no fit is owed` | `shouldRunPendingFit(true, false)` | `false` |
| `test/unit/webview/initialFit.test.ts` | `does nothing when neither holds` | `shouldRunPendingFit(false, false)` | `false` |

The three scenarios are covered by these cases plus the unchanged trigger set:
"Auto-layout fits the whole diagram" and "…after the user has panned" map to
`shouldRunPendingFit(true, true) === true` (the flag is set by the unchanged
`reset` branch, and the policy ignores user interaction); "Typing does not
refit" maps to `shouldRunPendingFit(true, false) === false` (a live edit sets no
flag, because none of the four triggers fire).

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.
- Manual: drag tables far apart, pan away, press Auto-layout, confirm the whole
  diagram is framed; then type in a column description and confirm the viewport
  does not move.

### Do not touch

- The `fitView` prop and `fitViewOptions` on `<ReactFlow>`.
- `shouldRunInitialFit` and the `useLayoutEffect` that calls it, including
  `didInitialFitRef` and `userInteractedRef`.
- The adopt effect's merge logic (`mergeFlowNodes`, the seeded/reset branches),
  its trigger conditions and its dependency array.
- The fit parameters `{ padding: 0.15, maxZoom: 1 }`, used identically at all
  call sites.

## Acceptance Criteria

- [ ] Pressing Auto-layout leaves the whole re-arranged diagram framed in the
      viewport.
- [ ] The adopt effect no longer calls `fitView` inline.
- [ ] `shouldRunPendingFit` is pure and unit-tested for all four input
      combinations.
- [ ] Live edits and renames still never move the viewport.
- [ ] `npm run verify` is green.
