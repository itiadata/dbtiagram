---
id: 06
title: Edit model and column properties in the diagram
status: implemented
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [05]
---

# Edit model and column properties in the diagram

## Summary

As a dbt developer, I want to edit model and column properties directly on the
diagram instead of jumping back and forth to the YAML. The current **Add-column
form is removed**. Instead:

- **Inline editing on the table cards:** double-clicking a column's **name**
  (and its **data type**) turns that cell into a text input; the change commits
  on Enter/blur and cancels on Escape.
- **A right details sidebar** (mirroring the left filter sidebar's look)
  shows editable properties for whatever is selected:
  - a **table** selected by clicking its header shows its **name** and
    **description**;
  - a **column** selected by clicking its row shows its **name**, **data
    type**, and **description**;
  - nothing selected shows an empty state.

Every edit commits to disk through the existing `diagram:edit` pipeline
(spec 04): the webview posts a `ModelEdit`, the pure `applyEdit` in
`src/dbt/edit.ts` applies it to the in-memory model set, and the panel
persists the affected `model.yml` file(s). Editing FK constraints through
the UI is out of scope — a later feature — but renames propagate to the
`foreign_key` constraints that reference the renamed entity (see Scope).

## Background

Today the webview (`webview-ui/App.tsx`) renders the diagram through
`TableNode` cards whose cells are static text, and edits are only possible via
the Add-column form (model/column name, data type, description) that posts a
single `addColumn` edit. The existing pure edit kinds are `setModelDescription`,
`addColumn`, and `setColumnDescription` (`src/dbt/edit.ts`).

Two facts shape this feature:

1. **Rename persistence is currently broken by the write-back distribution.**
   `DiagramPanel.applyEditAndPersist` (`src/webview/panel.ts`) matches the
   edited flat model list back to files **by model name**
   (`names = new Set(record.file.models.map(m => m.name))`). When an edit
   renames a model, the renamed model's new name is not in any record's
   original name set, so no file is written — the rename would appear to
   succeed in memory and then vanish on the next refresh. This feature needs
   renames, so the distribution must become **index-based** (the flat list is
   the records' models concatenated in file order and `applyEdit` preserves
   order).
2. **There is no selection concept yet** — only the hover highlight machinery
   in `DiagramInteractionContext` (spec 03). Selection (and the details
   sidebar driven by it) is new webview state, built on the same context
   pattern.

Parsing/serialization (`src/dbt/parse.ts`, `src/dbt/serialize.ts`), graph
derivation (`src/diagram/graph.ts`), `src/diagram/flow.ts`,
`src/diagram/layout.ts`, `src/diagram/positions.ts`, the model watcher
(`src/vscode/modelWatcher.ts`), `src/vscode/project.ts`, and the filter
sidebar (`webview-ui/FilterSidebar.tsx`) are **unchanged**.

## Scope

- **Remove the Add-column form.** The `<section className="form">` block, its
  `FormState`/`form` state, the `addColumn` handler, and the `.form` styles
  are deleted from the webview. The `addColumn` edit kind is removed from
  `ModelEdit` (no UI can trigger it), along with its unit tests. Adding
  columns returns as its own feature later.
- **Selection.** A webview selection state
  (`{ kind: 'table'; id } | { kind: 'column'; model; column } | null`) owned by
  `App.tsx` and shared with the cards via the existing
  `DiagramInteractionContext` (extended, see Implementation Notes). Clicking a
  table header selects the table; clicking a column row selects the column;
  clicking empty canvas deselects.
- **Inline editing** of column name and data type directly in `TableNode`
  (double-click to edit; Enter/blur commits; Escape cancels). The data type
  cell is **always rendered** (muted placeholder when absent) so a type can be
  added by double-clicking an empty cell.
- **Right details sidebar** (`webview-ui/DetailsSidebar.tsx`) mirroring the
  left sidebar's styling: table view (name, description) or column view (name,
  data type, description), all editable. Fields commit on blur/Enter, Escape
  reverts, and a blank name reverts instead of committing.
- **New pure edit kinds** in `src/dbt/edit.ts`:
  `setModelName`, `setColumnName`, `setColumnDataType`. Description edits
  normalize a whitespace-only value to "remove the key".
- **Rename-safe write-back.** A new pure `distributeEditedModels` in
  `src/dbt/modelStore.ts` maps the edited flat model list back onto the
  store's records by position; `applyEditAndPersist` uses it (fixes the
  rename-persistence bug above).

### Out of scope

- **FK editing** (creating/removing constraints, hand-editing `to` refs or
  `columns`/`to_columns`) — a later feature, per the user. Constraint entries
  are otherwise untouched by property edits. Two deliberate exceptions:
  - a **model rename propagates to FK constraints** — every `foreign_key`
    constraint whose `to` is a parseable `ref(...)` naming the renamed model
    is re-pointed at the new name (in any model, self-references included),
    so the edges survive the rename;
  - a **column rename propagates to FK column references** — every
    `foreign_key` constraint that references the renamed column is re-pointed
    at the new name: its `columns` when the constraint is declared on the
    renamed model (source side), and its `to_columns` when the constraint's
    `to` parses to the renamed model (target side, any model, self-references
    included).
- **Add-column UI** (removed; returns as its own feature).
- Editing anything other than the listed properties (version, config, meta,
  tests, constraints, model `data_tests`, etc.).
- Multi-line rich text; descriptions are plain textareas.
- Undo/redo; the YAML editor owns text history.
- Persisting the selection across panel reopen (plain webview state, matching
  spec 05's filter-selection policy).
- Selection *highlight* of FK edges for a selected column (only the existing
  hover machinery is reused; selection highlights the card/row only).

## Implementation Notes

### 1. Edit kinds (`src/dbt/edit.ts`)

```
ModelEdit =
  | { kind: 'setModelName'; model: string; name: string }
  | { kind: 'setModelDescription'; model: string; description: string }
  | { kind: 'setColumnName'; model: string; column: string; name: string }
  | { kind: 'setColumnDataType'; model: string; column: string; dataType: string }
  | { kind: 'setColumnDescription'; model: string; column: string; description: string }
```

`addColumn` is removed from the union and from `applyEdit` (the switch stays
exhaustive). Behavior of the new/normalized cases:

- `setModelName` — trim `name`; empty → `EditError('Model name must not be
  empty')`; renaming to another existing model's name → `EditError` (checked
  against the whole flat list, excluding the renamed model itself); otherwise
  `{ ...m, name }` **plus an FK propagation pass**: every model (the renamed
  one included) whose `constraints` hold a `foreign_key` entry with a `to`
  that `parseRef` resolves to the old name gets that `to` re-pointed at the
  new name via a new pure `renameRefTarget` in `src/dbt/refs.ts`. The rewrite
  preserves the ref's quoting and surrounding whitespace, changes only the
  name segment, and skips non-FK constraints and unparseable `to` strings.
  Models whose constraints did not change keep object identity, so
  `distributeEditedModels` rewrites only the affected files.
- `setModelDescription` / `setColumnDescription` — **stored as typed**;
  whitespace-only → `description: undefined` (the serializer already omits
  `undefined` keys). Existing tests pass non-empty values, so they are
  unaffected.
- `setColumnName` — trim; empty → `EditError`; renaming to another column's
  name within the same model → `EditError`; missing column → `EditError`
  (mirroring `setColumnDescription`). **Plus an FK propagation pass**: every
  `foreign_key` constraint that references the renamed column is re-pointed
  at the new name — its `columns` when the constraint is declared on the
  renamed model (source side), and its `to_columns` when the constraint's
  `to` parses to the renamed model (target side, any model, self-references
  included). Constraint entries that do not change keep object identity, so
  `distributeEditedModels` rewrites only the affected files.
- `setColumnDataType` — trim; whitespace-only → `dataType: undefined` (the
  `data_type` key is dropped on write-back); missing column → `EditError`.

All cases reuse `mapModel`; unchanged models keep object identity (important
for the reference-comparison in `distributeEditedModels`).

### 2. Rename-safe write-back (`src/dbt/modelStore.ts`, `src/webview/panel.ts`)

New pure function in `src/dbt/modelStore.ts` (no `vscode` import):

```
distributeEditedModels(store: ModelStore, edited: ModelDefinition[]): ModelFileRecord[]
```

- The flat list passed to `applyEdit` is the store's records' models
  concatenated in record order; `applyEdit` returns a new list of the same
  length in the same order. Walk the records, slice the corresponding range
  off `edited`, and rebuild each record's file
  (`{ version: record.file.version, models: slice }`).
- Return **only** records whose slice actually changed: element-wise
  reference comparison (`slice[i] !== record.file.models[i]`) — unchanged
  models are the same objects, so unchanged files are skipped and not
  rewritten to disk.

`DiagramPanel.applyEditAndPersist` becomes:

```
const all: ModelDefinition[] = this.store.records.flatMap((record) => record.file.models);
const { models } = applyEdit(all, edit);
for (const record of distributeEditedModels(this.store, models)) {
  this.store = upsertRecord(this.store, record.uri, record.file);
  await writeModelYmlFile(vscode.Uri.file(record.uri), record.file);
  this.selfWrites.set(record.uri, Date.now());
}
this.publish();
```

The old name-set matching is removed. This also keeps `addColumn`-style
appends working if a future feature reintroduces them.

### 3. Protocol

Unchanged: `MessageToExtension` still carries `{ type: 'diagram:edit'; edit: ModelEdit }`
(the `ModelEdit` union changes), and `MessageToWebview` (`diagram:update`,
`diagram:error`) is untouched.

### 4. Selection (`webview-ui/diagram-interaction-context.ts`, `webview-ui/App.tsx`)

`webview-ui/App.tsx` owns:

```
type Selection = { kind: 'table'; id: string } | { kind: 'column'; model: string; column: string } | null;
```

`DiagramInteractionContextValue` is extended with:

- `selectedTableId: string | null`
- `selectedColumnRef: { model: string; column: string } | null`
- `onTableSelect: (model: string) => void`
- `onColumnSelect: (model: string, column: string) => void`
- `onEdit: (edit: ModelEdit) => void` — the single funnel that posts
  `diagram:edit` (used by both inline editing and the details sidebar).

`App.tsx`:
- `onPaneClick` on `<ReactFlow>` → `setSelection(null)`.
- On every `diagram:update`, reconcile the selection against the **full**
  graph (not the filtered one): if the selected model/column no longer
  exists, clear the selection. A selection that is merely filtered out by the
  sidebar survives (its card is hidden but its properties stay editable).
- **Rename bookkeeping.** When the user commits a rename of the currently
  selected entity (model or column), the webview records
  `{ oldRef, newRef }` in a single-entry `pendingRenameRef` and posts the
  edit, but **leaves the selection at `oldRef`**. The old entity still exists
  in the current graph, so the sidebar keeps showing it without an empty-state
  flicker; the graph's next `diagram:update` is the authority on the new name.
  - On `diagram:error` (edit rejected, e.g. duplicate name): just clear the
    ref. The selection never moved and the graph is unchanged, so the sidebar
    keeps reading the old values (the error banner explains the rejection).
  - On `diagram:update` (edit accepted): move the selection to `newRef`
    (which now exists) and clear the ref — before the reconcile pass runs, so
    the reconcile cannot drop the renamed selection.

### 5. Inline editing (`webview-ui/TableNode.tsx`)

- A local `InlineEditField` component renders a text `<input>` with:
  - the `nodrag` class (React Flow's drag-suppression marker) and
    `stopPropagation` on `onMouseDown`/`onClick`/`onDoubleClick`, so editing
    does not start a node drag or a flow-level interaction;
  - `autoFocus` + `select()`; Enter or blur commits; Escape cancels;
  - a draft `useState` seeded from the cell value and reset via an effect
    keyed on the incoming value (a `diagram:update` that changed this cell
    resets the draft; other updates leave it alone).
- **Column name cell:** `onDoubleClick` (with `stopPropagation`) switches the
  span to the input. Commit: trimmed empty → revert silently (a column must
  have a name); else
  `onEdit({ kind: 'setColumnName', model: id, column, name })`.
- **Data type cell:** always rendered —
  `<span className="table-node__column-type">` shows the value or a muted
  `—` placeholder when absent — so it is always double-clickable. Commit:
  whitespace-only → `onEdit({ kind: 'setColumnDataType', ..., dataType: '' })`
  (clears the key); else the trimmed value.
- Clicking (single) the row/header still selects; `stopPropagation` keeps the
  double-click edit from also toggling anything else.

### 6. Details sidebar (`webview-ui/DetailsSidebar.tsx`)

A new `<aside className="details">` (fixed ~260px, `border-left`, reusing the
sidebar's visual language) rendered to the right of `.app__main`:

- **Empty state** ("Select a table or a column to edit its properties.")
  when nothing is selected.
- **Table view** — section title "Table"; editable fields **Name** and
  **Description**.
- **Column view** — section title "Column"; a muted context line with the
  parent model (e.g. `orders.order_id`, read-only); editable fields **Name**,
  **Data type**, **Description**.
- Fields are rendered by a local `EditableField` component
  (`label` + `<input>` or `<textarea>`): local draft seeded from the graph
  value, reset when the selection changes; commit on blur/Enter via
  `onCommit(value)` only when the draft differs from the current value;
  Escape reverts; a `required` field (names) reverts locally instead of
  committing when the trimmed draft is empty. `App.tsx` maps commits to the
  corresponding `ModelEdit` (`''` description/data type → clears the key).
- No Save button and no collapse toggle (the panel simply mirrors the selected
  entity; collapse behavior is not requested).

`App.tsx` derives the displayed entity from the **full** graph by the current
selection and passes it down.

### 7. Styles (`webview-ui/styles.css`)

- `.app__body` stays a flex row; a new `.details` aside (mirror of `.sidebar`,
  `border-left` instead of `border-right`) plus `.details__section`,
  `.details__section-title`, `.details__field`, `.details__label`,
  `.details__input`, `.details__textarea`, `.details__empty`.
- Card selection visuals: `.table-node__title--selected`,
  `.table-node__row--selected` (distinct from the hover `--highlighted`).
- Inline edit input: `.table-node__inline-edit` (fills the cell, inherits
  font, `nodrag`).
- The `.form` styles and the `addColumn`-related styles are removed.

### 8. Tests (`test/unit/`)

- `dbt/edit.test.ts` — drop the `addColumn` tests; add:
  `setModelName` (rename, duplicate rejection, empty rejection, same-name
  no-op); `setColumnName` (rename, duplicate rejection, empty rejection,
  missing column); `setColumnDataType` (set, whitespace clears, missing
  column); `setModelDescription`/`setColumnDescription` whitespace-only →
  `undefined` while non-empty values are stored as typed.
- `dbt/modelStore.test.ts` — add `distributeEditedModels`: unchanged records
  are not returned; a renamed model lands on its original record; a
  column rename / description change lands on the right record; record
  order and per-record model order are preserved.
- Existing suites (`dbt/*`, `diagram/*`, `shared/*`, `vscode/*`, `fixture`,
  integration) are unchanged and must keep passing.

## Scenarios

### The Add-column form is gone

```
Given the dbt Diagram is open
Then no Add-column form is visible above the canvas
And the layout shows the left filter sidebar, the header, the canvas, and the new details sidebar
```

### Double-clicking a column name edits it inline

```
Given the dbt Diagram is open and shows the orders table
When the user double-clicks the column name "total_amount"
Then the name turns into a text input prefilled with "total_amount"
When the user types "amount_total" and presses Enter
Then the orders card shows "amount_total"
And models/orders.yml now contains a column named amount_total
```

### Escape cancels an inline edit

```
Given the dbt Diagram is open and a column name input is being edited
When the user presses Escape
Then the input reverts to the original name
And no edit is written to disk
```

### Double-clicking a data type edits it; clearing it removes the key

```
Given the dbt Diagram is open and shows the orders table
When the user double-clicks the data type "integer" on the order_id row
And replaces it with "bigint" and presses Enter
Then the row shows "bigint"
When the user double-clicks "bigint" again and clears the input and presses Enter
Then the row shows the muted placeholder instead of a data type
And order_id no longer has a data_type key in orders.yml
```

### A column without a data type can gain one by double-click

```
Given the dbt Diagram is open and shows a column with no data type
Then its data type cell shows a muted placeholder
When the user double-clicks the placeholder and types "numeric" and presses Enter
Then the cell shows "numeric"
```

### Clicking a table header selects the table

```
Given the dbt Diagram is open
When the user clicks the orders table header
Then the orders card is highlighted as selected
And the details sidebar shows Table with editable Name "orders" and Description "One row per order"
```

### Clicking a column selects the column

```
Given the dbt Diagram is open
When the user clicks the order_id row in the orders table
Then the row is highlighted as selected
And the details sidebar shows Column with editable Name "order_id", Data type "integer", and Description "Primary key"
```

### Editing the model name persists and keeps the selection

```
Given the dbt Diagram is open and the orders table is selected
When the user edits the Name field in the details sidebar to "orders_v2" and blurs
Then the diagram card is renamed to orders_v2
And the details sidebar still shows the selected table, now named orders_v2
And models/orders.yml contains a model named orders_v2
```

### Renaming a model re-points foreign keys that reference it

```
Given the dbt Diagram is open and order_items has a foreign_key constraint with to: ref('orders')
When the user renames the orders model to orders_v2 in the details sidebar
Then order_items.yml's constraint to reads ref('orders_v2')
And the FK edge from order_items to orders_v2 is still drawn
And the constraint's columns and to_columns are unchanged
```

### Renaming a column re-points FK column references

```
Given the dbt Diagram is open and staging/orders has a foreign_key constraint with to: ref('orders') and to_columns: [order_id]
When the user renames the order_id column in orders to order_key
Then staging/orders.yml's constraint to_columns reads [order_key]
And orders.yml's own foreign_key constraints that list order_id in their columns read order_key
And the constraints' other entries are unchanged
```

### Editing the model description persists; a blank description clears it

```
Given the dbt Diagram is open and the orders table is selected
When the user edits the Description field to "One row per completed order" and blurs
Then models/orders.yml has that description for orders
When the user clears the Description field and blurs
Then orders.yml no longer has a description for orders
```

### Editing a column's name, type, and description from the sidebar persists

```
Given the dbt Diagram is open and order_id is selected
When the user changes Data type to "bigint" and blurs
Then orders.yml order_id has data_type: bigint
When the user changes Name to "order_key" and blurs
Then the diagram row and the sidebar both show "order_key"
When the user changes Description to "Surrogate key" and blurs
Then orders.yml order_id has description: Surrogate key
```

### Renaming the selected column keeps it selected

```
Given the dbt Diagram is open and order_id is selected
When the user double-clicks the order_id name, types "order_key", and presses Enter
Then the details sidebar still shows the column, now named "order_key"
And the row is still selected
```

### A blank name reverts instead of committing

```
Given the dbt Diagram is open and the orders table is selected
When the user clears the Name field in the details sidebar and blurs
Then the Name field shows "orders" again
And no rename is written to disk
```

### A rejected rename surfaces an error and reverts the selection

```
Given the dbt Diagram is open and the orders table is selected
When the user renames orders to "customers" (an existing model) and blurs
Then an error banner shows that a model named "customers" already exists
And the details sidebar still shows the orders table with name "orders"
```

### Clicking the canvas background deselects

```
Given the dbt Diagram is open and a table is selected
When the user clicks an empty area of the canvas
Then no card or row is highlighted
And the details sidebar shows its empty state
```

### A selection disappears when the entity is removed externally

```
Given the dbt Diagram is open and the order_items table is selected
When the user deletes the order_items model block in order_items.yml
Then the details sidebar clears its selection
```

### A selection survives being filtered out

```
Given the dbt Diagram is open and the orders table is selected
When the user unchecks orders.yml in the Model yml files filter
Then the orders card disappears from the canvas
And the details sidebar still shows the orders table properties
```

## Acceptance Criteria

- [ ] The Add-column form and its `addColumn` edit kind are removed (webview
      UI, `ModelEdit` union, `applyEdit` case, tests).
- [ ] Double-clicking a column's name or data type cell turns it into an
      inline input; Enter/blur commits, Escape cancels, and editing does not
      drag the node.
- [ ] The data type cell is always rendered (muted placeholder when absent)
      and double-clickable, so a type can be added to a typeless column.
- [ ] Clicking a table header selects the table; clicking a column row selects
      the column; clicking empty canvas deselects. Selected card/row are
      visually distinct from the hover highlight.
- [ ] The details sidebar shows the table's name and description (editable)
      or the column's name, data type, and description (editable), and an
      empty state when nothing is selected.
- [ ] Sidebar fields commit on blur/Enter, Escape reverts, only changed values
      post edits, blank names revert (no commit), blank descriptions/data
      types clear the YAML key.
- [ ] Renames (model or column) persist to the correct `model.yml` file, keep
      the selection on the renamed entity, revert the selection on a rejected
      edit (with an error banner), and clear the selection if the entity is
      removed externally.
- [ ] Renaming a model re-points every `foreign_key` constraint `to` ref that
      names it (in any model, self-references included) at the new name,
      preserving the ref's quoting and whitespace; non-FK constraints and
      unparseable `to` values are untouched, and only the affected files are
      rewritten.
- [ ] Renaming a column re-points every FK reference to it: `to_columns` in
      constraints whose `to` targets the renamed model, and `columns` in
      constraints declared on the renamed model (self-references included);
      other constraint entries and unrelated constraints are untouched.
- [ ] Selection survives being filtered out by the sidebar and is reconciled
      against the full graph on every `diagram:update`.
- [ ] `applyEditAndPersist` writes back by position via the new pure
      `distributeEditedModels` (renames no longer vanish); unchanged files are
      not rewritten.
- [ ] `src/dbt/edit.ts` and `src/dbt/modelStore.ts` remain pure (no `vscode`
      import) and are covered by sub-second Vitest unit tests; the existing
      suites (`dbt/*`, `diagram/*`, `shared/*`, `vscode/*`, `fixture`,
      integration) stay green.
- [ ] `npm test` and `npm run typecheck` pass.

## Confirm at Approval

These decisions are encoded above as defaults but are explicitly flagged for
confirmation at approval time:

- **(a) Remove `addColumn` entirely.** The Add-column form is removed AND the
  `addColumn` edit kind (with its tests) is deleted from `ModelEdit`, since no
  UI can produce it. Adding columns returns as its own feature later.
- **(b) Blank semantics.** Blank (whitespace-only) description or data type
  clears the YAML key; a blank name never commits (the field reverts). Names
  and data types are trimmed; descriptions are stored as typed.
- **(c) Always-rendered data type cell.** The data type cell renders a muted
  placeholder when absent so it is double-clickable even for typeless columns
  (this is the only way to add a type after the form is gone).
- **(d) Sidebar commit model.** Fields commit on blur/Enter with no Save
  button; Escape reverts. The details panel is a fixed aside (no collapse
  toggle, mirroring the left bar's look only).
- **(e) Selection reconcile scope.** Selection is reconciled against the full
  graph, so it survives being filtered out and is cleared only when the entity
  truly disappears (including an external delete in the YAML).
- **(f) Renames propagate to FK constraints.** Renaming a model re-points
  every `foreign_key` constraint (in any model, self-references included)
  whose `to` is a parseable `ref(...)` naming the old model at the new name,
  preserving the ref's quoting and whitespace; non-FK constraints and
  unparseable `to` strings are untouched. Renaming a column re-points every
  FK reference to it — `to_columns` in constraints whose `to` targets the
  renamed model, and `columns` in constraints declared on the renamed model
  (self-references included); unrelated constraints are untouched. (Changed
  from "renames do not update FK constraints" per the user's request.)
- **(g) Write-back distribution change.** `applyEditAndPersist` switches from
  name-set matching to the new index-based `distributeEditedModels` (fixes the
  rename-persistence bug and is covered by a pure unit test).
