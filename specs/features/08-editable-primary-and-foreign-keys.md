---
id: 08
title: Editable primary keys and foreign keys
status: implemented
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [06, 07]
---

# Editable primary keys and foreign keys

## Summary

As a dbt developer, I want to edit a table's primary key and its foreign keys
from the diagram — in the right details sidebar's table view — and see PK
columns marked with a key icon on the diagram cards, so I can define
relationships without hand-editing YAML.

- **Primary key section** (table view): edit the ordered list of PK columns
  (searchable add, per-column remove) and a **Virtual** checkbox. A **real**
  PK keeps dbt's three representations in sync in the model.yml — the
  model-level `dbt_utils.unique_combination_of_columns` data test, the
  model-level `type: primary_key` constraint, and the per-column
  `data_tests: [not_null]` on every PK column. A **virtual** PK writes none of
  those; it is stored in the model's `config.meta` block (see Background) and
  rendered with an outlined key icon.
- **Foreign keys section** (table view): every FK of the table is editable —
  target table picker, the column mapping (source → target pairs, searchable
  column pickers, add/remove pair), a **Virtual** checkbox, and remove-FK.
  Double-clicking an FK edge opens the child table's properties with the FK
  section focused (highlighted/scrolled into view). Virtual FKs are stored in
  `config.meta` instead of the `constraints` block and are drawn dashed.

## Background

Spec 06 gave the details sidebar a table view (name + description) and a column
view, but relationships are still hand-edited in YAML: PKs require keeping
three separate YAML constructs in sync by hand (a `data_tests` entry, a
`constraints` entry, and per-column `not_null` tests), and FKs live in the
`constraints` block with no UI.

Two modeling facts shape this feature:

1. **`data_tests` is currently an unmodeled passthrough.** Spec 02 deliberately
   kept model-level `data_tests` in `ModelDefinition.extra` (preserved
   verbatim on write-back). Editing the PK requires *manipulating* that block,
   so model-level `data_tests` is promoted to a modeled, typed field
   (`ModelDefinition.dataTests`), and column-level `data_tests` (currently
   dropped on write-back — a latent data-loss bug) gains a typed field too
   (`ModelColumn.dataTests`). Everything else about the passthrough policy is
   unchanged.
2. **Virtual (unenforced) PK/FK storage.** The user proposed storing virtual
   definitions in the model's `config > meta` block, keeping everything in the
   model.yml with no extra files. This spec endorses that: virtual definitions
   live under `config.meta.dbtiagram.virtual` (a `dbtiagram`-namespaced key so
   user meta never collides), containing an optional `primary_key` and an
   optional `foreign_keys` list. A virtual PK/FK renders in the diagram
   (distinctly — outlined key icon, dashed edges) but writes no
   constraints/data_tests.

### Virtual block shape (on disk)

```yaml
config:
  meta:
    dbtiagram:
      virtual:
        primary_key:
          columns: [order_id]
        foreign_keys:
          - to: ref('customers')
            columns: [customer_id]
            to_columns: [customer_id]
```

When the block becomes empty the `dbtiagram`, `meta`, and `config` keys are
removed (no empty scaffolding is left behind).

### Real PK shape (target state after `setPrimaryKey` with `virtual: false`)

```yaml
data_tests:
  - dbt_utils.unique_combination_of_columns:
      arguments:
        combination_of_columns: [ID_FACTORY_PRODUCTION, QTY_PLANNED_PRODUCTION_YEAR, SEQ_VEHICLE_BODY]
constraints:
  - type: primary_key
    columns: [ID_FACTORY_PRODUCTION, QTY_PLANNED_PRODUCTION_YEAR, SEQ_VEHICLE_BODY]
columns:
  - name: ID_FACTORY_PRODUCTION
    data_tests:
      - not_null
```

## Scope

- Modeling `data_tests` at both model level (`dataTests`) and column level
  (`dataTests`) in `src/dbt/types.ts`, `src/dbt/parse.ts`,
  `src/dbt/serialize.ts` (lossless; the legacy `tests` column key is
  untouched).
- A new pure module `src/dbt/virtual.ts` with `readVirtualConstraints` /
  `writeVirtualConstraints` helpers for the `config.meta.dbtiagram.virtual`
  block.
- Graph: `TableNode` gains `primaryKey?` (`{ columns, virtual }`) and
  `foreignKeys` (descriptors for every declared FK — real and virtual);
  `RelationEdge` gains `virtual`; `buildDiagram` draws edges from virtual FKs
  too (dashed).
- New pure edit kinds in `src/dbt/edit.ts`:
  `setPrimaryKey`, `setForeignKeyTarget`, `setForeignKeyColumns`,
  `setForeignKeyVirtual`, `addForeignKey`, `removeForeignKey`.
- Webview: key icons on PK column rows (filled for real, outlined for virtual);
  dashed virtual FK edges; the details sidebar table view gains **Primary key**
  and **Foreign keys** sections with searchable pickers; double-clicking an FK
  edge selects the child table and focuses the matching FK entry.
- Fixtures: a virtual FK + virtual PK on `products.yml`; updated unit tests.

### Out of scope

- Adding/removing columns or tables (still a separate feature).
- Editing `unique`/`check` constraints or other constraint types through the UI
  (only `foreign_key` and `primary_key` get sections; other constraint entries
  remain untouched by FK/PK edits).
- The legacy column `tests` key: PK sync writes/removes column-level
  `data_tests` only; legacy `tests` entries are left exactly as they are.
- Model-level `meta` (the sibling of `config`): untouched by this feature
  (virtual data lives in `config.meta`).
- Undo/redo; multi-file atomic transactions (each UI change is one edit).

## Implementation Notes

### 1. Types (`src/dbt/types.ts`)

```ts
/** A data test entry: a bare test name or a mapping form with options. */
export type DataTestEntry = string | Record<string, unknown>;

export interface ModelColumn {
  name: string;
  dataType?: string;
  description?: string;
  tests?: string[];          // legacy tests key, preserved as-is
  dataTests?: DataTestEntry[]; // data_tests on disk
  meta?: Record<string, unknown>;
}

export interface ModelDefinition {
  name: string;
  description?: string;
  config?: ModelConfig;
  columns?: ModelColumn[];
  constraints?: ModelConstraint[];
  meta?: Record<string, unknown>;
  dataTests?: DataTestEntry[]; // model-level data_tests (promoted from extra)
  extra?: Record<string, unknown>; // remaining unmodeled model-level keys
}

/** One virtual (unenforced) foreign key stored in config.meta. */
export interface VirtualForeignKey {
  to: string;
  columns: string[];
  toColumns: string[];
}

export interface VirtualPrimaryKey {
  columns: string[];
}

export interface VirtualConstraintsBlock {
  primaryKey?: VirtualPrimaryKey;
  foreignKeys?: VirtualForeignKey[];
}

/**
 * A foreign key as shown to the webview: how the graph and the sidebar talk
 * about one FK. Real FKs come from `constraints`, virtual ones from meta.
 */
export interface ForeignKeyDescriptor {
  /** Parsed model name of `to`, when parseable. */
  target?: string;
  /** The raw ref string as it appears on disk, e.g. ref('customers'). */
  to: string;
  columns: string[];
  toColumns: string[];
  virtual: boolean;
}
```

`ForeignKeyDescriptor` lives in `src/dbt/types.ts` (domain layer) so both
`src/diagram/graph.ts` (produces them) and `src/dbt/edit.ts` (matches on them)
can import it without a `dbt` → `diagram` dependency.

### 2. Parsing (`src/dbt/parse.ts`)

- `normalizeModel`: `modeledKeys` gains `data_tests`; `raw.data_tests`
  (array) is normalized into `model.dataTests` via a shared
  `normalizeDataTests` (keeps `string` and mapping entries; drops other
  values). `data_tests` no longer lands in `extra`.
- `normalizeColumn`: reads `raw.data_tests` into `column.dataTests` with the
  same normalizer. The existing `tests` handling is unchanged.

### 3. Serialization (`src/dbt/serialize.ts`)

- `toDbtModel` emits `data_tests: model.dataTests` (after `description`,
  before `columns`, order is cosmetic — the round-trip test compares parsed
  objects, not text).
- `toDbtColumn` emits `data_tests` alongside the existing `tests`.

### 4. Virtual block helpers (new file `src/dbt/virtual.ts`)

Pure, no `vscode` import:

```ts
export function readVirtualConstraints(model: ModelDefinition): VirtualConstraintsBlock
export function writeVirtualConstraints(
  model: ModelDefinition,
  block: VirtualConstraintsBlock,
): ModelDefinition
```

- `readVirtualConstraints` narrows `model.config?.meta?.dbtiagram?.virtual` and
  coerces `primary_key` → `{ columns: string[] }` and `foreign_keys` →
  `VirtualForeignKey[]` (`to_columns` → `toColumns`). Missing/foreign values
  are ignored (default: empty block). Returns a fresh block — callers never
  mutate shared records.
- `writeVirtualConstraints` builds the YAML-shaped value
  (`virtual.primary_key.columns`, `virtual.foreign_keys[].{to, columns,
  to_columns}`) and writes it into a copy of `model.config.meta.dbtiagram`.
  When the block is empty: delete the `dbtiagram` key; when `meta` becomes
  empty delete `meta`; when `config` becomes empty set `config` to `undefined`.
  Returns the original model object when nothing changed (identity preservation
  for `distributeEditedModels`).

### 5. Graph (`src/diagram/graph.ts`)

- `TableNodeColumn` is unchanged; `TableNode` gains:

```ts
primaryKey?: { columns: string[]; virtual: boolean };
foreignKeys: ForeignKeyDescriptor[];
```

- `RelationEdge` gains `virtual: boolean`.
- `buildDiagram` per model:
  - **PK:** the meta block's `primaryKey` → `{ columns, virtual: true }` (the
    `dbtiagram`-namespaced block records what was last done in the diagram),
    else the first `constraints` entry with `type === 'primary_key'` →
    `{ columns: constraint.columns ?? [], virtual: false }`. Both present is
    treated as inconsistent; the virtual (diagram-written) definition is
    authoritative for display — the next PK edit through the diagram wins and
    aligns the file to the resulting state (its columns + virtual flag),
    removing the other representation (Confirm at Approval (c)).
  - **foreignKeys:** one descriptor per `foreign_key` constraint (in
    constraint order, `virtual: false`, `target` from `parseRef` when
    parseable — unparseable `to` and self-references are **kept** in the list
    so the user can fix them, even though no edge is drawn) followed by one
    descriptor per meta-block FK (`virtual: true`).
  - **Edges:** as today from real `foreign_key` constraints (`virtual: false`)
    plus edges from the meta-block FKs (`virtual: true`); both drop
    unparseable-`to`, unknown-target, and self-referencing FKs. The existing
    dedupe key (source, target, sourceColumns, targetColumns) is unchanged —
    when a real and a virtual FK describe the same mapping the first (real)
    wins.

### 6. Flow (`src/diagram/flow.ts`)

- `FlowNodeData` gains `primaryKey?: { columns: string[]; virtual: boolean }`
  (copied from the graph node) so `TableNode` can render the key icons.
- `FlowEdgeData` gains `virtual?: boolean` (copied from `RelationEdge`) so the
  webview can apply a `edge--virtual` class.

### 7. Edit kinds (`src/dbt/edit.ts`)

```
ModelEdit =
  | { kind: 'setModelName'; model: string; name: string }
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'setColumnName'; model: string; column: string; name: string }
  | { kind: 'setColumnDataType'; model: string; column: string; dataType: string }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string }
  | { kind: 'setPrimaryKey'; model: string; columns: string[]; virtual: boolean }
  | { kind: 'setForeignKeyTarget'; model: string; fk: ForeignKeyDescriptor; target: string }
  | { kind: 'setForeignKeyColumns'; model: string; fk: ForeignKeyDescriptor; columns: string[]; toColumns: string[] }
  | { kind: 'setForeignKeyVirtual'; model: string; fk: ForeignKeyDescriptor; virtual: boolean }
  | { kind: 'addForeignKey'; model: string; target: string }
  | { kind: 'removeForeignKey'; model: string; fk: ForeignKeyDescriptor }
```

All new cases reuse the existing identity-preserving `mapModel` pattern;
unchanged models keep object identity so only affected files are rewritten.
FK edits locate their target constraint **by descriptor content** (first match
wins): for real FKs, a `foreign_key` constraint whose `to`, `columns`, and
`toColumns` equal the descriptor's; for virtual FKs, an entry in the meta
block's `foreignKeys` list.

#### `setPrimaryKey { model, columns, virtual }`

- Trim/dedupe `columns`; every named column must exist on the model →
  `EditError` otherwise.
- **No-op guard:** when the resulting real/virtual state equals the displayed
  state (same columns, same flag — displayed state derived per section 5, i.e.
  virtual-first), return the model unchanged (identity).
- **virtual = true:** remove the real PK artifacts (see below), then write
  `{ primaryKey: columns.length > 0 ? { columns } : undefined }` into the
  virtual block (an empty `columns` clears the virtual PK too — i.e. removes
  the PK entirely).
- **virtual = false:** clear the virtual PK from the meta block, then apply
  the real PK sync:
  1. **Model-level `data_tests`:** find the entry whose key is
     `dbt_utils.unique_combination_of_columns` (a mapping entry
     `{ 'dbt_utils.unique_combination_of_columns': { ... } }`, or a bare
     string entry which is replaced by the mapping form). If `columns` is
     empty, remove the entry; otherwise create/update it in place preserving
     the entry's other keys (e.g. `enabled`) and the value's other
     `arguments` keys, setting `arguments.combination_of_columns = columns`.
  2. **Model-level `constraints`:** find the `type: primary_key` entry. If
     `columns` is empty, remove the whole entry; otherwise update it in place
     preserving its other keys (`name`, `warn_unenforced`, …), setting
     `columns`.
  3. **Column-level `data_tests`:** for every column leaving the old real PK
     (not in the new list) remove the `not_null` entry (dropping the column's
     `data_tests` key when it becomes empty); for every column entering, ensure
     a `not_null` entry exists (append; never duplicate). `not_null` is
     **PK-owned**: it is removed when a column leaves the PK regardless of how
     it got there (see Confirm at Approval (e)).

#### `setForeignKeyTarget { model, fk, target }`

- `target` must name a model in the workspace → `EditError` otherwise.
- Rewrites `to` to the canonical single-arg form `ref('target')` (any package
  qualifier on the old ref is dropped — workspace models resolve by name).
  `columns`/`toColumns` are kept as-is. Applies to the matching real constraint
  or virtual meta entry; the FK's other keys are preserved. No-op when `target`
  already equals the current target (identity).

#### `setForeignKeyColumns { model, fk, columns, toColumns }`

- Validation: `columns.length === toColumns.length` → `EditError` otherwise;
  every source column exists on `model`; every target column exists on the
  target model (resolved from `fk.target`; if the FK's `to` is unparseable the
  edit is rejected with an error telling the user to fix the target first).
- Sets the matching constraint's/meta entry's `columns`/`to_columns`
  (`toColumns` → `to_columns` on disk). Identity-preserving on no-op.

#### `setForeignKeyVirtual { model, fk, virtual }`

- **→ virtual:** remove the matching real constraint from `model.constraints`;
  append `{ to, columns, toColumns }` to the meta block's `foreignKeys`
  (creating the block if needed).
- **→ real:** remove the matching virtual entry; append a real constraint
  `{ type: 'foreign_key', columns, to, to_columns: toColumns }` to
  `model.constraints`.

#### `addForeignKey { model, target }`

- `target` must exist in the workspace → `EditError` otherwise. Appends a
  table-level real constraint `{ type: 'foreign_key', columns: [], to:
  ref('target'), to_columns: [] }` (pairs are added afterwards).

#### `removeForeignKey { model, fk }`

- Removes the matching real constraint or virtual meta entry. No-op (identity)
  when nothing matches.

### 8. Webview — diagram cards (`webview-ui/TableNode.tsx`, `styles.css`)

- Each column row whose name is in `data.primaryKey.columns` renders a small
  inline-SVG **key icon** at the start of the row (before the name). Real PK →
  filled key; virtual PK → outlined key (distinct so virtual is obvious). The
  icon spans the `--accent` color; rows keep the `nodrag` class.
- Edges with `data.virtual` get a `edge--virtual` class → dashed stroke
  (`stroke-dasharray`) and slightly muted color, distinct from enforced edges.

### 9. Webview — details sidebar (`webview-ui/DetailsSidebar.tsx` + new components)

The table view gains two sections between Description and the empty space:
**Primary key** and **Foreign keys**. `DetailsSidebar` receives the full graph
nodes (`nodes: TableNode[]`) so the FK editor can list workspace models and
resolve target-model columns, plus `focusedFk: ForeignKeyDescriptor | null`.

New components (all presentational, receive `onEdit` and post one edit per
atomic change):

- `webview-ui/SearchSelect.tsx` — a reusable searchable picker: a text input
  filters the option list by case-insensitive substring; clicking an option
  commits; used for model targets and for adding/reassigning columns. Also a
  small "add" variant with a button to append an option.
- `webview-ui/PrimaryKeySection.tsx` — **Virtual** checkbox; when real, a note
  that saving writes the three dbt constructs; the PK columns as removable
  chips plus a searchable add picker (over the model's non-PK columns). An
  empty PK with no chips shows "No primary key" and the add picker, so a PK
  can be created by adding the first column. Every change posts a single
  `setPrimaryKey` with the resulting full column list + the virtual flag.
- `webview-ui/ForeignKeySection.tsx` — an **Add foreign key** control (search
  over workspace models → `addForeignKey`); then one card per FK
  (`node.foreignKeys`), each with:
  - a target model picker (`SearchSelect` over all workspace model names) →
    `setForeignKeyTarget`;
  - a **Virtual** checkbox → `setForeignKeyVirtual`;
  - the column mapping: one row per pair (source picker over the model's
    columns, `→`, target picker over the target model's columns, remove-pair
    button); **Add pair** appends the first source column not yet mapped and a
    best-effort target (same-named target column, else the first unmapped
    target column; disabled when every source column is mapped). Pair
    add/remove/reassign each post a single `setForeignKeyColumns` with the full
    `columns`/`toColumns` arrays;
  - a **Remove FK** button → `removeForeignKey`.
  - The card matching `focusedFk` (by `to`/`columns`/`toColumns`) is
    highlighted and scrolled into view on mount/focus.

The legacy "Description" field stays in the table view above the new sections.

### 10. Webview — edge interaction (`webview-ui/App.tsx`)

- `onEdgeClick` (feature 07) keeps selecting the child table. New
  `onEdgeDoubleClick` selects the child table **and** sets
  `focusedFk` to the descriptor matched from the edge:
  - column-level edge → the `foreignKeys` descriptor whose
    `columns[i] === sourceColumn` and `toColumns[i] === targetColumn`;
  - table-level edge → the descriptor with empty `columns`/`toColumns` whose
    `target === edge.target`.
  - `focusedFk` clears on pane click and on `diagram:update` reconcile when it
    no longer matches any descriptor (e.g. after an edit changed the FK).
- The `edges` memo adds `className: 'edge--virtual'` when
  `edge.data.virtual`, alongside the existing `edge--active` logic.

### 11. Fixtures (`fixtures/sample-dbt/models/products.yml`)

`products.yml` gains a `config.meta.dbtiagram.virtual` block with a virtual PK
(`product_id`) and a virtual FK (`product_id → customers.customer_id`) so the
parser, graph, and round-trip tests exercise virtual data. The virtual FK adds
one edge (`products.product_id->customers.customer_id`, `virtual: true`) to the
fixture graph expectations.

### 12. Tests (`test/unit/`)

- `dbt/parse.test.ts` — model- and column-level `data_tests` parsing
  (string + mapping entries), round trip through `serializeModelYml`;
  `data_tests` no longer lands in `extra`.
- New `dbt/virtual.test.ts` — `readVirtualConstraints` (absent/partial/malformed
  blocks), `writeVirtualConstraints` (create, update, clear → keys removed,
  identity preservation).
- `dbt/edit.test.ts` — the new kinds:
  - `setPrimaryKey` real: adds all three constructs; update moves `not_null`;
    clearing removes all three and leaves other data_tests intact; the
    `dbt_utils.unique_combination_of_columns` entry and the primary_key
    constraint are updated in place (other keys preserved) and never
    duplicated; virtual writes meta only; real↔virtual conversions in both
    directions; no-op identity; errors (unknown column).
  - `setForeignKeyTarget`: real + virtual, canonical `ref('target')`, unknown
    target → error, no-op identity.
  - `setForeignKeyColumns`: equal-length enforcement, unknown source/target
    column → error, unparseable-target → error, real + virtual, identity.
  - `setForeignKeyVirtual` both directions; `addForeignKey` (table-level,
    validation); `removeForeignKey` real + virtual.
- `diagram/graph.test.ts` — `node.primaryKey` (virtual wins over real, real
  fallback), `node.foreignKeys` (real + virtual, unparseable `to` kept with no
  `target`, self-refs kept), virtual edges (flag set, unknown-target/self-ref
  dropped, real+virtual dedupe keeps the real one).
- `diagram/flow.test.ts` — `FlowNodeData.primaryKey` copied; `FlowEdgeData.virtual`
  copied on virtual edges.
- `fixture.test.ts` — updated graph expectations (virtual edge, products
  `primaryKey`/`foreignKeys`), round trip stays lossless.

## Scenarios

### Adding a primary key writes the three dbt constructs

```
Given the dbt Diagram is open and the products table has no primary key
When the user opens the products table properties and adds product_id to the Primary key
Then products.yml contains a model-level data_tests entry dbt_utils.unique_combination_of_columns
  with combination_of_columns: [product_id]
And products.yml contains a constraints entry of type primary_key with columns: [product_id]
And the product_id column has a column-level data_tests entry not_null
And the products card shows a key icon on the product_id row
```

### Updating a primary key keeps the three constructs in sync

```
Given products has a real primary key on [product_id]
When the user adds name to the Primary key section
Then the combination_of_columns data test and the primary_key constraint both read [product_id, name]
And both product_id and name have not_null data tests
```

### Removing a column from a primary key removes its not_null test

```
Given products has a real primary key on [product_id, name]
When the user removes name from the Primary key section
Then the combination_of_columns data test and the primary_key constraint both read [product_id]
And name's data_tests no longer contain not_null
And product_id still has not_null
```

### Clearing a primary key removes all three constructs

```
Given products has a real primary key on [product_id]
When the user removes product_id from the Primary key section
Then products.yml has no dbt_utils.unique_combination_of_columns data test
And products.yml has no primary_key constraint
And product_id no longer has not_null
And other data tests on product_id are preserved
```

### Re-adding a primary key never duplicates the constructs

```
Given products.yml already declares the three constructs for [product_id]
When the user adds product_id to the Primary key section
Then exactly one unique_combination_of_columns entry, one primary_key constraint,
  and one not_null entry on product_id exist in the file
```

### A virtual primary key writes meta instead of constraints

```
Given the dbt Diagram is open and the products table is selected
When the user checks Virtual in the Primary key section and adds product_id
Then products.yml has no unique_combination_of_columns data test, no primary_key
  constraint, and no not_null test
And products.yml config.meta.dbtiagram.virtual.primary_key.columns reads [product_id]
And the products card shows an outlined key icon on the product_id row
```

### Converting a virtual primary key back to real

```
Given products has a virtual primary key on [product_id]
When the user unchecks Virtual in the Primary key section
Then the three real constructs appear in products.yml
And config.meta.dbtiagram.virtual no longer contains primary_key
```

### Editing an FK's target table rewrites its ref

```
Given the dbt Diagram is open and order_items has a foreign_key constraint with to: ref('orders')
When the user selects the order_items table and changes the FK's target to customers
Then order_items.yml's constraint to reads ref('customers')
And the constraint's columns and to_columns are unchanged
```

### Adding and removing FK column pairs

```
Given the dbt Diagram is open and order_items has a foreign_key constraint with
  columns [order_id] and to_columns [order_id]
When the user adds a pair (customer_id → customer_id) in the FK editor
Then the constraint's columns read [order_id, customer_id] and to_columns read [order_id, customer_id]
When the user removes the first pair
Then the constraint's columns read [customer_id] and to_columns read [customer_id]
```

### The column picker searches by text

```
Given the dbt Diagram is open and an FK column picker is open on a table with columns
  order_id, customer_id, total_amount, quantity
When the user types "order" into the picker's search box
Then only order_id is offered
```

### A virtual FK writes meta instead of constraints and draws dashed

```
Given the dbt Diagram is open and order_items has a foreign_key constraint to orders
When the user checks Virtual on that FK
Then the constraint is removed from order_items.yml's constraints block
And order_items.yml config.meta.dbtiagram.virtual.foreign_keys contains the FK
And the edge from order_items to orders is drawn dashed
```

### Converting a virtual FK back to real

```
Given order_items has a virtual FK to orders
When the user unchecks Virtual on that FK
Then the FK appears again as a foreign_key constraint in order_items.yml
And config.meta.dbtiagram.virtual.foreign_keys no longer contains it
```

### Adding a new foreign key

```
Given the dbt Diagram is open and the products table is selected
When the user clicks Add foreign key and picks customers
Then products.yml gains a foreign_key constraint with to: ref('customers'),
  no columns, and no to_columns
And the diagram shows a table-level edge from products to customers
```

### Removing a foreign key

```
Given the dbt Diagram is open and order_items has a foreign_key constraint to products
When the user clicks Remove FK on that FK
Then the constraint is removed from order_items.yml
And the edge from order_items to products disappears
```

### Double-clicking an FK edge opens the child table's FK editor focused

```
Given the dbt Diagram is open and shows the FK edge from order_items to orders
When the user double-clicks the edge
Then the order_items table is selected in the details sidebar
And the Foreign keys section is visible with the matching FK highlighted and scrolled into view
```

### Invalid edits are rejected with an error

```
Given the dbt Diagram is open and a table is selected
When the user tries to set an FK's target to a model that does not exist in the workspace
Then an error banner shows and no file is written
```

### PK columns show a key icon

```
Given the dbt Diagram is open and orders has a real primary key on [order_id]
When the user looks at the orders card
Then the order_id row shows a filled key icon at the start of the row
And rows that are not part of the PK show no icon
```

## Acceptance Criteria

- [ ] `data_tests` is modeled at model and column level (typed `DataTestEntry[]`),
      round-trips losslessly, and no longer sits in model `extra`; the legacy
      column `tests` key is untouched; column-level `data_tests` is no longer
      dropped on write-back.
- [ ] A real PK edit keeps the three constructs in sync in one atomic edit:
      the `dbt_utils.unique_combination_of_columns` data test, the
      `type: primary_key` constraint, and `not_null` on each PK column — added
      when missing, updated in place (other keys preserved), never duplicated,
      and removed when the PK is cleared or a column leaves it.
- [ ] A virtual PK/FK is stored in `config.meta.dbtiagram.virtual` only (no
      constraints/data_tests written) and is removed from there when converted
      to real or deleted; empty `dbtiagram`/`meta`/`config` keys are pruned.
- [ ] The diagram shows a key icon on PK column rows — filled for a real PK,
      outlined for a virtual PK — and draws virtual FK edges dashed.
- [ ] The details sidebar table view has **Primary key** and **Foreign keys**
      sections: searchable column/model pickers, add/remove column pairs,
      add/remove FK, target-table changes, and the Virtual checkbox; every
      change posts exactly one edit through the existing `diagram:edit` funnel.
- [ ] Double-clicking an FK edge selects the child table and focuses (highlights
      + scrolls into view) the matching FK entry in the Foreign keys section.
- [ ] Invalid edits (unknown target model, unknown column, unequal pair
      lengths) surface the existing error banner and write nothing.
- [ ] `src/dbt/` and `src/diagram/` changes are covered by sub-second Vitest
      unit tests (parse, virtual, edit, graph, flow, fixture); the existing
      suites stay green.
- [ ] `npm test` and `npm run typecheck` pass.

## Confirm at Approval

- **(a) `data_tests` promotion.** Model-level `data_tests` moves from the
  spec-02 passthrough (`extra`) to a modeled typed field, and column-level
  `data_tests` gains a modeled field (fixing the latent drop-on-write-back bug)
  — required because the PK editor must manipulate these blocks.
- **(b) Virtual storage.** Virtual PK/FK definitions live in
  `config.meta.dbtiagram.virtual` (user's proposal, endorsed). Alternative
  considered: the model-level `meta` sibling of `config` — equally idiomatic;
  `config.meta` was chosen as requested. Note: dbt merges `config.meta` into
  the model's meta, so `dbtiagram.virtual.*` appears in the dbt manifest's
  meta (harmless metadata).
- **(c) Diagram-over-real precedence.** When a model declares both a real
  `primary_key` constraint and a virtual one, the virtual (diagram-written)
  definition is authoritative for display — the `dbtiagram.virtual` block
  records what was last done in the diagram. The next PK edit through the
  diagram wins: its resulting columns + virtual flag align the file, removing
  the other representation (real artifacts or the virtual block), so the state
  becomes unambiguous.
- **(d) FK descriptor matching.** FK edits locate their target constraint by
  content (`to`/`columns`/`toColumns`, first match wins). Duplicate identical
  constraints in the YAML (which the graph dedupes for display) are edited one
  at a time, first match.
- **(e) PK-owned `not_null`.** Removing a column from a real PK removes its
  `not_null` data test even if `not_null` existed before the PK was managed —
  the PK editor owns `not_null` on PK columns. If instead `not_null` should
  only be removed when the PK editor added it, say so (requires tracking, not
  in this spec).
- **(f) `setForeignKeyTarget` canonicalizes `to`.** Target changes rewrite the
  ref to the single-arg form `ref('name')`; a package qualifier on the old ref
  is dropped (workspace models resolve by name). Unchanged FKs keep their exact
  `to` string.
- **(g) FK validation.** Source/target columns in pairs must exist on their
  models; pair arrays must have equal length; targets must be workspace models;
  editing pairs on an FK with an unparseable `to` is rejected until the target
  is fixed.
- **(h) New FKs are real and table-level.** `addForeignKey` writes an enforced
  `foreign_key` constraint with no column mapping (pairs are added afterward);
  the Virtual checkbox converts it.
- **(i) Legacy `tests` untouched.** PK sync writes/removes column-level
  `data_tests` only; legacy `tests` entries (as in the fixtures) are left
  exactly as they are.
