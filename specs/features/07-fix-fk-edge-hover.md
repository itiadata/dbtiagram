---
id: 07
title: Fix FK edge hover interactivity
status: approved
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [06]
---

# Fix FK edge hover interactivity

## Summary

As a dbt developer, I want to hover an FK edge in the diagram and see it and
its columns highlighted again, and I want the cursor over an edge to be a
pointer instead of the panning "open hand", so the edge hover behavior
regressed by spec 06 is restored.

## Background

Hovering an FK edge no longer works. The columns still highlight on hover (the
reverse column-hover direction), but the line itself never reacts, and the
mouse shows the pane's "grab" hand (an open hand) everywhere over the canvas.

**Root cause.** Spec 06 set `elementsSelectable={false}` on `<ReactFlow>` to
keep React Flow's native selection out of the way of the custom selection
model. React Flow's `EdgeWrapper` then computes `isSelectable = false` for
every edge and — because the webview also passes no `onEdgeClick` — renders
each edge `<g>` with the class `inactive` (`inactive: !isSelectable && !onClick`).
The library's base stylesheet applies:

```css
.react-flow__edge.inactive {
  pointer-events: none;
}
```

so no edge ever receives mouse events: `onEdgeMouseEnter`/`onEdgeMouseLeave`
(already wired in `webview-ui/App.tsx`) never fire, the hover highlight never
activates, and the pointer falls through to the panning pane
(`.react-flow__pane` has `cursor: grab` — the open hand). Hovering a column
still works because column rows are ordinary DOM elements with their own
`onMouseEnter` handlers, and the column→edge highlight direction runs off the
`hoveredColumn` state rather than edge mouse events.

**Fix.** Make edges interactive again **without** re-enabling React Flow's
native selection:

- Pass an `onEdgeClick` handler to `<ReactFlow>`. A defined `onEdgeClick` makes
  `inactive` false (`!isSelectable && !onClick`), so edges get pointer events
  back and the existing `onEdgeMouseEnter`/`onEdgeMouseLeave` handlers fire
  again. Because `isSelectable` stays false, clicking still performs **no**
  native selection (`onEdgeClick` only calls `addSelectedEdges` when
  `isSelectable`); the click instead runs our own handler, which selects the
  child (source) table in the details sidebar — the natural click behavior that
  also gives the handler a purpose.
- Add `cursor: pointer` for `.react-flow__edge` so hovering an edge shows a
  pointer instead of falling through to the pane's grab cursor.
- Keep `elementsSelectable={false}` and the 24px `interactionWidth` hit band
  (spec 03) unchanged.

The change is confined to the webview (`webview-ui/App.tsx` and
`webview-ui/styles.css`). No pure module (`src/dbt/`, `src/diagram/`,
`src/shared/`) changes, no new edit kinds, and no protocol change — the
single-click-selection behavior is webview state only.

## Scope

- Passing `onEdgeClick` to `<ReactFlow>`; the handler selects the edge's source
  (child) table (`onTableSelect(edge.source)`).
- `cursor: pointer` on `.react-flow__edge`.
- Keeping `elementsSelectable={false}` and the custom selection model.
- A regression-guard scenario for column hover.

### Out of scope

- Double-click on an edge (opens the FK editor) — feature 08.
- Any changes to `src/dbt/`, `src/diagram/`, `src/shared/`, `src/vscode/`,
  `src/webview/panel.ts`, or the message protocol.
- Changing the edge routing, the interaction band width, or the hover highlight
  styles themselves (they work once pointer events are restored).

## Implementation Notes

### 1. `webview-ui/App.tsx`

- Add an `onEdgeClick` handler next to the existing
  `onEdgeMouseEnter`/`onEdgeMouseLeave`:

```ts
const onEdgeClick = useCallback(
  (_event: ReactMouseEvent, edge: Edge): void => {
    onTableSelect(edge.source);
  },
  [onTableSelect],
);
```

- Pass `onEdgeClick={onEdgeClick}` to `<ReactFlow>` (in `DiagramCanvas`, whose
  props gain the handler like the mouse-enter/leave pair). Do **not** touch
  `elementsSelectable={false}`.
- No other webview logic changes: `activeEdgeIds`, the `edges` memo
  (`edge--active` class + `animated`), `highlightedColumns`, and the
  `hoveredEdgeId` state all already work once the edge fires mouse events.

### 2. `webview-ui/styles.css`

```css
/* Edges are interactive again (feature 07): once an edge is not `inactive`
   its 24px interaction band receives pointer events; show a pointer instead
   of the pane's grab cursor. */
.react-flow__edge {
  cursor: pointer;
}
```

The base stylesheet's `.react-flow__edge.inactive { pointer-events: none; }`
is neutralized by the `onEdgeClick` change (edges no longer carry the
`inactive` class), so no override of that rule is needed.

### 3. Tests

No pure-module logic changes, so no new Vitest suites. The existing unit
suites (`test/unit/**`) and the integration smoke suite must stay green; the
behavior is verified by `npm run typecheck` and Manual Verify in the
`fixtures/sample-dbt` F5 workspace (the webview has no automated DOM testing in
this repo). `test/unit/diagram/flow.test.ts` already asserts that every edge
carries `interactionWidth` (the hit band), which is what makes the restored
pointer events work without pixel-perfect aiming.

## Scenarios

### Hovering an FK edge highlights it again

```
Given the dbt Diagram is open and shows an FK bundle between order_items and orders
When the user hovers the FK edge's trunk
Then every segment of the edge is highlighted
And the rows for the involved columns on both nodes are highlighted
```

### Hovering a column still highlights its connected edges

```
Given the dbt Diagram is open and shows an FK edge between two models
When the user hovers a column that participates in a foreign key
Then the connected edge is highlighted
And the counterpart columns on the other side are highlighted
```

### The cursor over an FK edge is a pointer, not the panning hand

```
Given the dbt Diagram is open and shows an FK edge
When the user moves the pointer over the edge
Then the cursor is a pointer
And the pointer over the empty canvas still shows the panning grab hand
```

### Clicking an FK edge selects the child table

```
Given the dbt Diagram is open and shows an FK edge from order_items to orders
When the user clicks the edge
Then the order_items card is highlighted as selected
And the details sidebar shows the order_items table properties
And no React Flow native selection ring is drawn (elementsSelectable stays off)
```

### The hover highlight clears when leaving the edge

```
Given the dbt Diagram is open and an FK edge is hovered
When the user moves the pointer off the edge
Then the edge returns to its normal stroke and the column highlights clear
```

## Acceptance Criteria

- [ ] Hovering an FK edge (column-level or table-level) activates the existing
      `edge--active` highlight: all segments widen, and the involved columns
      on both nodes highlight; leaving the edge clears both.
- [ ] The cursor over an FK edge is a pointer; the empty canvas keeps the
      panning grab hand.
- [ ] Single-clicking an FK edge selects its source (child) table in the
      details sidebar; no native React Flow edge selection is engaged
      (`elementsSelectable` stays `false`).
- [ ] Column hover → edge highlight (reverse direction) is unchanged.
- [ ] `webview-ui/App.tsx` and `webview-ui/styles.css` are the only changed
      files; no pure-module, protocol, or panel changes.
- [ ] `npm test` and `npm run typecheck` pass.

## Confirm at Approval

- **(a) Click behavior.** The fix provides `onEdgeClick` (which is what removes
  the `inactive` class) with the behavior "single-click selects the child
  table". If preferred, the handler can instead be a no-op — but a defined
  handler is required either way, and selecting the child table is the natural
  minimal behavior (and is what feature 08's edge double-click builds on).
- **(b) Cursor.** Edges show `cursor: pointer`. If a different cursor (e.g.
  the default arrow) is preferred over the pointer, that is a one-line change.
