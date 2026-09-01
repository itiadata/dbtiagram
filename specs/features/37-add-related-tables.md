---
id: 37
title: Add related tables to the diagram
status: done
priority: high
created: 2026-09-01
owner: unassigned
depends_on: [05, 15, 24, 36]
---

# Add related tables to the diagram

## Summary

As a data engineer exploring a model's neighbourhood, I want to right-click a
table on the diagram and pull in every table it has a foreign key to — or that
has a foreign key to it — so that I can grow the diagram outward one hop at a
time instead of guessing which models to check in the sidebar.

## Background

Spec 35 caps the initially selected models for large workspaces, and spec 36
lets the user prune the canvas. Both make the *opposite* gesture necessary: once
you are looking at a small, curated diagram, the most common next question is
"what is connected to this?". Answering it today means reading the model.yml,
finding the referenced model names, and checking each one in the sidebar.

The relationships already exist in the graph the host publishes: `buildDiagram`
produces one `RelationEdge` per column-level FK pair, in both directions of
traversal. The full (unfiltered) graph is always present in the webview, so the
neighbours of a table can be computed without any host round trip.

## Scope

**In scope**

- An `Add related tables` item on the table card's context menu, available from
  both the header and a column row.
- "Related" = every model that is the `target` of an edge whose `source` is this
  table, plus every model that is the `source` of an edge whose `target` is this
  table (one hop, both directions, FK edges only).
- Checking those models in the filter, **and** checking the model.yml files that
  declare them, so file precedence cannot swallow the newly added tables.
- Disabling the item, with an explanatory tooltip, when the table has no
  related tables, or when every related table is already shown.

**Out of scope**

- Transitive expansion (more than one hop) or an "expand all" action.
- Adding related tables from the left sidebar's model rows.
- Any new relationship source: only the FK edges `buildDiagram` already
  produces count. A foreign key pointing at a model that does not exist in the
  workspace produces no edge and therefore no related table.
- Positioning the newly added tables anywhere specific — they receive their
  ordinary automatic slot, exactly as a model checked in the sidebar does.
- Removing tables (spec 36 owns that).

## Scenarios

### Add the tables a model points at

```
Given the diagram shows only "orders"
And "orders" has a foreign key on customer_id referencing ref('customers')
When the user right-clicks the "orders" header and chooses "Add related tables"
Then "customers" appears on the diagram
And "customers" is checked in the sidebar's Models list
And the model.yml file declaring "customers" is checked in the Model yml files list
```

### Add the tables that point at a model

```
Given the diagram shows only "customers"
And "orders" has a foreign key referencing ref('customers')
When the user right-clicks the "customers" header and chooses "Add related tables"
Then "orders" appears on the diagram
```

### Both directions in one action

```
Given the diagram shows only "orders"
And "orders" references ref('customers')
And "order_items" references ref('orders')
When the user chooses "Add related tables" on "orders"
Then both "customers" and "order_items" appear on the diagram
And no other model is added
```

### Only one hop

```
Given the diagram shows only "order_items"
And "order_items" references ref('orders')
And "orders" references ref('customers')
When the user chooses "Add related tables" on "order_items"
Then "orders" appears on the diagram
And "customers" does not
```

### The action is offered from a column row too

```
Given the diagram shows only "orders" with a column "customer_id"
When the user right-clicks the "customer_id" row and chooses "Add related tables"
Then the same tables are added as when right-clicking the header
```

### Nothing to add

```
Given the diagram shows "orders"
And every table related to "orders" is already on the diagram
When the user right-clicks the "orders" header
Then "Add related tables" is shown disabled
And its tooltip reads "No related tables to add"
```

### A model with no foreign keys at all

```
Given the diagram shows "date_spine", which no foreign key references and which declares none
When the user right-clicks the "date_spine" header
Then "Add related tables" is shown disabled
And its tooltip reads "No related tables to add"
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/relations.ts` | create | Pure one-hop neighbour lookup over a `DiagramGraph`, and the file set declaring a group of models. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Expose `addModels(names)`, which checks the models **and** their declaring files, bumping `filterTick`. |
| `webview-ui/App.tsx` | modify | Compute the related set for the right-clicked table and add the menu item. |
| `webview-ui/icons.ts` | modify | Re-export the `Waypoints` Lucide icon. |
| `test/unit/shared/relations.test.ts` | create | Unit tests for `relatedModels` and `filesDeclaring`. |
| `specs/ARCHITECTURE.md` | modify | Add the `src/shared/relations.ts` row; update `useDiagramFilter` and `icons.ts`. |
| `specs/README.md` | modify | Feature index row for 37. |

### Signatures

```ts
// src/shared/relations.ts  (shared — must not import `vscode`)
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramModelFile } from './protocol';

/**
 * The models one FK hop away from `model`, in both directions: edge targets
 * where `model` is the source, plus edge sources where `model` is the target.
 *
 * Returned in edge order with duplicates collapsed. `model` itself is never
 * included (self-referencing edges are already dropped by `buildDiagram`).
 */
export function relatedModels(graph: DiagramGraph, model: string): string[];

/**
 * The uris of the model.yml files declaring any of `models`, in `files` order
 * with duplicates collapsed. Used so adding a model also checks its file,
 * which otherwise hides it by file precedence (spec 05).
 */
export function filesDeclaring(
  files: readonly DiagramModelFile[],
  models: readonly string[],
): string[];
```

```ts
// webview-ui/hooks/useDiagramFilter.ts  (webview)
export interface DiagramFilterState {
  // …existing members unchanged…
  /**
   * Checks `names` and the files declaring them (spec 37). Names already
   * checked are left as they are; nothing is ever unchecked.
   */
  addModels: (names: readonly string[]) => void;
}
```

### Behavior notes

- **The neighbour computation runs against the FULL graph** (`graph` in
  `App.tsx`), never `visibleGraph` — the whole point is to reach models the
  filter is currently hiding (scenarios 1–3).
- **One hop only.** `relatedModels` walks `graph.edges` exactly once and never
  recurses (scenario 4).
- **Both directions, one pass.** For each edge: if `edge.source === model` push
  `edge.target`; if `edge.target === model` push `edge.source`. Duplicates are
  collapsed by a `Set` while preserving first-seen order, so the result is
  stable and testable (scenario 3).
- **`addModels` checks files too.** In the hook, `addModels(names)` computes
  `filesDeclaring(modelFiles, names)` and unions those uris into
  `selectedFiles`, then unions `names` into `selectedModels`, then bumps
  `filterTick`. Without the file union, spec 05's file precedence would keep the
  newly checked models invisible (scenario 1, third `And`).
- **`addModels` is purely additive.** It never unchecks a file or a model, so
  the user's existing curated view is preserved.
- **Menu item placement.** Added to `buildTableMenuItems` in `App.tsx`,
  immediately **after** `Reveal in model.yml` and before `Show columns`, with
  the exact label `Add related tables` and icon `<Waypoints size={16} />`. Being
  in `buildTableMenuItems` gives header and column right-clicks the same item
  (scenario 5).
- **Disabled state.** The item is `disabled: true` with
  `title: 'No related tables to add'` when
  `relatedModels(graph, model).filter((name) => !filter.visibleModels.has(name))`
  is empty — that single condition covers both "no relationships at all" and
  "all neighbours already shown" (scenarios 6 and 7). When `graph` is `null`
  the item is likewise disabled with that same tooltip.
- **`onSelect` passes the unfiltered `relatedModels(...)` result** to
  `filter.addModels`, not the already-narrowed list: adding an already-checked
  name is a harmless no-op and keeps the two call sites from drifting.
- **The selection does not move.** The right-clicked table stays selected (or
  unselected); no reveal or centering is triggered. The canvas re-fits because
  `filterTick` bumped, which is the same behavior as checking a box.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/relations.test.ts` | `relatedModels returns outgoing FK targets` | graph with edge `{source:'orders', target:'customers', sourceColumns:['customer_id'], targetColumns:['id'], virtual:false}`, `model = 'orders'` | `['customers']` |
| `test/unit/shared/relations.test.ts` | `relatedModels returns incoming FK sources` | same graph, `model = 'customers'` | `['orders']` |
| `test/unit/shared/relations.test.ts` | `relatedModels returns both directions` | edges `orders -> customers` and `order_items -> orders`, `model = 'orders'` | `['customers', 'order_items']` |
| `test/unit/shared/relations.test.ts` | `relatedModels stops after one hop` | edges `order_items -> orders` and `orders -> customers`, `model = 'order_items'` | `['orders']` |
| `test/unit/shared/relations.test.ts` | `relatedModels collapses duplicate edges` | two edges `orders -> customers` on different column pairs, `model = 'orders'` | `['customers']` |
| `test/unit/shared/relations.test.ts` | `relatedModels returns an empty list for an unrelated model` | edges `orders -> customers`, `model = 'date_spine'` | `[]` |
| `test/unit/shared/relations.test.ts` | `filesDeclaring returns the uris declaring the models` | files `[{uri:'a.yml',label:'a',models:['orders']},{uri:'b.yml',label:'b',models:['customers']}]`, `models = ['customers']` | `['b.yml']` |
| `test/unit/shared/relations.test.ts` | `filesDeclaring collapses a file declaring several of the models` | files `[{uri:'a.yml',label:'a',models:['orders','customers']}]`, `models = ['orders','customers']` | `['a.yml']` |
| `test/unit/shared/relations.test.ts` | `filesDeclaring ignores models no file declares` | files `[{uri:'a.yml',label:'a',models:['orders']}]`, `models = ['ghost']` | `[]` |

Scenarios 1–4 and 7 map to the `relatedModels` cases; scenario 1's file
requirement maps to the `filesDeclaring` cases. Scenarios 5 and 6 are
React-level wiring over those pure helpers and are verified by Manual Verify.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

- `src/diagram/graph.ts` — the edge set is consumed as-is; no new edge kind,
  no change to `foreignKeyColumns`.
- `src/shared/protocol.ts` — no message is added; the full graph the webview
  already holds is sufficient.
- `src/shared/filter.ts` — the new helpers live in their own module so the
  filter module stays about *selection*, not *graph traversal*.
- `useDiagramFilter`'s existing `applyScope` / `applyLayoutTables` /
  `applyModelFiles` logic, including the spec 35 initial cap — `addModels` is a
  new, independent entry point.

## Acceptance Criteria

- [ ] `Add related tables` appears on the table card's context menu from both
      the header and a column row.
- [ ] Choosing it adds every model one FK hop away, in both directions.
- [ ] The declaring model.yml files of the added models are checked too, so the
      new tables are actually visible.
- [ ] Models more than one hop away are not added.
- [ ] The item is disabled with the tooltip `No related tables to add` when
      there is nothing left to add.
- [ ] Already-visible tables and the current selection are unaffected.
- [ ] `npm run verify` is green.
