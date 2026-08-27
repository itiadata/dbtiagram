---
id: 20
title: Show foreign keys with missing columns as broken instead of dropping them
status: implemented
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [9, 12]
---

# Show foreign keys with missing columns as broken instead of dropping them

## Summary

As a dbt developer who edited a column name directly in `model.yml`, I want any
foreign key that still points at the old column name to be drawn as a visibly
broken relationship rather than silently vanishing, so that I can see that my
YAML is now inconsistent and fix it, instead of concluding the diagram is buggy.

## Background

Renaming a column *from the diagram* re-points every FK reference to it:
`renameColumn` in `src/dbt/edit/column.ts` rewrites `columns` and `to_columns`
on real constraints and virtual meta FKs alike. Renaming the same column *by
hand in the YAML* does no such thing — the `foreign_key` constraint keeps naming
the old column, which is a genuine inconsistency in the user's file.

Today that inconsistency is invisible and looks like a bug. `buildDiagram` still
emits the relation edge, and `buildFlowElements` still emits an FK edge whose
`sourceHandle` is `<old-column>:source:right`. But `TableNode` only mounts
handles for columns that exist, so React Flow cannot resolve the handle and
**drops the edge without a word**. The user sees FK lines disappear.

Two remedies were considered. Auto-repair — inferring the rename by diffing the
old and new column lists — is a heuristic that cannot distinguish a rename from
a delete-plus-add and would rewrite the user's file without asking. It was
rejected. This spec implements the alternative: draw the relationship as broken,
anchored to the card, and say why.

## Scope

**In scope**

- Detecting, in the pure flow layer, that an FK column pair names a column that
  does not exist on its model.
- Anchoring such an edge to a card-level handle (the card's vertical centre)
  instead of a non-existent column row, so the edge is always drawn.
- Styling a broken edge distinctly (error colour, dashed) with a tooltip naming
  the missing column.
- Marking the offending column selector in the details sidebar's Foreign keys
  section so the FK can be repaired there.

**Out of scope**

- Any automatic rewriting of `model.yml`. This feature never edits a file.
- FKs whose *target model* does not exist — `buildDiagram` already declines to
  emit an edge for those, and that stays unchanged.
- A workspace-wide diagnostics/problems list, or squiggles in the YAML editor.
- Changing how in-diagram renames re-point constraints (`renameColumn` is
  correct and untouched).

## Scenarios

### A renamed source column leaves a broken FK edge

```
Given order_items has a foreign_key constraint on column customer_id targeting ref('customers')
And I rename order_items.customer_id to cust_id directly in model.yml
When the diagram reloads
Then the FK edge is still drawn, anchored to the order_items card
And it is drawn in the error colour, dashed
And hovering it shows "order_items.customer_id -> customers.id (missing column: order_items.customer_id)"
```

### A renamed target column leaves a broken FK edge

```
Given order_items.customer_id targets customers.id via to_columns
And I rename customers.id to customer_id directly in model.yml
When the diagram reloads
Then the FK edge is still drawn, anchored to the customers card at its target end
And its source end still attaches to the order_items.customer_id row
And hovering it shows "order_items.customer_id -> customers.id (missing column: customers.id)"
```

### A healthy FK is unaffected

```
Given every column named by an FK exists on its model
When the diagram renders
Then the edge attaches to the exact column rows as before
And it carries no broken styling or missing-column tooltip
```

### The broken pair is flagged in the details sidebar

```
Given order_items has an FK naming a column that no longer exists
When I select order_items and look at its Foreign keys section
Then the column selector holding the missing name is marked as unresolved
And choosing an existing column from it repairs the constraint in model.yml
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/flow.ts` | modify | Detect missing FK columns; card-anchor handle ids; `unresolved` edge data and tooltip. |
| `webview-ui/TableNode.tsx` | modify | Always mount the four card-level handles; render the used one as a broken dot. |
| `webview-ui/hooks/useEdgeHighlighting.ts` | modify | Add the `edge--unresolved` class for edges carrying `data.unresolved`. |
| `webview-ui/ForeignKeySection.tsx` | modify | Mark a column selector whose value is not a column of its model. |
| `webview-ui/styles.css` | modify | Styles for `edge--unresolved`, the broken card dot, and the unresolved selector. |
| `test/unit/diagram/flow.test.ts` | modify | Unit tests for detection, handle anchoring and tooltip text. |
| `test/unit/diagram/graph.test.ts` | modify | Guard test: `buildDiagram` still emits the relation edge. |
| `specs/ARCHITECTURE.md` | modify | Update `src/diagram/flow.ts` exports with `CARD_ANCHOR`. |
| `specs/README.md` | modify | Add feature 20 to the index. |

### Signatures

```ts
// src/diagram/flow.ts  (pure — must not import `vscode`)

/**
 * Pseudo-column name used to build the card-level fallback handle ids that a
 * broken FK end attaches to. Chosen so no real YAML column name can collide.
 */
export const CARD_ANCHOR = '\u0000card';

/**
 * FlowEdgeData gains:
 *   /** Which ends of this FK name a column that does not exist (spec 20). *​/
 *   unresolved?: { source: boolean; target: boolean };
 * Present only when at least one end is missing; otherwise the key is absent.
 */
```

No other exported signature changes. `columnSourceHandle` / `columnTargetHandle`
are reused with `CARD_ANCHOR` as the column, producing `\u0000card:source:right`
and friends.

### Behavior notes

**Detection lives in `buildFlowElements`.** It already builds
`columnRowIndexLookup(graph)`; move that call above the `rawEdges` loop and, for
each column pair, compute:

```
const sourceMissing = columnIndexOf(edge.source, sourceColumn) === undefined;
const targetMissing = columnIndexOf(edge.target, targetColumn) === undefined;
```

Set `data.unresolved = { source: sourceMissing, target: targetMissing }` only
when `sourceMissing || targetMissing`; otherwise omit the key entirely (a
healthy edge's `data` must stay byte-identical to today's).

**Tooltip.** The base title is unchanged:
`` `${edge.source}.${sourceColumn} -> ${edge.target}.${targetColumn}` ``. When
an end is missing, append `` ` (missing column: ${list})` `` where `list` is the
missing ends in source-then-target order, each rendered `model.column`, joined
by `', '`. Literal examples:

- source only: `order_items.customer_id -> customers.id (missing column: order_items.customer_id)`
- target only: `order_items.customer_id -> customers.id (missing column: customers.id)`
- both: `order_items.customer_id -> customers.id (missing column: order_items.customer_id, customers.id)`

The singular word "column" is used in all three cases — do not pluralise.

**Handle anchoring in `routeEdges`.** `routeEdges` runs twice with two different
lookups (the dagre pass in `buildFlowElements`, the live pass in
`DiagramCanvas`), so the anchoring rule must be derived from the lookup, not
from `data.unresolved`, or the two passes could disagree. Inside the `edges.map`
callback, after the rect guard:

```
const sourceAnchor = columnIndexOf(edge.source, sourceColumn) === undefined ? CARD_ANCHOR : sourceColumn;
const targetAnchor = columnIndexOf(edge.target, targetColumn) === undefined ? CARD_ANCHOR : targetColumn;
```

Use `sourceAnchor`/`targetAnchor` when building `sourceHandle`/`targetHandle`
and when calling `addHandle`. `rowCenterY` is left exactly as it is: it already
returns `rect.height / 2` for an unknown column, and `CARD_ANCHOR` is likewise
unknown, so the router anchors at the card's vertical centre — which is where
the card handle mounts. The routed `points` therefore need no special case.
`data` is untouched by `routeEdges` beyond `points`, so the `unresolved` flag
computed once in `buildFlowElements` survives every live re-route.

**Card handles in `TableNode`.** Following the spec 12 rule that a handle must
be mounted at measurement time or its edge is dropped, mount all four card
handles unconditionally as direct children of the root `.table-node` div,
*before* the title div:

```
renderHandle(CARD_ANCHOR, 'left', 'target'), (…, 'right', 'target'),
renderHandle(CARD_ANCHOR, 'left', 'source'), (…, 'right', 'source')
```

React Flow's default handle positioning places a `Position.Left`/`Right` handle
at 50% of its positioned ancestor, i.e. the card's vertical centre — matching
`rowCenterY`'s `height / 2` fallback. `renderHandle` needs one addition: when
`column === CARD_ANCHOR` and the handle *is* used, add the class
`table-node__handle--broken` alongside (the unused-visibility rule is unchanged).
`handlesKey` already covers the card handles because it is derived from
`data.handles`.

**Edge class.** In `useEdgeHighlighting`, add `edge.data.unresolved !== undefined
? 'edge--unresolved' : null` to the existing `classes` array, after the
`edge--virtual` entry, so a broken virtual FK carries both.

**Sidebar marker.** In `ForeignKeySection`'s `FkCard`, the source selector's
options are `sourceColumns` and the target selector's are `targetColumns`. Wrap
each in the unresolved class when its current value is non-null and absent from
its options:

```
className={`fk-pair__select${options.includes(value ?? '') || value === null ? '' : ' fk-pair__select--unresolved'}`}
```

Applied to both the source and the target `.fk-pair__select` div. No change to
`SearchSelect` itself, and no change to the edit callbacks — picking a valid
column already writes the repaired constraint through the existing
`changeSource` / `changeTarget` handlers.

**CSS.**

- `.react-flow__edge.edge--unresolved .react-flow__edge-path` — `stroke: var(--error); stroke-dasharray: 4 3;`
- `.react-flow__handle.table-node__handle--broken` — `background: var(--error); border-color: var(--error);`
- `.fk-pair__select--unresolved` — `outline: 1px solid var(--error); border-radius: 3px;`

`edge--active` must keep winning on hover: place the `edge--unresolved` rule
*before* the existing `edge--active` rules in the file.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/flow.test.ts` | `anchors an FK to the card when the source column is missing` | Models: `order_items` with columns `[id]` and a `foreign_key` constraint `columns: [customer_id]`, `to: ref('customers')`, `to_columns: [id]`; `customers` with columns `[id]`. Run `buildFlowElements(buildDiagram(models), layoutDiagram(...))`. | Exactly 1 edge; `edge.sourceHandle` starts with `'\u0000card:source:'`; `edge.targetHandle` starts with `'id:target:'`; `edge.data.unresolved` equals `{ source: true, target: false }` |
| `test/unit/diagram/flow.test.ts` | `titles a source-missing FK with the missing column` | same input | `edge.data.title` equals `'order_items.customer_id -> customers.id (missing column: order_items.customer_id)'` |
| `test/unit/diagram/flow.test.ts` | `anchors an FK to the card when the target column is missing` | as above but `order_items` columns `[id, customer_id]` and `customers` columns `[customer_id]` (so `to_columns: [id]` dangles) | `edge.sourceHandle` starts with `'customer_id:source:'`; `edge.targetHandle` starts with `'\u0000card:target:'`; `edge.data.unresolved` equals `{ source: false, target: true }`; `edge.data.title` equals `'order_items.customer_id -> customers.id (missing column: customers.id)'` |
| `test/unit/diagram/flow.test.ts` | `titles an FK with both ends missing` | `order_items` columns `[id]`, `customers` columns `[customer_id]`, constraint as in case 1 | `edge.data.title` equals `'order_items.customer_id -> customers.id (missing column: order_items.customer_id, customers.id)'`; `edge.data.unresolved` equals `{ source: true, target: true }` |
| `test/unit/diagram/flow.test.ts` | `leaves a healthy FK unresolved-free` | `order_items` columns `[id, customer_id]`, `customers` columns `[id]`, constraint as in case 1 | `edge.data.unresolved` is `undefined`; `edge.sourceHandle` starts with `'customer_id:source:'`; `edge.targetHandle` starts with `'id:target:'`; `edge.data.title` equals `'order_items.customer_id -> customers.id'` |
| `test/unit/diagram/flow.test.ts` | `mounts the card handle on the node whose column is missing` | case 1 input | `nodes.find(n => n.id === 'order_items').data.handles` has a key starting `'\u0000card:source:'` |
| `test/unit/diagram/graph.test.ts` | `still emits a relation edge when the FK names a missing column` | case 1 models, `buildDiagram(models)` | `graph.edges` has length 1 with `sourceColumns` `['customer_id']` and `targetColumns` `['id']` |

The sidebar-marker scenario has no unit-testable seam (it is a className on a
React element and the repo has no DOM test harness); it is verified in Manual
Verify. **This is a conscious deviation from the Definition of Ready and is part
of what is being approved here.**

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm run build` — the webview bundle must build.
- `npm test` — before the commit, must be green.

### Do not touch

- `src/dbt/edit/column.ts` (`renameColumn` and its FK re-pointing) — it is
  correct; this feature is about YAML edited outside the diagram.
- `src/diagram/graph.ts` — `buildDiagram` keeps emitting the edge exactly as it
  does today; detection belongs to the flow layer, which knows the column lists.
- `rowCenterY` and `routeEdge` in `src/diagram/routing.ts` — the existing
  `height / 2` fallback is the anchor this feature relies on.
- The always-mount-every-handle rule from spec 12, and `updateNodeInternals`
  usage in `TableNode`.
- `SearchSelect.tsx`, and the FK edit callbacks in `ForeignKeySection`.

## Acceptance Criteria

- [ ] An FK naming a non-existent source column still draws an edge, anchored to
      the source card's centre.
- [ ] The same holds independently for a non-existent target column.
- [ ] Broken edges render in the error colour, dashed, and are distinguishable
      from virtual (dashed) FKs.
- [ ] Hovering a broken edge shows the exact missing-column tooltip text listed
      above.
- [ ] A healthy FK's handles, title and `data` are unchanged from today.
- [ ] The Foreign keys section marks the selector holding the missing column,
      and picking a valid column repairs `model.yml`.
- [ ] `npm run verify` is green.
