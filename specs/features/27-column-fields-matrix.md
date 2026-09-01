---
id: 27
title: Column fields matrix (spreadsheet-style batch editor)
status: done
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [06, 08, 15, 16]
---

# Column fields matrix (spreadsheet-style batch editor)

## Summary

As a diagram user, I want a spreadsheet-like table view of column-level fields
— including free-form `config.meta` keys such as `confidentiality`, `GDPR`, or
`sensitivity` — so that I can read and batch-edit those fields across many
columns at once instead of opening each column's properties one at a time. I
want to open this matrix scoped to one model (from its right-click menu) or
scoped to every model in the diagram (from the canvas's blank-space menu or a
toolbar button), pick which columns of the matrix are shown and in what order,
filter rows by text, and edit one cell or many selected cells in one action.

## Background

Spec 06 added a details sidebar for editing one model/column's properties at a
time. Spec 08 added structured primary/foreign key editing. Neither exposes
free-form `config.meta` keys at all — teams that tag columns with governance
metadata (confidentiality, GDPR, sensitivity, …) currently have to hand-edit
YAML for this. This feature adds a second, complementary editing surface: a
grid over many columns (one model, or the whole diagram) so that repetitive
metadata entry is a batch operation, not N individual edits.

## Scope

**In scope**

- A modal "fields matrix" window with rows = columns (one row per
  `(model, column)` pair) and configurable grid columns: column name, data
  type, description, primary key (checkbox), virtual primary key (checkbox),
  and one grid column per distinct `config.meta` key found on any column in
  scope.
- Two open modes, sharing the same component:
  - **Per-model**: rows are the columns of one model. Opened from that
    model's right-click menu in the diagram (a new "Edit fields matrix" item).
  - **Global**: rows are every column of every model currently in the diagram
    graph, with an extra "Model" grid column identifying which model each row
    belongs to. Opened from the canvas's blank-space right-click menu (a new
    "Edit fields matrix (all models)" item) and from a new toolbar button
    grouped with "Add note" / "Add foreign key".
- Editing: every grid cell except "Model" is directly editable in place
  (click/type, matching a normal spreadsheet). Text fields commit on blur or
  Enter; checkboxes toggle on click.
- Multi-cell selection (click-drag or shift-click across a rectangular range)
  and a single batch-edit action that applies one typed value (or one
  checkbox state) to every selected cell of a compatible kind in one commit.
- Per-grid-column show/hide toggles and drag-to-reorder, so a user can narrow
  the matrix down to just column name + the meta fields they care about.
- A single text filter box that keeps a row visible if any of its *currently
  shown* text cells contains the filter text (case-insensitive substring).
- Every edit goes through the existing `diagram:edit` protocol message and the
  existing `applyEdit` pure funnel, so writes land in `model.yml` exactly like
  every other property edit in the app.

**Out of scope**

- Inventing brand-new `config.meta` keys or deleting a key entirely from a
  column that already has other meta keys. The matrix only ever shows keys
  that already exist somewhere in scope; clearing a cell that has a key sets
  its value to `""` (see Behavior notes), it never removes the key.
- Adding or removing columns/models (row set is derived from the existing
  model.yml files; this feature has no "add row" action).
- Persisting the text filter — it always resets to empty each time the matrix
  is opened. (Column visibility/order DO persist — see Design decision 7 and
  the Implementation Plan.)
- Undo/redo beyond what individual `diagram:edit` messages already support.
- Renaming a column from the matrix in a way that could collide with another
  column in the same model — see Behavior notes on why "Name" is excluded
  from batch (multi-cell) edit.

## Design decisions (proposed — please confirm or amend)

1. **Grid columns available**: Model (global only, not hideable/not
   reorderable — always first), Name, Data type, Description, Primary key,
   Virtual PK, then one column per distinct meta key (alphabetical by
   default). Default visible set = all of them. Confirm this is right, or say
   which should default to hidden.
2. **Meta key discovery scope**: for the per-model matrix, the key set is the
   union of `column.meta` keys across that model's columns only; for the
   global matrix, the union across every column of every model in the
   diagram. A model opened later with a new meta key would show that key next
   time the matrix is (re)opened, not live.
3. **Virtual PK column semantics**: a model's primary key is virtual-or-not as
   a whole (`TableNode.primaryKey.virtual`), not per column. The "Virtual PK"
   cell for a row is blank/disabled when that row's column is not part of the
   model's primary key; when it is part of the PK, it shows a checkbox
   reflecting the model's PK virtual flag, and toggling it flips that flag for
   the whole model (equivalent to toggling it from the existing Primary Key
   sidebar section).
4. **Primary key column semantics**: checking/unchecking "Primary key" for a
   row adds/removes that column from its model's primary-key column list,
   keeping the model's existing virtual flag (defaulting to non-virtual if the
   model had no primary key yet).
5. **Batch edit restricted to safe kinds**: multi-select batch-apply is
   offered for Description, Data type, every meta column (all free text) plus
   Primary key and Virtual PK (checkbox — batch sets all selected cells to the
   same checked/unchecked state). It is **not** offered for Name: setting many
   columns to an identical name would collide within a model, so Name stays
   single-cell-only (still editable one row at a time).
6. **Selection UI**: click selects one cell; shift-click extends a
   rectangular range; drag does the same. A small floating "Apply to N
   selected cells" affordance appears once 2+ cells of a batch-editable kind
   are selected, with one input (or one checkbox) and an Apply button.
7. **Persistence**: grid column visibility and order (which columns are shown
   and in what sequence) are saved locally by the extension host — via
   `ExtensionContext.workspaceState`, not the `.dbtiagram.yml` layout file —
   and restored the next time a matrix is opened, in this workspace, across
   VS Code restarts. Per-model and global scopes are remembered separately
   (the global scope's extra "Model" column and the per-model scope's absence
   of it are distinct preference sets). The text filter is session/UI-only and
   always starts empty on open, regardless of stored preferences.

## Scenarios

### Open the matrix for one model

```
Given the diagram shows model "customers"
When the user right-clicks the "customers" table and picks "Edit fields matrix"
Then a modal opens showing one row per column of "customers"
And the grid columns include Name, Data type, Description, Primary key,
  Virtual PK, and one column per distinct meta key found on "customers"'s columns
```

### Open the global matrix

```
Given the diagram shows models "customers" and "orders"
When the user right-clicks empty canvas space and picks "Edit fields matrix (all models)"
Then a modal opens showing one row per column across both models
And each row's "Model" cell names which model it belongs to
```

### Missing meta value shows empty

```
Given "customers.id" has config.meta {confidentiality: "internal"} with no "GDPR" key
And "customers.email" has config.meta {confidentiality: "internal", GDPR: "false"}
When the matrix opens for "customers"
Then the "GDPR" cell for the "id" row is empty
And the "GDPR" cell for the "email" row shows "false"
```

### Editing a single meta cell writes to model.yml

```
Given the matrix is open for "customers"
When the user types "restricted" into the "confidentiality" cell for "email" and commits it
Then a diagram:edit message is sent to set customers.email's config.meta.confidentiality to "restricted"
And customers.email's model.yml entry now reads confidentiality: "restricted"
```

### Clearing a value keeps the key with an empty string

```
Given "customers.email" has config.meta.GDPR = "false"
When the user clears the "GDPR" cell for "email" and commits it
Then customers.email's model.yml entry now reads GDPR: ""
And the "GDPR" key is still present, not removed
```

### Filling in a previously-absent key adds it

```
Given "customers.id" has no "GDPR" key in its config.meta
When the user types "true" into the "GDPR" cell for "id" and commits it
Then customers.id's model.yml gains a GDPR: "true" entry under config.meta
And other existing meta keys on "id" are unchanged
```

### Batch edit across selected cells

```
Given the matrix is open for "customers" showing 5 rows
When the user selects the "sensitivity" cells for 3 of those rows
And types "high" into the batch-apply input and clicks Apply
Then all 3 selected columns' config.meta.sensitivity become "high"
And the 2 unselected rows are unchanged
```

### Hide and reorder columns

```
Given the matrix is open showing Name, Data type, Description, Primary key,
  Virtual PK, confidentiality, GDPR, sensitivity
When the user hides Data type and Description and drags "sensitivity" before "GDPR"
Then the grid shows Name, Primary key, Virtual PK, confidentiality, sensitivity, GDPR
And Data type and Description are no longer rendered
```

### Text filter narrows rows

```
Given the matrix is open for "customers" with 10 rows
When the user types "internal" into the filter box
Then only rows with a currently-visible cell containing "internal"
  (case-insensitive) remain shown
```

### Toggling primary key from the matrix

```
Given "customers.id" is not currently part of the primary key
When the user checks the "Primary key" cell for the "id" row
Then customers' primary key columns now include "id"
And the model's existing virtual/real flag is unchanged
```

### Column layout persists across sessions

```
Given the user hides Data type and Description and reorders columns in the
  per-model matrix
When the user closes the matrix, closes VS Code entirely, and reopens the
  workspace, then opens the per-model matrix again for any model
Then the same columns are hidden and the same order is used
And the .dbtiagram.yml layout file (if any) is unchanged by this
```

### Filter always starts empty

```
Given the user previously typed "internal" into the filter box and closed the matrix
When the user reopens the matrix (same or different model)
Then the filter box is empty and every row in scope is shown
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/edit/types.ts` | modify | `ModelEdit` gains `{ kind: 'setColumnMeta'; model: string; column: string; key: string; value: string }`. |
| `src/dbt/edit/column.ts` | modify | New `setColumnMetaValue(model, column, key, value)`: sets `column.meta[key] = value.trim()`-blank-becomes-`''`-**only if the key already exists**, otherwise sets the trimmed value (adds the key) when non-empty, and is a no-op when the key doesn't exist and the value is blank. |
| `src/dbt/edit/index.ts` | modify | Dispatches `'setColumnMeta'` to `setColumnMetaValue` via `mapModel`. |
| `src/diagram/graph.ts` | modify | `TableNodeColumn` gains `meta?: Record<string, unknown>`, populated from `ModelColumn.meta` in `buildDiagram`. |
| `src/diagram/matrix.ts` | create | Pure: derives matrix rows from a `DiagramGraph` (or a single `TableNode`): `buildMatrixRows`, `discoverMetaKeys`, `MatrixRow` shape (string values plus pk/virtual-pk booleans). |
| `test/unit/diagram/matrix.test.ts` | create | Unit tests for `buildMatrixRows`/`discoverMetaKeys` per the Tests table below. |
| `test/unit/dbt/edit/column.test.ts` | modify | Adds cases for `setColumnMetaValue`: fills an absent key, blanks an existing key to `''`, no-ops blanking an absent key. |
| `src/shared/matrixColumns.ts` | create | Shared (pure, no `vscode` import): `MatrixColumnId`, `MatrixColumnDef`, `StoredMatrixColumnPref`, `MatrixScope`, `defaultMatrixColumns(metaKeys, scope)`, `toggleColumnVisible`, `reorderColumn`, `applyStoredPrefs(defaults, stored)` — used by both the webview (rendering/editing the grid) and the extension host (typing what it persists), so it must not import `vscode`. |
| `test/unit/shared/matrixColumns.test.ts` | create | Unit tests for `src/shared/matrixColumns.ts` per the Tests table below. |
| `src/shared/protocol.ts` | modify | `MessageToWebview` gains `{ type: 'matrix:columnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] }`; `MessageToExtension` gains `{ type: 'matrix:setColumnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] }`. |
| `src/vscode/matrixColumnPrefs.ts` | create | Vscode-facing: reads/writes `StoredMatrixColumnPref[]` per `MatrixScope` via `ExtensionContext.workspaceState`, under keys `dbtiagram.matrixColumns.model` / `dbtiagram.matrixColumns.global`. |
| `src/webview/panel.ts` | modify | On `webview:ready`, sends `matrix:columnPrefs` for both scopes (reading via `src/vscode/matrixColumnPrefs.ts`); on `matrix:setColumnPrefs`, writes it back via the same module. |
| `webview-ui/matrix-selection.ts` | create | Pure: rectangular multi-cell selection over a `(rowIndex, columnIndex)` grid — `CellRef`, `MatrixSelection`, `startSelection`, `extendSelection`, `cellsInSelection`. |
| `webview-ui/FieldsMatrix.tsx` | create | The modal component: renders the grid (filter box, column show/hide + reorder controls, editable cells, batch-apply affordance), shared by per-model and global opens via a `scope` prop. |
| `webview-ui/hooks/useFieldsMatrix.ts` | create | Open/close state (`{ scope: 'model'; model: string } | { scope: 'global' } | null`); wraps `matrix-selection.ts`, the filter text (always reset on open), and the column-prefs round trip (`applyStoredPrefs` on receipt of `matrix:columnPrefs`, posts `matrix:setColumnPrefs` on every visibility/order change); exposes `openForModel`, `openGlobal`, `close`. |
| `webview-ui/App.tsx` | modify | Wires `useFieldsMatrix`; adds "Edit fields matrix" to the table right-click menu (`buildTableMenuItems`) and "Edit fields matrix (all models)" to the pane right-click menu (`onPaneContextMenu`'s item list); renders `<FieldsMatrix>` alongside `<ContextMenu>`/`<SettingsPanel>`; dispatches `diagram:edit` messages for cell/batch commits, one message per changed cell; forwards `matrix:columnPrefs` from `useHostMessages` into the matrix hook. |
| `webview-ui/DiagramCanvas.tsx` | modify | Adds an "Edit fields matrix" button to the existing top-left `canvas-toolbar` `Panel`, alongside "Add note" / "Add foreign key"; new `onOpenFieldsMatrix: () => void` prop. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Adds an `onMatrixColumnPrefs` handler for the new `matrix:columnPrefs` message, following the existing handler-map pattern. |
| `webview-ui/styles.css` | modify | Styles for `.fields-matrix` modal overlay, grid, sticky header, column-visibility popover, drag-reorder affordance, cell selection highlight, and the batch-apply floating bar. |
| `test/unit/webview/matrixSelection.test.ts` | create | Tests for `matrix-selection.ts` per the Tests table below. |
| `test/integration/matrixColumnPrefs.test.ts` | create | Integration test: writing then reading `StoredMatrixColumnPref[]` via `src/vscode/matrixColumnPrefs.ts` round-trips through a real `ExtensionContext.workspaceState`. |

### Signatures

```ts
// src/dbt/edit/types.ts (pure)
export type ModelEdit =
  | /* ...existing members... */
  | { kind: 'setColumnMeta'; model: string; column: string; key: string; value: string };

// src/dbt/edit/column.ts (pure)
export function setColumnMetaValue(
  model: ModelDefinition,
  column: string,
  key: string,
  value: string,
): ModelDefinition;

// src/diagram/graph.ts (pure)
export interface TableNodeColumn {
  name: string;
  dataType?: string;
  description?: string;
  meta?: Record<string, unknown>;
}

// src/diagram/matrix.ts (pure — must not import `vscode`)
export interface MatrixRow {
  model: string;
  column: string;
  dataType?: string;
  description?: string;
  isPrimaryKey: boolean;
  /** Only meaningful when isPrimaryKey is true; mirrors the model's PK virtual flag. */
  virtualPrimaryKey: boolean;
  /** One entry per discovered meta key in scope; absent key -> undefined. */
  meta: Record<string, string | undefined>;
}
export function discoverMetaKeys(nodes: readonly TableNode[]): string[]; // alphabetical, deduped
export function buildMatrixRows(nodes: readonly TableNode[], metaKeys: readonly string[]): MatrixRow[];

// src/shared/matrixColumns.ts (shared, pure — no `vscode` import; used by both webview and host)
export type MatrixScope = 'model' | 'global';
export type MatrixColumnId =
  | 'model' | 'name' | 'dataType' | 'description' | 'primaryKey' | 'virtualPrimaryKey'
  | { meta: string };
export interface MatrixColumnDef {
  id: MatrixColumnId;
  label: string;
  visible: boolean;
  /** batch multi-cell apply offered for this column kind. */
  batchEditable: boolean;
}
/** What the host persists per scope: order is array order. */
export interface StoredMatrixColumnPref {
  id: MatrixColumnId;
  visible: boolean;
}
export function defaultMatrixColumns(
  metaKeys: readonly string[],
  scope: MatrixScope,
): MatrixColumnDef[];
export function toggleColumnVisible(columns: MatrixColumnDef[], id: MatrixColumnId): MatrixColumnDef[];
export function reorderColumn(
  columns: MatrixColumnDef[],
  fromIndex: number,
  toIndex: number,
): MatrixColumnDef[];
/**
 * Merges stored preferences onto a freshly computed default column set:
 * columns whose id appears in `stored` take that order (first) and that
 * `visible` flag; columns from `defaults` not mentioned in `stored` (e.g. a
 * meta key discovered for the first time) are appended afterwards, in their
 * default relative order, visible by default. Ids in `stored` no longer
 * present in `defaults` (e.g. a meta key that no longer exists in scope) are
 * dropped silently.
 */
export function applyStoredPrefs(
  defaults: MatrixColumnDef[],
  stored: readonly StoredMatrixColumnPref[] | undefined,
): MatrixColumnDef[];
export function toStoredPrefs(columns: readonly MatrixColumnDef[]): StoredMatrixColumnPref[];

// src/vscode/matrixColumnPrefs.ts (vscode-facing)
export function readMatrixColumnPrefs(
  state: vscode.Memento,
  scope: MatrixScope,
): StoredMatrixColumnPref[] | undefined;
export function writeMatrixColumnPrefs(
  state: vscode.Memento,
  scope: MatrixScope,
  columns: StoredMatrixColumnPref[],
): Thenable<void>;

// src/shared/protocol.ts (shared)
// MessageToWebview gains:
| { type: 'matrix:columnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] }
// MessageToExtension gains:
| { type: 'matrix:setColumnPrefs'; scope: MatrixScope; columns: StoredMatrixColumnPref[] }

// webview-ui/matrix-selection.ts (webview, pure)
export interface CellRef { row: number; columnIndex: number; }
export interface MatrixSelection { anchor: CellRef; focus: CellRef; }
export function startSelection(cell: CellRef): MatrixSelection;
export function extendSelection(selection: MatrixSelection, cell: CellRef): MatrixSelection;
export function cellsInSelection(selection: MatrixSelection): CellRef[];

// webview-ui/hooks/useFieldsMatrix.ts (webview)
export type MatrixTarget = { scope: 'model'; model: string } | { scope: 'global' } | null;
export interface FieldsMatrixState {
  target: MatrixTarget;
  openForModel: (model: string) => void;
  openGlobal: () => void;
  close: () => void;
  /** Current column defs for the open scope; [] while target is null. */
  columns: MatrixColumnDef[];
  setColumns: (columns: MatrixColumnDef[]) => void; // posts matrix:setColumnPrefs
  /** Applies a host-pushed matrix:columnPrefs message for the matching scope. */
  applyColumnPrefs: (scope: MatrixScope, stored: StoredMatrixColumnPref[]) => void;
  filterText: string; // always '' right after open/openForModel/openGlobal
  setFilterText: (text: string) => void;
}
export function useFieldsMatrix(
  post: (message: MessageToExtension) => void,
): FieldsMatrixState;

// webview-ui/FieldsMatrix.tsx (webview)
export interface FieldsMatrixProps {
  target: { scope: 'model'; model: string } | { scope: 'global' };
  graph: DiagramGraph;
  onEdit: (edit: ModelEdit) => void;
  onClose: () => void;
}
export function FieldsMatrix(props: FieldsMatrixProps): JSX.Element;

// webview-ui/DiagramCanvas.tsx (webview)
export interface DiagramCanvasProps {
  // ...existing props...
  onOpenFieldsMatrix: () => void;
}
```

### Behavior notes

1. **Meta value semantics** (scenarios "Clearing a value…" / "Filling in a
   previously-absent key…"): `setColumnMetaValue` reads `column.meta?.[key]`.
   If the key is currently present (any value, including `""`), the write
   always sets `meta[key] = value.trim()` — even when that trim is `""` — so
   an existing key is never deleted, only blanked (spec requirement: "leave
   the field in the model yml but empty"). If the key is currently absent and
   `value.trim()` is non-empty, the key is added with that trimmed value. If
   the key is absent and `value.trim()` is empty, the model is returned
   unchanged (no key is added for a no-op blank edit) — this keeps "no new
   meta fields" honest for the common case of clicking into and out of an
   already-empty cell.
2. **Object identity**: `setColumnMetaValue` follows the existing `mapColumn`
   convention (see `setColumnDescription`) — returns the same `ModelColumn`/
   `ModelDefinition` object when nothing changed, so `distributeEditedModels`
   still skips untouched files.
3. **Primary key cell** (scenario "Toggling primary key…"): checking a row's
   PK cell calls the existing `setPrimaryKey` edit with
   `columns = [...currentPkColumns, thisColumn]` (deduped, existing order
   preserved, new column appended) and `virtual = currentVirtualFlag ?? false`
   when the model had no PK yet. Unchecking removes the column from that list
   the same way. This reuses `dedupeTrimmed`/`setPrimaryKeyOnModel` already in
   `src/dbt/edit/primaryKey.ts` — no new edit kind needed.
4. **Virtual PK cell** (design decision 3): rendered checkbox only when
   `row.isPrimaryKey` is true; toggling issues `setPrimaryKey` with the
   model's current PK `columns` unchanged and `virtual` flipped. Batch-editing
   multiple Virtual PK cells across **different models** is allowed — it
   issues one `setPrimaryKey` edit per distinct model represented in the
   selection, each keeping that model's own current PK columns.
5. **Batch edit is per-model, per-cell "same target value"** (scenario
   "Batch edit across selected cells"): the batch-apply action iterates the
   selected cells and emits one `diagram:edit` message per cell (grouped
   however `App.tsx` already dispatches; no new batching protocol message is
   introduced — `MessageToExtension`'s `diagram:edit` already carries exactly
   one edit, so N selected cells means N messages sent in a tight loop, same
   as today's model for any multi-step edit).
6. **Meta key discovery is a snapshot at open time** (design decision 2): keys
   are computed once when the matrix opens (`discoverMetaKeys` over the
   `DiagramGraph` at that moment) and do not change while the modal is open,
   even if `diagram:update` arrives in the background — this matches the
   existing details sidebar's "select, then edit" model closely enough and
   keeps the column list from reshuffling under the user's cursor mid-edit.
7. **Row identity for selection** is `(model, column)`; a filtered-out row is
   excluded from `cellsInSelection` results entirely (selection ranges apply
   to currently-visible rows/columns only, following spreadsheet UX), so
   hiding a column or filtering rows away silently drops those cells from any
   in-progress selection.
8. **Name excluded from batch edit** (design decision 5,
   `MatrixColumnDef.batchEditable`): `name` is never batch-editable
   (still single-cell editable, dispatching `setColumnName`, subject to the
   existing per-model uniqueness check in `renameColumn` — a batch attempt
   simply isn't offered by the UI). `dataType` IS batch-editable
   (`batchEditable: true`), dispatching `setColumnDataType` per selected cell.
9. **Filter matching** (scenario "Text filter narrows rows"): a row is kept
   when at least one of its *currently visible* text-bearing cell values
   (Name, Data type, Description, meta values; not Model unless the "Model"
   column itself is being matched) contains the filter text case-insensitively
   as a substring; blank cells never match a non-empty filter.
10. **Modal chrome** follows `SettingsPanel.tsx` conventions: Escape and
    outside-pointerdown close it, rendered as a fixed-position overlay (not a
    new webview panel), so no protocol changes are needed to open/close it.
11. **Column-prefs persistence lifecycle** (scenario "Column layout persists
    across sessions"): on `webview:ready`, `panel.ts` sends `matrix:columnPrefs`
    once for each `MatrixScope` (`'model'` and `'global'`), reading whatever
    is currently in `workspaceState` (possibly `undefined` — first run). The
    webview holds both scopes' raw `StoredMatrixColumnPref[] | undefined` in
    memory. When the matrix is opened for a scope, `defaultMatrixColumns(metaKeys,
    scope)` is computed from the just-discovered meta keys and merged with the
    stored prefs for that scope via `applyStoredPrefs`. Every subsequent
    visibility toggle or reorder while the modal is open updates local state
    immediately (grid re-renders synchronously) AND posts
    `matrix:setColumnPrefs` with `toStoredPrefs(nextColumns)`, which `panel.ts`
    writes straight to `workspaceState` — no debounce needed since these are
    infrequent, deliberate actions (unlike drag-position syncing). Nothing is
    written to `.dbtiagram.yml`.
12. **Filter never persists** (scenario "Filter always starts empty"):
    `useFieldsMatrix`'s `filterText` resets to `''` in `openForModel`/
    `openGlobal`, and is never read from or written to `workspaceState`.
13. **Scopes are independent stores**: `'model'` scope prefs apply to every
    per-model matrix regardless of which model is open (one shared column
    layout for "any single-model matrix"), and `'global'` scope prefs apply
    only to the all-models matrix — mirroring how the two scopes already have
    different default column sets (the extra "Model" column).

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/edit/column.test.ts` | `setColumnMetaValue fills a previously-absent key` | column with `meta: {confidentiality: 'internal'}`, key `'GDPR'`, value `'true'` | returned column has `meta: {confidentiality: 'internal', GDPR: 'true'}` |
| `test/unit/dbt/edit/column.test.ts` | `setColumnMetaValue blanks an existing key to empty string, keeping it` | column with `meta: {GDPR: 'false'}`, key `'GDPR'`, value `''` | returned column has `meta: {GDPR: ''}` |
| `test/unit/dbt/edit/column.test.ts` | `setColumnMetaValue no-ops when key is absent and value is blank` | column with `meta: {confidentiality: 'internal'}`, key `'GDPR'`, value `'   '` | returns the same object reference (no `GDPR` key added) |
| `test/unit/diagram/matrix.test.ts` | `discoverMetaKeys unions and dedupes keys across nodes, alphabetical` | node A col with `meta:{b:'1'}`, node B col with `meta:{a:'2', b:'3'}` | `['a', 'b']` |
| `test/unit/diagram/matrix.test.ts` | `buildMatrixRows fills missing meta keys with undefined` | one node, one column with `meta:{confidentiality:'internal'}`, keys `['confidentiality','GDPR']` | row `.meta` is `{confidentiality:'internal', GDPR: undefined}` |
| `test/unit/diagram/matrix.test.ts` | `buildMatrixRows marks primary key rows and carries the model virtual flag` | node with `primaryKey:{columns:['id'], virtual:true}`, columns `id,name` | row for `id` has `isPrimaryKey:true, virtualPrimaryKey:true`; row for `name` has `isPrimaryKey:false` |
| `test/unit/shared/matrixColumns.test.ts` | `defaultMatrixColumns includes the Model column only for global scope` | metaKeys `['a']`, scope `'global'` vs `'model'` | global result's first id is `'model'`; model-scope result has no `'model'` entry |
| `test/unit/shared/matrixColumns.test.ts` | `toggleColumnVisible flips one column without affecting others` | default columns, toggle `'dataType'` | only the `dataType` entry's `visible` flips |
| `test/unit/shared/matrixColumns.test.ts` | `reorderColumn moves a column to a new index` | columns `[name, dataType, description]`, move index 2 to index 0 | order becomes `[description, name, dataType]` |
| `test/unit/shared/matrixColumns.test.ts` | `applyStoredPrefs orders by stored prefs, appends new defaults, drops vanished ids` | defaults `[name, dataType, description, {meta:'a'}, {meta:'b'}]`; stored `[{id:{meta:'b'},visible:false},{id:'name',visible:true},{id:{meta:'c'},visible:true}]` | result order `[{meta:'b'} (hidden), name, dataType, description, {meta:'a'}]` — `{meta:'c'}` dropped, `dataType`/`description`/`{meta:'a'}` appended in default order |
| `test/unit/shared/matrixColumns.test.ts` | `applyStoredPrefs returns defaults unchanged when stored is undefined` | defaults as above, stored `undefined` | result equals `defaults` |
| `test/unit/webview/matrixSelection.test.ts` | `extendSelection keeps the anchor and moves the focus` | anchor `{row:1,columnIndex:1}`, extend to `{row:3,columnIndex:2}` | `cellsInSelection` returns the 3x2 rectangle between them (6 cells) |
| `test/unit/webview/matrixSelection.test.ts` | `startSelection creates a single-cell selection` | cell `{row:0,columnIndex:0}` | `cellsInSelection` returns exactly `[{row:0,columnIndex:0}]` |
| `test/integration/matrixColumnPrefs.test.ts` | `writeMatrixColumnPrefs then readMatrixColumnPrefs round-trips` | write `[{id:'name',visible:true},{id:{meta:'GDPR'},visible:false}]` for scope `'model'` in a real `ExtensionContext.workspaceState` | read returns the same array (deep-equal) |

### Verification

- `npm run verify` — typecheck + unit suites, must be green after each
  implementation step.
- `npm test` — unit + integration, must be green before the implementing
  commit (the new `test/integration/matrixColumnPrefs.test.ts` launches the
  real VS Code host).

### Do not touch

- `src/dbt/edit/primaryKey.ts` / `foreignKey.ts` public APIs — the matrix
  reuses `setPrimaryKey` unchanged; no new PK/FK edit kinds are introduced.
- `src/dbt/virtual.ts`'s `config.meta.dbtiagram` namespace — column-level
  `meta` (this feature) is a completely different field (`ModelColumn.meta`)
  from the model-level `config.meta.dbtiagram.virtual` block; they must never
  be conflated or share code paths.
- `webview-ui/DetailsSidebar.tsx` and its existing single-entity editing
  flow — unchanged; the matrix is an additional, independent editing surface.
- The existing `ContextMenu.tsx` submenu mechanics from spec 24 — reused
  as-is for the two new top-level menu items (no submenu needed here).

## Acceptance Criteria

- [x] "Edit fields matrix" appears on a table's right-click menu and opens a
      modal scoped to that model's columns.
- [x] "Edit fields matrix (all models)" appears on the canvas's blank-space
      right-click menu and on a new top-left toolbar button, opening a modal
      scoped to every model with an extra Model column.
- [x] The grid shows Name, Data type, Description, Primary key, Virtual PK,
      and one column per distinct meta key found in scope; a column missing a
      meta key shows an empty cell.
- [x] Editing any single cell (text or checkbox) writes back to the correct
      model.yml column via the existing edit protocol.
- [x] Clearing a meta cell that had a value writes `""`, keeping the key;
      clearing/leaving-blank a cell whose key never existed adds nothing.
- [x] Selecting multiple compatible cells and applying one value/state updates
      every selected cell and nothing else (including Data type, now
      batch-editable).
- [x] Grid columns can be hidden/shown and reordered, and the text filter
      narrows rows by substring match on visible text cells.
- [x] Column visibility/order persist across VS Code restarts (per scope, via
      `workspaceState`), while the filter always starts empty; neither is
      written to `.dbtiagram.yml`.
- [x] `npm run verify` is green.

## Addendum: column meta is stored in `config.meta`, in flow style

This spec's prose and scenarios always said column meta lives in `config.meta`
(see Scope, and the scenario "a GDPR key is added"), but its Implementation
Plan never covered `src/dbt/parse.ts` or `src/dbt/merge/shape.ts` — it worked
purely on the domain `ModelColumn.meta` field. The on-disk shape was inherited
unexamined from the repository baseline, which stored column meta as a **flat
top-level `meta:`** key. Commit `ca8efa8` later fixed the *read* side to prefer
`config.meta`, but left the *write* side emitting flat `meta:`.

That asymmetry is a live bug: for every column whose meta is on disk under
`config.meta`, the desired shape contains a flat `meta` key the file lacks, so
the reconciler inserts one — duplicating the whole meta block onto **every**
column in the file on any unrelated edit (e.g. changing one column's
`data_type`).

### Decided behavior

- **`config.meta` is the one and only location.** The editor reads column meta
  from `config.meta` and writes it back to `config.meta`. The flat top-level
  fallback read added by `ca8efa8` is removed.
- **A flat column-level `meta:` is ignored, not migrated and not deleted.** It
  is invisible to the domain model, so its keys do not appear in the diagram or
  the fields matrix; it is also never rewritten or removed, and stays exactly
  where the user put it. (Consequence accepted at approval time: flat
  column-level `meta:` is valid older dbt, and such keys will no longer be
  shown.)
- **A `config.meta` mapping created by the editor is emitted in flow style**
  (`meta: {GDPR: "true"}`), matching the convention users write meta in. A
  `config.meta` that already exists on disk keeps whatever style it has — a
  block-style block stays block-style.

### Implementation

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/types.ts` | modify | Add `config` to `ModelColumn`. |
| `src/dbt/parse.ts` | modify | Read column meta from `config.meta` only; keep the rest of `config`. |
| `src/dbt/merge/shape.ts` | modify | `toDbtColumn` emits meta inside `config`, never flat. |
| `src/dbt/merge/reconcile.ts` | modify | Add `flowOnCreate` to `MergePolicy`. |
| `src/dbt/merge/index.ts` | modify | Column `config` policy + drop `meta` from `COLUMN_DELETABLE`. |
| `test/unit/dbt/parse.test.ts` | modify | Parse cases below. |
| `test/unit/dbt/merge/reconcile.test.ts` | modify | Merge cases below. |
| `specs/ARCHITECTURE.md` | modify | Update the `parse.ts` / `shape.ts` / `reconcile.ts` rows. |

```ts
// src/dbt/types.ts  (pure — must not import `vscode`)
export interface ModelColumn {
  name: string;
  dataType?: string;
  description?: string;
  tests?: string[];
  dataTests?: DataTestEntry[];
  /** The column's meta mapping, read from and written to `config.meta`. */
  meta?: Record<string, unknown>;
  /**
   * The column's on-disk `config` mapping **with `meta` removed**; `meta` is
   * spliced back in by `toDbtColumn`. Round-tripping the remainder here is what
   * stops the reconciler's `deletable: 'all'` policy from wiping sibling
   * `config` keys such as `tags`.
   */
  config?: Record<string, unknown>;
}
```

```ts
// src/dbt/merge/reconcile.ts  (pure — must not import `vscode`)
export interface MergePolicy {
  deletable: ReadonlyMap<string, ManagedShape> | 'all';
  order: KeyOrder;
  child(key: string | number): MergePolicy;
  /**
   * When this node is *created* from a plain object whose values are all
   * scalars, emit it as a flow mapping (`{a: b}`). Ignored for nodes that
   * already exist on disk, whose style is always preserved.
   */
  flowOnCreate?: boolean;
}
```

`parseModelYml`, `toDbtColumn`, `mergeModelYml` and `setColumnMetaValue` keep
their existing exported signatures.

### Behavior notes

- **`normalizeColumn`.** When `raw.config` is a record and `raw.config.meta` is
  a record: `meta = raw.config.meta`, and `config` = the rest of `raw.config`
  with `meta` removed (omit `config` entirely when that remainder is empty).
  Otherwise: no `meta`, and `config = raw.config` when it is a record. A flat
  `raw.meta` is never consulted for a column. Model-level `meta` is unaffected.
- **`toDbtColumn`.** Key order `name`, `data_type`, `description`, `tests`,
  `data_tests`, `config`. Emit `config: {...column.config, ...(meta ? {meta} :
  {})}`, omitting `config` entirely when that object would be empty. Never emit
  a top-level `meta` key.
- **Deletion policy.** Remove the `['meta', 'mapping']` entry from
  `COLUMN_DELETABLE`. This spec's Out of scope already guarantees a meta key is
  never deleted (clearing a cell blanks it to `""`), so `meta` never needs to be
  deletable at column level — and keeping it deletable would delete the flat
  `meta:` this addendum promises to leave alone. Do **not** add `config` to
  `COLUMN_DELETABLE`.
- **Column `config` policy.** Add `COLUMN_CONFIG_POLICY` (`deletable: 'all'`,
  `order: FREE_KEY_ORDER`, `child(key) => key === 'meta' ? FLOW_FREE_POLICY :
  FREE_POLICY`), where `FLOW_FREE_POLICY` is `FREE_POLICY` plus `flowOnCreate:
  true`. Wire via `COLUMN_POLICY.child = (key) => key === 'config' ?
  COLUMN_CONFIG_POLICY : FREE_POLICY`. `deletable: 'all'` is safe here only
  because `column.config` now round-trips the full on-disk mapping.
- **Flow creation.** In `reconcileMap`'s "pair not found" branch, when
  `policy.child(key).flowOnCreate` is true and the value is a non-empty plain
  object whose every value is a scalar (`string | number | boolean | null`),
  build a `YAMLMap` with `flow = true` and one `Pair` per entry instead of
  passing the raw object. Otherwise fall back to the plain object (block
  style) — a block mapping nested inside a flow mapping is invalid YAML.
  Existing nodes are never restyled.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/parse.test.ts` | `reads column meta from config.meta and keeps sibling config keys` | column `{name: a, config: {tags: [pii], meta: {GDPR: "false"}}}` | `meta` = `{GDPR: "false"}`, `config` = `{tags: ["pii"]}` |
| `test/unit/dbt/parse.test.ts` | `ignores a flat column-level meta key` | column `{name: a, meta: {GDPR: "false"}}` | `meta` undefined, `config` undefined |
| `test/unit/dbt/parse.test.ts` | `prefers config.meta over a flat column meta` | column `{name: a, meta: {GDPR: "x"}, config: {meta: {GDPR: "y"}}}` | `meta` = `{GDPR: "y"}`, `config` undefined |
| `test/unit/dbt/merge/reconcile.test.ts` | `a data-type edit does not duplicate config.meta onto any column` | 2-column model, both with `config: {meta: {c: "internal"}}`; edit column 1's `data_type` to `varchar(33)` | no top-level `meta:` under either column; column 2's text byte-identical; `varchar(33)` present |
| `test/unit/dbt/merge/reconcile.test.ts` | `writes a meta edit into config.meta, keeping sibling config keys` | column with `config: {tags: ["pii"], meta: {GDPR: "false"}}`; `setColumnMetaValue(..., 'GDPR', 'true')` | `config.meta.GDPR` is `"true"`, `config.tags` still `["pii"]`, no top-level `meta:` |
| `test/unit/dbt/merge/reconcile.test.ts` | `leaves a flat column-level meta untouched` | column with `config: {meta: {GDPR: "false"}}` and a flat `meta: {GDPR: "false"}`; set `GDPR` to `true` | `config.meta.GDPR` is `"true"`; the flat `meta:` block still present, unchanged, with `"false"` |
| `test/unit/dbt/merge/reconcile.test.ts` | `creates a new config.meta mapping in flow style` | column with no `meta` and no `config`; set `GDPR` to `true` | output contains `meta: {GDPR: "true"}` on one line under `config:` |
| `test/unit/dbt/merge/reconcile.test.ts` | `keeps an existing block-style config.meta in block style` | column whose `config.meta` is a block map; set a key's value | meta still block style (no `{`) |

Existing assertions elsewhere that encode the old flat-`meta` shape are
corrections of this bug, not regressions, and are updated to the `config.meta`
expectation.

### Do not touch

- `src/dbt/virtual.ts` and the `config.meta.dbtiagram.virtual` namespace (specs
  08/33). Model-level virtual PK/FK storage is already correct and its
  block-style output must not change; `flowOnCreate` is scoped to a *column's*
  `config > meta` only.
- `MODEL_DELETABLE`'s `['meta', 'mapping']` entry — model-level meta keeps its
  current read location and deletion semantics.
- `src/diagram/matrix.ts`, `src/diagram/graph.ts`, and `setColumnMetaValue` in
  `src/dbt/edit/column.ts`. They read/write `column.meta`, whose meaning is
  unchanged; the location logic is confined to parse + shape so no consumer
  changes.
