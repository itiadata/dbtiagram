---
id: 02
title: Column-level foreign key edges
status: done
priority: high
created: 2026-07-31
owner: unassigned
depends_on: []
---

# Column-level foreign key edges

## Summary

As a dbt developer, I want the diagram to draw each foreign key to and from the
specific columns that form it — one edge bundle per FK constraint, fanning in
from the source columns, traveling as a single trunk, and fanning out to the
target columns — and I want hovering a bundle to highlight the edge and the
involved columns, so I can trace relationships precisely instead of guessing
from table-to-table lines.

## Background

The diagram currently draws one straight line from node center to node center
per entry in the legacy `refs:` key. That key is not a standard dbt construct;
real foreign keys are declared in the standard `constraints` block
(`type: foreign_key`, `columns`, `to: ref(...)`, `to_columns`), which the
extension ignores entirely: it is not parsed, and `serialize.ts` drops it on
write-back, so any edit silently destroys declared constraints. This feature
drops `refs:` as a relationship source completely (the diagram expects FKs only
in `constraints`), parses FK constraints, renders column-level edge bundles
with fan-in/trunk/fan-out routing, adds hover highlighting, and fixes the
write-back data loss.

## Scope

- Parsing of `constraints` blocks into a typed `ModelConstraint`, including a
  passthrough for unmodeled constraint keys so round-trips are lossless.
- Removing the legacy `refs:` key as a relationship source: it is neither
  rendered nor parsed into a typed field; it is only preserved on write-back
  as an unmodeled key.
- Preserving unmodeled model-level keys (e.g. `data_tests`) on write-back.
- A pure `parseRef` helper for `ref('pkg', 'model')` / `ref('model')` strings.
- Column-level edges for FK constraints, plus a new pure layout module that
  computes bundle geometry (anchors, trunk, fan-in/fan-out segments).
- Hover highlighting of FK bundles and the involved columns on both nodes.
- A pure layout module and unit tests; updated fixtures.

### Out of scope

- Editing FK constraints through the webview UI (no new edit kinds in
  `src/dbt/edit.ts`).
- Arrowheads on edges.
- Package-scoped model resolution (only workspace model names resolve; a
  constraint's `package` in `ref('pkg', 'model')` is ignored).
- Real-time watcher changes.
- Preserving unmodeled top-level schema.yml sections (e.g. `sources`,
  `exposures`) or unmodeled column-level keys.

## Implementation Notes

All new logic lives in the pure modules (`src/dbt/`, `src/diagram/`) and is
covered by Vitest unit tests in `test/unit/`. No module may import `vscode`.

### 1. Types (`src/dbt/types.ts`)

Add `ModelConstraint`:

```ts
export interface ModelConstraint {
  type?: string;            // e.g. 'primary_key' | 'foreign_key' | 'unique' | 'check'
  columns?: string[];
  to?: string;              // raw dbt ref string, e.g. ref('s_pp', 'audit_result')
  toColumns?: string[];     // to_columns on disk
  name?: string;
  expression?: string;
  warnUnenforced?: boolean; // warn_unenforced on disk
  errorIf?: string;         // error_if on disk
  /** Any other constraint keys, preserved verbatim. */
  [key: string]: unknown;
}
```

`ModelDefinition` gains `constraints?: ModelConstraint[]` and
`extra?: Record<string, unknown>` (unmodeled model-level keys such as
`data_tests`, preserved on write-back; see section 2). The legacy `refs` key
is NOT modeled: it falls into `extra`, is preserved verbatim on write-back,
and is never used to build diagram edges.

### 2. Lossless write-back (`src/dbt/serialize.ts`)

`normalizeModel` (in `src/dbt/parse.ts`) collects every model-level key that is
not modeled (`name`, `description`, `config`, `columns`, `meta`,
`constraints`) into `model.extra`. `toDbtModel` emits `...model.extra` spread
plus the modeled keys, and emits `constraints` via `toDbtConstraint`, which maps
the known camelCase fields to their snake_case on-disk names (`toColumns` ->
`to_columns`, `warnUnenforced` -> `warn_unenforced`, `errorIf` -> `error_if`)
and emits every other key verbatim (order-preserving iteration).

This fixes the latent data-loss bug: editing a file that declares `constraints`
or `data_tests` must not destroy them. Relative ordering of unmodeled keys
against modeled keys is best-effort; preservation of keys and values is
mandatory.

### 3. ref() string parsing (new file `src/dbt/refs.ts`)

```ts
export function parseRef(input: string): { package?: string; name: string } | null
```

Accepts `ref('a')`, `ref('a', 'b')`, `ref("a", "b")` (single or double quotes,
tolerating surrounding whitespace). Returns `{ package: 'a', name: 'b' }` for
two args, `{ name: 'a' }` for one. Returns `null` for empty input, zero or more
than two args, unquoted args, missing parentheses, or trailing content. The
exact regex is implementation detail.

### 4. Graph (`src/diagram/graph.ts`)

`RelationEdge` gains `sourceColumns: string[]` and `targetColumns: string[]`.
`buildDiagram` builds edges from FK constraints only:

For each model, each constraint with `type === 'foreign_key'`: parse `to` with
`parseRef`. Drop the constraint if `to` is missing/unparseable, if the
referenced model is not in the workspace, or if it is a self-reference. Add an
edge with `sourceColumns = constraint.columns ?? []` and
`targetColumns = constraint.toColumns ?? []`.

The legacy `refs` key is NOT a relationship source: entries in it never
produce edges. It is preserved on write-back as an unmodeled key (section 2)
but is ignored by the diagram.

Dedupe identical edges (same source, target, and both column arrays), keeping
the first occurrence. Empty column arrays are allowed: an FK constraint with
no `columns`/`to_columns` yields a table-level-style bundle (see section 5).

### 5. Layout (new file `src/diagram/layout.ts`)

`layoutDiagram(graph: DiagramGraph): DiagramLayout` — pure geometry, no DOM.
Reuse/extract the current grid from `webview-ui/App.tsx`: node i at
`x = 60 + (i % 4) * 320`, `y = 80 + floor(i / 4) * 240`; node width 240.
Column row i of a node at (x, y) has its center at `y + 56 + i * 24` (first row
at 44, row height 24, row-center offset 12). Right anchor = `(x + 240, centerY)`,
left anchor = `(x, centerY)`.

Per edge, produce one `EdgeBundle`:

```ts
export interface Point { x: number; y: number }
export type BundleSegment =
  | { kind: 'bezier'; from: Point; control1: Point; control2: Point; to: Point }
  | { kind: 'line'; from: Point; to: Point };

export interface EdgeBundle {
  id: string;               // `${source}->${target}[${k}]`, k = index among bundles for that pair
  source: string;
  target: string;
  sourceColumns: string[];
  targetColumns: string[];
  title: string;            // e.g. 'orders.customer_id -> customers.customer_id'
  segments: BundleSegment[]; // fan-in beziers, then trunk line, then fan-out beziers
}
```

Routing (default convention: source columns attach to the source node's RIGHT
edge, target columns to the target node's LEFT edge):

- **Anchors.** Each named column anchors at its row center on the facing edge.
  A side with no columns uses a single virtual anchor at the midpoint of the
  node's column block (frame center if the node has no columns).
- **Classification.** If the bundle has exactly two anchors total, draw a single
  direct cubic bezier between them with horizontal tangent handles — no trunk.
  Otherwise fan in from each source anchor to the source trunk point, draw one
  straight horizontal trunk, and fan out from the target trunk point to each
  target anchor.
- **Trunk geometry.** With `sourceRight = source.x + 240`,
  `targetLeft = target.x`, `gap = targetLeft - sourceRight`: the source trunk
  point sits at `gap/3` across the gap, the target trunk point at `2 * gap/3`;
  trunk Y = mean of all involved anchor Ys. When `gap <= 0` (target fully to
  the left of source), mirror the convention: fan-in anchors attach to the
  source's left edge and fan-out anchors to the target's right edge, with the
  trunk at one-third/two-thirds of that gap, so the trunk never crosses a node.
- **Tangent handles** are horizontal (control Y equals the endpoint Y) and
  extend away from their anchor by a fraction of the gap (e.g. `gap/6` clamped
  to a minimum) — exact value is implementation detail.
- **Multiple bundles between the same ordered pair** (source, target) get trunks
  separated by at least a minimum spacing (e.g. 24 px): bundles whose natural
  trunk Ys collide are pushed apart symmetrically around the group's mean trunk
  Y. Exact spacing is implementation detail.

`DiagramLayout` also returns, per node, its position and per-column left/right
anchors so the webview can highlight column rows without recomputing geometry.

### 6. Webview rendering and hover (`webview-ui/App.tsx`, `webview-ui/styles.css`)

- Compute the layout from the received `DiagramGraph` with
  `layoutDiagram(graph)` (memoized via `useMemo`); the `diagram:update` message
  protocol in `src/shared/protocol.ts` is unchanged, and `src/webview/panel.ts`
  is unchanged.
- Render each bundle as `<g className="edge-bundle">` containing one `<path>`
  per segment (map `bezier` to `M from C control1 control2 to`, `line` to
  `M from L to`), plus an accessible `<title>{bundle.title}</title>`. Nodes
  continue to render after the edges (on top).
- Bundle title format: `<source>.<col1>, <col2> -> <target>.<col1>, <col2>`
  (model name once per side); plain `<source> -> <target>` for table-level
  bundles.
- Hover: mouse enter/leave on a bundle sets a `hoveredBundleId` state. Hovered
  bundles render with increased stroke width and the accent color (e.g. an
  `edge-bundle--hovered` class); the columns named in the bundle's
  `sourceColumns`/`targetColumns` on both nodes render a background highlight
  (e.g. an accent-tinted rounded rect behind the column label). The existing
  Add-column form is untouched.

### 7. Fixtures (`fixtures/sample-dbt/models/*.yml`)

Replace the legacy `refs:` blocks with `constraints` foreign_key blocks,
keeping the same model names, columns, and the same three relationships
(`order_items -> orders`, `order_items -> products`, `orders -> customers`):

- `order_items.yml`: add a denormalized `customer_id` column; declare a
  composite FK `columns: [order_id, customer_id]`,
  `to: ref('orders')`, `to_columns: [order_id, customer_id]` (exercises
  fan-in/trunk/fan-out), plus a simple FK
  `columns: [product_id]`, `to: ref('products')`, `to_columns: [product_id]`.
- `orders.yml`: declare a simple FK `columns: [customer_id]`,
  `to: ref('customers')`, `to_columns: [customer_id]`, and include a
  `data_tests` block so the passthrough is exercised by the fixture round trip.
- `customers.yml`, `products.yml`: unchanged.

### 8. Tests (`test/unit/`)

- `dbt/parse.test.ts`: constraint parsing (type/columns/to/to_columns and extra
  keys); `parseRef` cases (two-arg, one-arg, single/double quotes, malformed ->
  null); round trip preserves constraints and unmodeled passthrough keys
  (`data_tests`, including a `refs` block that is preserved but not modeled).
- `diagram/graph.test.ts`: FK edges from constraints with correct column
  arrays; unknown-target and unparseable `to` dropped; self-refs dropped;
  `refs` entries produce no edges; dedupe.
- New `diagram/layout.test.ts`: anchors land on the right/left edges at the
  correct column Ys; single-column FK has no trunk; multi-column FK produces
  fan-in count = source anchor count, exactly one trunk, fan-out count = target
  anchor count; horizontal tangent handles; multiple bundles between the same
  pair have vertically separated trunks.
- `fixture.test.ts`: update to the constraints-based fixtures; assert the same
  node set and the same three `source->target` edges, now with column arrays;
  add a parse -> serialize -> parse round trip on the fixtures.

## Scenarios

### FK constraints draw column-to-column bundles

```
Given the workspace declares a foreign_key constraint on order_items with
  columns [order_id, customer_id], to: ref('orders'), and
  to_columns: [order_id, customer_id]
When the dbt Diagram opens
Then one edge bundle is drawn for that constraint
And the bundle fans in from the order_items.order_id and order_items.customer_id anchors
And the bundle travels as a single trunk across the gap between the nodes
And the bundle fans out to the orders.order_id and orders.customer_id anchors
```

### Single-column FKs draw a direct curve

```
Given order_items declares a foreign_key constraint with columns [product_id],
  to: ref('products'), and to_columns: [product_id]
When the dbt Diagram opens
Then one edge bundle connects the order_items.product_id anchor to the
  products.product_id anchor
And the bundle is a single direct curve with no trunk segment
```

### Hovering a bundle highlights the line and the involved columns

```
Given the dbt Diagram is open and shows an FK bundle between order_items and orders
When the user hovers the bundle's trunk
Then every segment of the bundle is highlighted
And the rows for order_items.order_id, order_items.customer_id, orders.order_id,
  and orders.customer_id are highlighted on their nodes
And a tooltip appears describing the bundle (for example
  "order_items.order_id, customer_id -> orders.order_id, customer_id")
```

### Invalid FK declarations are ignored

```
Given a workspace where a foreign_key constraint names an unknown model
And another constraint's to value is not a parseable ref() string
And another constraint references the declaring model itself
When the dbt Diagram opens
Then no edge bundle is drawn for any of those constraints
And no error is shown to the user
```

### Legacy refs blocks are ignored

```
Given a model that declares a legacy refs key listing other models
When the dbt Diagram opens
Then no edge bundle is drawn for any of those entries
And the refs block is preserved verbatim if the file is edited
```

### Multiple FK bundles between the same pair stay separated

```
Given two models connected by two foreign_key constraints between the same pair
  of models on different columns
When the dbt Diagram opens
Then two distinct edge bundles are drawn between the two nodes
And their trunks are separated vertically so they do not overlap
```

### Editing preserves constraints and unmodeled keys

```
Given a model.yml that declares constraints and data_tests
When the user adds a column through the webview UI
Then the file on disk still contains the constraints and the data_tests block
```

### Hovering a column highlights its bundles (proposed — confirm at approval)

```
Given the dbt Diagram is open and shows an FK bundle between two models
When the user hovers a column that participates in a foreign key
Then the connected bundles are highlighted
And the counterpart columns on the other side are highlighted
```

## Acceptance Criteria

- [ ] FK constraints produce column-level bundles: fan-in from each source column to a single trunk, the trunk across the gap, then fan-out to each target column.
- [ ] Single-column FKs render as a single direct curve with no trunk.
- [ ] Hovering a bundle highlights all its segments and the involved columns on both nodes, with a tooltip listing the columns.
- [ ] Malformed, unknown-target, and self-referencing FK constraints are silently ignored.
- [ ] Legacy `refs:` entries produce no edges and are preserved verbatim on write-back.
- [ ] Multiple FK bundles between the same pair of models render with vertically separated trunks.
- [ ] Editing a model through the webview preserves its `constraints` and its unmodeled model-level keys (`data_tests`).
- [ ] (proposed — confirm at approval) Hovering a column highlights its connected FK bundles and the counterpart columns on the other side.

## Confirm at Approval

These decisions are encoded above as defaults but are explicitly flagged for
confirmation at approval time:

- **(a) Reverse hover.** Hovering a column also highlights its connected FK
  bundles and the counterpart columns on the other side (the last scenario and
  acceptance criterion above).
- **(b) Direction convention.** Edges attach to the source node's right edge and
  the target node's left edge, mirrored only when the target sits fully to the
  left of the source.
- **(c) Passthrough scope.** Unmodeled model-level keys (`data_tests`, legacy
  `refs`) are preserved on write-back; unmodeled top-level sections (`sources`,
  `exposures`) and unmodeled column-level keys are out of scope.
