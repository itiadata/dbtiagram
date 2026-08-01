---
id: 09
title: FK edges and handle dots follow column pairs
status: draft
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [03, 08]
---

# FK edges and handle dots follow column pairs

## Summary

As a dbt developer looking at the diagram, I want the diagram to show **only
real FK relationships**: every FK edge is a column-pair edge (source column →
target column), and the blue handle dot appears **only at the exact points
where an edge attaches**, on the dynamically best side for the simplest edge
arrangement. A column that is an FK source shows a dot where the line departs;
a column that is an FK target shows a dot where the line arrives; columns and
cards not involved in any FK show no dots at all. FKs with no column pairs are
**invisible drafts**: no edge is drawn, no dot appears, and model.yml contains
nothing about the FK until at least one column pair is defined.

This feature merges the former features 09 (dots only at edge endpoints) and
10 (FKs need at least one column pair): the two were drafted separately but
rewrite the same handle/edge machinery, and feature 10 removes the table-level
handles that feature 09 would otherwise have had to hide.

## Background

Spec 03 gave every column row a `target` Handle on its left edge and a `source`
Handle on its right edge, plus a table-level source/target handle pair at the
card's vertical center — so FK edges could attach to exact columns and, for FKs
with no column mapping, to the card itself. Spec 08's `addForeignKey`
immediately appended a real `foreign_key` constraint with empty
`columns`/`to_columns`, and `buildDiagram` drew a **table-level edge** for any
FK whose column arrays were empty (or unequal-length). Manual Verify of spec 08
surfaced three problems:

1. **Every card shows "extra" dots** — every column row rendered two dots (left
   target + right source) and every card two more at its vertical center,
   regardless of whether any edge used them.
2. **An FK with no pairs still draws a line** — an empty-pair FK (e.g. the
   products virtual FK after its pair was removed) became a table-level edge
   running to a header dot on the target card, and the empty-pair constraint
   stayed in model.yml.
3. **Fixed sides make back-edges ugly** — forcing source-right/target-left
   means an edge running against the layout direction (target left of source,
   e.g. a cycle's back-edge) still attaches at the fixed sides.

This feature makes the handle/dot set **derived from the edges** (only edges'
endpoints get dots), chooses each edge's sides **dynamically** from the node
positions so the path is simplest, removes the table-level edge concept
entirely, and makes the "constructing" FK state explicit: zero pairs = a draft
that exists only in webview memory.

## Scope

- `src/diagram/flow.ts` — `FlowNodeData` gains `handles` (the handle ids this
  node actually uses, with their side); `buildFlowElements` computes edge
  sides dynamically from node positions; the table-level edge branch and
  `TABLE_SOURCE_HANDLE` / `TABLE_TARGET_HANDLE` are removed.
- `src/diagram/graph.ts` — `buildDiagram` draws **no edge** for FKs with empty
  or unequal-length column arrays; descriptors still appear in
  `node.foreignKeys` so the sidebar can complete legacy zero-pair FKs.
- `webview-ui/TableNode.tsx` — column Handles mount **only when used**, each
  at its dynamically chosen side; the two table-level `<Handle>` elements are
  removed.
- `webview-ui/styles.css` — the base `.react-flow__handle` dot styling is
  unchanged; no hiding rules are needed (unused handles are not mounted).
- `src/dbt/edit.ts` — `addForeignKey` is replaced by `createForeignKey` (with
  the initial pairs + virtual flag); `setForeignKeyColumns` rejects empty pair
  arrays; `setForeignKeyVirtual` rejects converting a zero-pair FK.
- `webview-ui/App.tsx`, `webview-ui/ForeignKeySection.tsx` — the draft-FK
  flow: local draft cards until the first pair, auto-draft on last-pair
  removal; the edge double-click FK matcher drops its table-level branch.
- Fixtures — the products virtual FK pair is restored
  (`[product_id] → [customer_id]`); the zero-pair state becomes a unit-test
  case instead of fixture data.
- `test/unit/diagram/graph.test.ts`, `test/unit/diagram/flow.test.ts`,
  `test/unit/dbt/edit.test.ts`, `test/unit/fixture.test.ts`.

### Out of scope

- Adding/removing **columns or tables** (a later feature).
- Editing other constraint types through the UI.
- The legacy column `tests` key.
- Undo/redo.
- Vertical (top/bottom) handle positions: dagre lays the graph out
  left-to-right (LR), so edges always span ranks horizontally; a "vertical"
  edge (identical x-centers) cannot occur in an acyclic graph. Back-edges
  (cycles) are handled by the same horizontal comparison.

## Implementation Notes

### 1. Dynamic sides and handle ids (`src/diagram/flow.ts`)

The side of each edge's endpoints is chosen per edge from the laid-out node
positions: when the target's horizontal center is at or right of the source's,
the source emits from its **right** edge and the target receives on its
**left**; otherwise (target left of source — a back-edge) the source emits
from its **left** and the target receives on its **right**. This is the
simplest horizontal arrangement for any pair of nodes.

Handle ids encode both the column and the side, so one column can hold an edge
in each direction without id collisions:

```ts
export type HandleSide = 'left' | 'right';

export function columnSourceHandle(column: string, side: HandleSide): string {
  return `${column}:source:${side}`;
}
export function columnTargetHandle(column: string, side: HandleSide): string {
  return `${column}:target:${side}`;
}
```

`FlowNodeData` gains one JSON-serializable field (order-stable, deduped;
nodes with no edges omit it):

```ts
export type FlowNodeData = {
  label: string;
  description?: string;
  columns: TableNodeColumn[];
  highlightedColumns?: string[];
  primaryKey?: { columns: string[]; virtual: boolean };
  /**
   * Handle placements for the handles this node actually uses: keyed by the
   * full handle id (e.g. `customer_id:source:right`), value the side. Only
   * handles that an edge references appear here — the webview mounts a dot
   * exactly for these.
   */
  handles?: Record<string, HandleSide>;
};
```

`buildFlowElements` builds the `edges` array first (only the column-pair
branch; the table-level branch is deleted along with the
`TABLE_SOURCE_HANDLE`/`TABLE_TARGET_HANDLE` constants), collecting
`handles[sourceNodeId][sourceHandleId] = sourceSide` and the target side for
every edge, then attaches the deduped map to each node's `data`. The
`tableEdgeCounts`/`uniqueId` suffix machinery stays for duplicate column-pair
edges.

### 2. Graph (`src/diagram/graph.ts`)

`addEdge` skips an FK when `sourceColumns.length === 0` or the two arrays have
different lengths (a 1:1 pair mapping is only meaningful for equal-length
arrays). All other drop rules (unparseable `to`, unknown target, self-ref) are
unchanged. The FK descriptor is still pushed to `node.foreignKeys` in the node
pass, so legacy zero-pair FKs stay editable in the sidebar even though no edge
is drawn.

### 3. TableNode (`webview-ui/TableNode.tsx`)

Each column row renders a source/target `Handle` **only when its id is present
in `data.handles`**, positioned by the recorded side (`Position.Right` for
`'right'`, `Position.Left` for `'left'`):

```tsx
const handles = data.handles; // Record<string, HandleSide> | undefined
// ... per column:
{handles?.[columnSourceHandle(column.name, 'right')] !== undefined && (
  <Handle id={columnSourceHandle(column.name, 'right')} type="source" position={Position.Right} />
)}
{/* ... same pattern for source-left, target-left, target-right */}
```

The two table-level `<Handle>` elements and the `TABLE_*_HANDLE` imports are
removed. Handles stay mounted while an edge uses them — React Flow resolves
edge endpoints from mounted Handle elements — and the used set is derived from
the exact edges in the same `buildFlowElements` pass, so they are always
consistent.

### 4. Styles (`webview-ui/styles.css`)

No change beyond the existing base `.react-flow__handle` dot styling: unused
handles are simply not mounted, so there is nothing to hide. (The merged
feature intentionally drops the `--unused` class-toggle approach of the
original feature-09 draft.)

### 5. Edit kinds (`src/dbt/edit.ts`)

```
ModelEdit =
  | ... existing kinds ...
  | { kind: 'createForeignKey'; model: string; target: string; columns: string[]; toColumns: string[]; virtual: boolean }
```

- **`addForeignKey` removed**, replaced by `createForeignKey`:
  - `target` must name a workspace model → `EditError` otherwise.
  - `columns.length === toColumns.length` → `EditError` otherwise.
  - `columns.length >= 1` → `EditError('A foreign key needs at least one
    column pair')` when 0.
  - every source column exists on `model`; every target column exists on the
    target model (resolved by `target`) → `EditError` otherwise.
  - real → append `{ type: 'foreign_key', columns, to: ref('target'),
    to_columns: toColumns }`; virtual → append `{ to: ref('target'), columns,
    to_columns: toColumns }` to the meta block's `foreignKeys` (creating the
    block when needed).
- **`setForeignKeyColumns`**: `columns.length === 0` → `EditError('A foreign
  key needs at least one column pair')` (the UI removes the FK instead of
  emptying it). Equal-length and column-existence validations are unchanged.
- **`setForeignKeyVirtual`**: when the matched FK has empty `columns` and
  `toColumns` → `EditError('Add a column pair before changing storage')`
  (converting a zero-pair FK would persist a zero-pair FK in the other
  storage). Both directions enforce this.
- `setForeignKeyTarget` and `removeForeignKey` are unchanged. Changing the
  target of a **legacy zero-pair** FK (hand-written YAML) remains allowed — it
  edits an existing entry rather than creating an empty one.

### 6. Webview draft-FK flow

`App.tsx` owns `draftFks: Record<string, DraftForeignKey[]>`:

```ts
interface DraftForeignKey {
  draftId: string;   // local, stable key (e.g. an incrementing counter)
  target: string;
  virtual: boolean;
  columns: string[];     // always empty while a draft
  toColumns: string[];   // always empty while a draft
}
```

- The FK section's merged list is `node.foreignKeys` (file FKs) followed by
  `draftFks[node.id]` (drafts). Draft cards render identically to file FK cards
  plus a `fk-card--draft` class and a note ("Draft — add a column pair to
  create this FK"). Their Virtual checkbox toggles the draft's local flag;
  their Remove button drops the draft locally (nothing to persist).
- **Add foreign key** (the trailing SearchSelect) no longer posts an edit — it
  appends a local draft `{ target, virtual: false, columns: [], toColumns: [] }`.
- **Draft card "+ Add pair"** posts `createForeignKey` with the pair and the
  draft's virtual flag, then removes the draft from local state. The host's
  `diagram:update` makes the FK card appear; a rejected edit (e.g. unknown
  column) surfaces the existing error banner and the FK simply does not appear.
- **Persisted FK card "+ Add pair"** posts `setForeignKeyColumns` (append pair)
  as today. **Remove pair on the last pair** posts `removeForeignKey` AND adds
  a local draft with the same `target` and `virtual` flag, so the card becomes
  a draft again (the user can keep building or abandon it). Removing a middle
  pair posts `setForeignKeyColumns` as today.
- The **Virtual checkbox is disabled on zero-pair file FK cards** (legacy
  zero-pair FKs cannot be converted — the pure layer rejects it); it stays
  enabled on draft cards.
- `App.tsx`'s edge double-click FK matcher drops its table-level branch (a
  zero-pair descriptor can no longer match a drawn edge, since zero-pair FKs
  draw no edge).

### 7. Fixtures

`fixtures/sample-dbt/models/products.yml` — restore the virtual FK pair to
`columns: [product_id]` / `to_columns: [customer_id]` (the empty-pair state in
the working tree was the Manual-Verify bug state; it currently breaks
`test/unit/fixture.test.ts`). The zero-pair behavior is covered by new graph
unit tests instead.

### 8. Tests

- `diagram/graph.test.ts` — a real zero-pair FK produces no edge but keeps its
  descriptor; an unequal-length FK produces no edge; a virtual zero-pair FK
  produces no edge; the existing edge tests stay green.
- `diagram/flow.test.ts` — the `TABLE_*_HANDLE` imports and table-level edge
  tests are removed; a zero-pair FK yields no edges; every edge is column-level
  with equal non-empty pairs; handle ids encode the side; the per-node
  `handles` map is derived correctly: a column that is only a target is in the
  target handles, a column that is only a source is in the source handles, an
  FK-unrelated column appears in neither, a column that is both (two models
  referencing each other) appears in both, and a node with no edges omits
  `handles`; sides are dynamic — a forward edge (target right of source) uses
  `source:right`/`target:left`, a back-edge (target left of source) uses
  `source:left`/`target:right`; multiple edges sharing a column dedupe to one
  handle id per (column, side).
- `dbt/edit.test.ts` — remove the `addForeignKey` suite; add `createForeignKey`
  (real + virtual persistence, ≥1 pair validation, unequal-length rejection,
  unknown target, unknown source/target column, identity/no-op guard);
  `setForeignKeyColumns` empty-array rejection (replacing the old empty-write
  test); `setForeignKeyVirtual` zero-pair rejection in both directions.
- `fixture.test.ts` — restored virtual-edge expectation; round trip stays
  lossless.

## Scenarios

### A target column shows a dot only where the FK arrives

```
Given the dbt Diagram is open and staging_orders.order_id is an FK to orders.order_id
When the user looks at the orders card
Then the order_id row shows a dot where the edge arrives
And the order_id row shows no other dots
```

### A source column shows a dot only where the FK departs

```
Given the dbt Diagram is open and orders.customer_id is an FK to customers.customer_id
When the user looks at the orders card
Then the customer_id row shows a dot where the edge departs
And the customer_id row shows no other dots
```

### An unrelated column shows no dots

```
Given the dbt Diagram is open and total_amount participates in no FK
When the user looks at the orders card
Then the total_amount row shows no dot on either side
```

### A table with no FK edges shows no dots anywhere

```
Given the dbt Diagram is open and a table has no FK edges at all
When the user looks at that card
Then no handle dots are visible on any row or on the card edges
```

### A column that is both source and target shows both dots

```
Given model A has a column c with an outgoing FK to model B
And model B has a column c with an outgoing FK to model A
When the user looks at both cards
Then the c rows show a dot for each edge endpoint
```

### Back-edges attach on the dynamically best side

```
Given the dbt Diagram is open and model A (laid out left of B) has an FK to B, and B has an FK back to A
When the user looks at the two cards
Then the forward edge attaches to A's right and B's left
And the back edge attaches to B's left... (the side facing A) and A's right... (the side facing B)
```

### An FK without column pairs draws no edge and no dot

```
Given the dbt Diagram is open and products has a virtual FK to customers with no column pairs
When the user looks at the diagram
Then no edge is drawn between products and customers
And no handle dot appears at the point where the edge would have arrived
```

### Creating an FK writes nothing until the first pair

```
Given the dbt Diagram is open and the products table is selected
When the user clicks Add foreign key and picks customers
Then no file is written and no diagram edge appears
And a draft FK card for customers is shown in the Foreign keys section with no pairs
When the user clicks + Add pair on the draft
Then products.yml gains the FK with columns [product_id] and to_columns [customer_id]
And an edge is drawn from products.product_id to customers.customer_id
```

### Removing the last pair removes the FK from the file

```
Given the dbt Diagram is open and order_items has a foreign_key constraint to orders with one pair
When the user removes the last column pair of that FK
Then the constraint is removed from order_items.yml
And the edge disappears from the diagram
And a draft FK card targeting orders remains in the Foreign keys section
```

### A draft FK can be abandoned without touching the file

```
Given the dbt Diagram is open and a draft FK card exists
When the user clicks Remove on the draft card
Then the card disappears
And no file was written and no file was changed
```

### The Virtual checkbox is disabled for zero-pair file FKs

```
Given the dbt Diagram is open and a model.yml declares a foreign_key constraint with no columns
When the user selects that table and opens the FK card
Then the Virtual checkbox is disabled
And the card shows the draft note
```

### Invalid createForeignKey calls surface the error banner

```
Given the dbt Diagram is open and a draft FK card targets customers
When the user tries to create it with a source column that does not exist
Then an error banner shows
And no file is written
```

## Acceptance Criteria

- [ ] `buildFlowElements` emits only column-level edges (equal, non-empty
      pairs); the table-level edge branch and `TABLE_SOURCE_HANDLE` /
      `TABLE_TARGET_HANDLE` are removed; TableNode renders no table-level
      handles.
- [ ] `buildFlowElements` computes each edge's endpoint sides dynamically from
      the node positions (target center ≥ source center → source right /
      target left; otherwise the flip) and attaches a per-node `handles` map
      (handle id → side) to `FlowNodeData`, deduped and order-stable.
- [ ] The webview mounts a source/target Handle for a column **only when its
      id is in `data.handles`**, at the recorded side; unrelated columns and
      edge-free cards show no dots anywhere; used handles keep the current dot
      styling; edge geometry is unchanged apart from the side choice.
- [ ] `buildDiagram` draws no edge for FKs with empty or unequal-length column
      arrays; descriptors stay in `node.foreignKeys`; all other edge drop
      rules are unchanged.
- [ ] `createForeignKey` persists an FK with its initial pairs (real
      constraint or virtual meta entry), validating target existence, equal
      pair lengths, ≥1 pair, and source/target column existence.
- [ ] `setForeignKeyColumns` rejects empty pair arrays; `setForeignKeyVirtual`
      rejects converting zero-pair FKs; `addForeignKey` is gone from
      `ModelEdit`.
- [ ] The webview keeps zero-pair FKs as local drafts: Add foreign key creates
      a draft without any file write; the first pair persists it via
      `createForeignKey`; removing the last pair of a persisted FK deletes it
      from the file and keeps a draft card; draft cards are marked visually and
      their Virtual toggle is local.
- [ ] The Virtual checkbox is disabled on zero-pair file FK cards.
- [ ] The fixture graph (with its real + virtual column-level FKs) shows dots
      only at the exact edge endpoints and no table-level dots anywhere; the
      products fixture's virtual FK pair is restored and the fixture graph
      test expects the virtual edge again; the zero-pair-no-edge behavior is
      covered by unit tests.
- [ ] New/updated unit tests pass (graph, flow, edit, fixture) and the existing
      suites stay green; `npm test` and `npm run typecheck` pass.

## Confirm at Approval

- **(a) Dynamic sides.** The side of each edge's endpoints is chosen per edge
  from the laid-out node positions — not fixed right-for-source/left-for-target
  — so forward edges and back-edges both take the simplest horizontal path.
  (User decision on former feature-09 point (b).)
- **(b) Only used handles are mounted.** "Blue dot only on the used" is
  implemented by not mounting unused handles at all (conditional rendering),
  rather than the earlier `--unused` class-toggle/hide approach — unused
  handles serve no geometry and hiding them with CSS would be dead weight.
  (User decision on former feature-09 point (b).)
- **(c) No table-level edges, ever.** The table-level edge concept (spec 03)
  and the empty-`addForeignKey` (spec 08) are removed: FKs are column-pair
  edges only, created atomically with their first pair. (Former feature-10
  point (a).)
- **(d) Draft persistence semantics.** Add foreign key creates a webview-only
  draft; nothing is written until the first pair. Removing the last pair of a
  persisted FK deletes it from the file and keeps a draft card with the same
  target/virtual flag so the user can continue or abandon it. **If instead the
  last-pair removal should delete the FK outright (no draft card), say so.**
  (Former feature-10 point (b).)
- **(e) Zero-pair rejection.** `setForeignKeyColumns` (empty arrays) and
  `setForeignKeyVirtual` (zero-pair FK) are rejected by the pure layer so the
  file never holds a zero-pair FK as the result of an editor action; the UI
  routes around them (remove-FK, disabled checkbox, draft flow).
  `setForeignKeyTarget` on a legacy zero-pair FK remains allowed (it edits an
  existing hand-written entry rather than creating an empty one).
- **(f) Fixture restore.** The products.yml virtual FK pair is restored so the
  sample renders the virtual edge + endpoint dots again (this also fixes the
  currently-failing fixture tests); the empty-pair state is exercised by unit
  tests instead.
- **(g) Merge.** Former features 09 and 10 are one feature: feature 10 depends
  on 09 and both rewrite the same handle/edge code, so they are implemented
  and shipped together. (User decision on former feature-09 point (c).)
