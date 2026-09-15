---
id: 46
title: Move, copy, paste, reorder, and add columns
status: approved
priority: high
created: 2026-09-15
owner: unassigned
depends_on: [08, 27, 29]
---

# Move, copy, paste, reorder, and add columns

## Summary

As a diagram user, I want to select one or a contiguous range of columns and
move or copy them between precise positions in tables, so that I can reorganize
models without manually rewriting YAML. I also want the single-table **Edit
columns** matrix to reorder existing columns and append a new named, typed
column. Transfers preserve every parsed column key/value, keep primary-key
semantics, and redirect moved foreign-key pairs.

## Background

Columns can currently be edited individually in the diagram and in the fields
matrix, but they cannot be created, reordered, or transferred. Spec 29's
surgical merge already preserves untouched YAML and comments; this feature
changes sequence membership/order and preserves the transferred column's parsed
keys and values, but does not promise to transfer its YAML comments.

## Scope

**In scope**

- Model-diagram column selection: click selects one row; Shift+click selects the
  contiguous range from the anchor to the clicked row in the same table.
- Drag selected columns before a specific row or after the destination table's
  last row, with a visible insertion line.
- Same-table dragging reorders. Cross-table dragging moves, or copies while Ctrl
  is held at drop time.
- Column-row context-menu Copy/Cut and column-row/table-header Paste. Pasting on
  a row inserts before it; pasting on a header appends.
- Collision-safe destination names: `_MOVED` / `_COPIED`, then `_MOVED_2` /
  `_COPIED_2`, and so on.
- Atomic transfer of all selected columns in source order, preserving every
  parsed `ModelColumn` key/value. Comments attached to moved/copied YAML nodes
  are not transferred.
- Moving redirects and, when necessary, splits every incoming and outgoing real
  or virtual FK pair. Copying never copies or redirects FKs.
- PK membership follows moved and copied PK columns, including real/virtual
  mode, `not_null`, the PK constraint, and the enabled unique-combination test.
- The single-table matrix is titled/opened as **Edit columns**, has a fixed
  rightmost row-drag handle, and reflects row order into model YAML.
- The single-table matrix has one final blank creation row. Enter creates a
  column only when both Name and Data type are nonblank.

**Out of scope**

- Non-contiguous Ctrl/Command selection.
- Column transfer, ordering, or creation in source-diagram mode.
- Reordering or creating columns in the global **Edit fields matrix**.
- OS clipboard interoperability, cross-diagram-tab paste, keyboard shortcuts,
  undo/redo, or preserving transferred YAML comments/style.
- Copying foreign keys with copied columns.

## Scenarios

### Select one column and a range

```
Given table "orders" displays columns id, customer_id, amount, and created_at
When the user clicks customer_id and Shift+clicks created_at
Then customer_id, amount, and created_at are selected
And the details sidebar remains focused on created_at
```

### Reorder selected columns in one table

```
Given orders has columns id, customer_id, amount, and created_at
And customer_id through amount are selected
When the user drags them to the insertion line after created_at
Then orders has columns id, created_at, customer_id, and amount
And their model.yml column sequence has that order
```

### Move columns to an exact position

```
Given orders has selected columns customer_id and amount
And customers has columns id, name, and email
When the user drops the selection on the insertion line before email
Then customers has id, name, customer_id, amount, and email in that order
And orders no longer has customer_id or amount
```

### Copy columns with Ctrl-drag

```
Given orders.customer_id is selected
When the user Ctrl-drags it before customers.email
Then customers receives a complete copy before email
And orders.customer_id remains unchanged
And no foreign key is copied or redirected
```

### Resolve destination name collisions

```
Given the destination already has id, id_MOVED, and id_MOVED_2
When a selected id column is moved there
Then its destination name is id_MOVED_3
And every redirected PK/FK reference uses id_MOVED_3
```

### Split outgoing and incoming composite foreign keys

```
Given child has an FK (a, b) to parent (x, y)
When child.b is moved to archive
Then child keeps an FK (a) to parent (x)
And archive gains an FK (b) to parent (y)
When parent.y is subsequently moved to parent_archive
Then child keeps its FK (a) to parent (x)
And archive's FK becomes (b) to parent_archive (y)
```

### Transfer primary-key membership

```
Given source has a real primary key (id, tenant_id) with its unique-combination test enabled
And destination has no primary key
When tenant_id is copied to destination
Then source keeps its unchanged primary key
And destination gets a real primary key (tenant_id)
And destination.tenant_id has not_null and the unique-combination test is enabled
When source.tenant_id is instead moved
Then source's real primary key becomes (id) with its artifacts synchronized
```

### Use destination primary-key settings when it already has a PK

```
Given a real source PK column is moved to a destination with a virtual PK (existing_id)
When the move completes
Then the destination virtual PK is (existing_id, moved_column)
And no real PK constraint or PK-owned not_null is created at the destination
```

### Cut and paste through context menus

```
Given two columns are selected in orders
When the user chooses Cut from a selected row's context menu
Then the columns remain in place and are visually marked as cut
When the user opens customers.email's context menu and chooses Paste
Then the columns move immediately before email
And the internal clipboard becomes empty
```

### Copy and paste at the end of a table

```
Given a column selection was copied from orders
When the user opens the customers table-header context menu and chooses Paste
Then copies are appended after customers' last column
And the clipboard remains available for another paste
```

### Reorder columns in Edit columns

```
Given Edit columns is open for orders with no active filters
When the user drags the rightmost handle of amount above customer_id
Then the matrix and model.yml show amount immediately before customer_id
And the handle is absent from the global Edit fields matrix
```

### Disable matrix row dragging while filtered

```
Given Edit columns has any nonblank column filter
Then every row-drag handle is disabled
And no row reorder can start until all filters are blank
```

### Create a column from the final matrix row

```
Given Edit columns is open for orders
And the final blank row contains name "status" and data type "varchar"
When the user presses Enter in either field
Then {name: "status", data_type: "varchar"} is appended to orders.columns
And a new blank creation row remains last
```

### Require both creation fields

```
Given only Name or only Data type is filled in the final matrix row
When the user presses Enter
Then no edit is sent
And the incomplete draft remains available for completion
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/README.md` | modify | Add feature 46 to the index as Draft. |
| `specs/ARCHITECTURE.md` | modify | Register the new pure transfer/selection modules and updated UI responsibilities. |
| `src/dbt/edit/types.ts` | modify | Add atomic transfer and add-column edit variants. |
| `src/dbt/edit/index.ts` | modify | Dispatch the two new edit variants. |
| `src/dbt/edit/columnTransfer.ts` | create | Pure atomic add/reorder/move/copy logic, collision names, PK synchronization, and pair-wise FK redirection/splitting. |
| `test/unit/dbt/edit/columnTransfer.test.ts` | create | Domain tests for ordering, preservation, collisions, PKs, and FKs. |
| `webview-ui/column-transfer-state.ts` | create | Pure contiguous selection, insertion-target, and internal clipboard transitions. |
| `test/unit/webview/columnTransferState.test.ts` | create | Unit tests for selection and clipboard state. |
| `webview-ui/hooks/useColumnTransfer.ts` | create | React state/ref wrapper for selection, cut/copy/paste, drag payload, Ctrl-copy decision, and graph reconciliation. |
| `webview-ui/diagram-interaction-context.ts` | modify | Expose multi-selection and row drag/drop/context-menu callbacks to table nodes. |
| `webview-ui/TableNode.tsx` | modify | Render range/cut selection, draggable rows, and insertion lines before rows/after the last row. |
| `webview-ui/App.tsx` | modify | Wire the transfer hook, atomic edits, context-menu actions, selection focus, and the **Edit columns** menu label. |
| `webview-ui/matrix-row-order.ts` | create | Pure helpers for filter gating and translating displayed row drops into transfer edits. |
| `test/unit/webview/matrixRowOrder.test.ts` | create | Tests for row reorder/filter gating and add-column draft validation. |
| `webview-ui/FieldsMatrix.tsx` | modify | Per-model drag handles and final creation row; retain global matrix behavior; extract row concerns to remain below the size cap. |
| `webview-ui/FieldsMatrixRow.tsx` | create | Render an existing matrix row and optional rightmost drag handle. |
| `webview-ui/FieldsMatrixCreateRow.tsx` | create | Render and retain the Name/Data type creation draft and submit on Enter. |
| `webview-ui/styles.css` | modify | Multi-selection, cut state, insertion line, matrix row handle, disabled handle, and creation-row styling. |

### Signatures

```ts
// src/dbt/edit/types.ts (pure — must not import `vscode`)
export type ModelEdit =
  | /* existing members */
  | {
      kind: 'transferColumns';
      sourceModel: string;
      destinationModel: string;
      columns: string[];
      before?: string;
      copy: boolean;
    }
  | { kind: 'addColumn'; model: string; name: string; dataType: string };

// src/dbt/edit/columnTransfer.ts (pure — must not import `vscode`)
export function transferColumns(
  models: ModelDefinition[],
  sourceModel: string,
  destinationModel: string,
  columns: string[],
  before: string | undefined,
  copy: boolean,
): ApplyEditResult;
export function addColumn(
  models: ModelDefinition[],
  model: string,
  name: string,
  dataType: string,
): ApplyEditResult;
export function transferredColumnName(
  original: string,
  destinationNames: ReadonlySet<string>,
  operation: 'MOVED' | 'COPIED',
): string;

// webview-ui/column-transfer-state.ts (webview, pure)
export interface ColumnRef { model: string; column: string; }
export interface ColumnSelection { model: string; anchor: string; focus: string; columns: string[]; }
export type ColumnClipboard =
  | { operation: 'copy' | 'cut'; sourceModel: string; columns: string[] }
  | null;
export interface ColumnInsertTarget { model: string; before?: string; }
export function selectColumn(
  current: ColumnSelection | null,
  model: string,
  column: string,
  orderedColumns: readonly string[],
  extend: boolean,
): ColumnSelection;
export function selectionContains(selection: ColumnSelection | null, ref: ColumnRef): boolean;
export function copySelection(selection: ColumnSelection | null): ColumnClipboard;
export function cutSelection(selection: ColumnSelection | null): ColumnClipboard;
export function clipboardEdit(
  clipboard: Exclude<ColumnClipboard, null>,
  target: ColumnInsertTarget,
): ModelEdit | null;
export function afterPaste(clipboard: ColumnClipboard): ColumnClipboard;

// webview-ui/hooks/useColumnTransfer.ts (webview)
export interface ColumnTransferState {
  selection: ColumnSelection | null;
  clipboard: ColumnClipboard;
  insertionTarget: ColumnInsertTarget | null;
  select: (model: string, column: string, orderedColumns: readonly string[], extend: boolean) => void;
  selectForContextMenu: (model: string, column: string, orderedColumns: readonly string[]) => void;
  copy: () => void;
  cut: () => void;
  paste: (target: ColumnInsertTarget) => ModelEdit | null;
  beginDrag: (model: string, column: string, orderedColumns: readonly string[]) => void;
  hoverInsertion: (target: ColumnInsertTarget | null) => void;
  drop: (target: ColumnInsertTarget, ctrlKey: boolean) => ModelEdit | null;
  reconcile: (graph: DiagramGraph) => void;
}
export function useColumnTransfer(): ColumnTransferState;

// webview-ui/matrix-row-order.ts (webview, pure)
export function hasActiveMatrixFilter(filters: Readonly<Record<string, string>>): boolean;
export function matrixReorderEdit(
  model: string,
  orderedRows: readonly MatrixRow[],
  draggedColumn: string,
  before: string | undefined,
): ModelEdit;
export function addColumnEdit(
  model: string,
  name: string,
  dataType: string,
): ModelEdit | null;

// webview-ui/FieldsMatrixRow.tsx (webview)
export interface FieldsMatrixRowProps {
  row: MatrixRow;
  visibleRowIndex: number;
  visibleColumns: readonly MatrixColumnDef[];
  selectedCells: ReadonlySet<string>;
  reorderEnabled: boolean;
  onCellPointerDown: (rowIndex: number, columnIndex: number) => void;
  onCellPointerEnter: (rowIndex: number, columnIndex: number) => void;
  onTextCommit: (row: MatrixRow, column: MatrixColumnId, value: string) => void;
  onPrimaryKeyToggle: (row: MatrixRow) => void;
  onVirtualPrimaryKeyToggle: (row: MatrixRow) => void;
  onReorderDragStart?: (column: string) => void;
  onReorderDropBefore?: (column: string) => void;
}
export function FieldsMatrixRow(props: FieldsMatrixRowProps): JSX.Element;

// webview-ui/FieldsMatrixCreateRow.tsx (webview)
export interface FieldsMatrixCreateRowProps {
  visibleColumns: readonly MatrixColumnDef[];
  onCreate: (name: string, dataType: string) => void;
}
export function FieldsMatrixCreateRow(props: FieldsMatrixCreateRowProps): JSX.Element;

// webview-ui/diagram-interaction-context.ts (webview)
export interface DiagramInteractionContextValue {
  highlightedColumns: ReadonlyMap<string, ReadonlySet<string>>;
  onColumnHover: (model: string, column: string) => void;
  onColumnLeave: (model: string, column: string) => void;
  selectedTableId: string | null;
  selectedColumnRef: ColumnRef | null;
  selectedColumns: ReadonlyMap<string, ReadonlySet<string>>;
  cutColumns: ReadonlyMap<string, ReadonlySet<string>>;
  insertionTarget: ColumnInsertTarget | null;
  onTableSelect: (model: string) => void;
  onColumnSelect: (model: string, column: string, event: ReactMouseEvent) => void;
  onEdit: (edit: ModelEdit) => void;
  onColumnContextMenu: (model: string, column: string, event: ReactMouseEvent) => void;
  onColumnDragStart: (model: string, column: string, orderedColumns: readonly string[]) => void;
  onColumnDragOver: (target: ColumnInsertTarget) => void;
  onColumnDragLeave: () => void;
  onColumnDrop: (target: ColumnInsertTarget, ctrlKey: boolean) => void;
  onColumnDragEnd: () => void;
}
```

### Behavior notes

1. **Selection and focus.** A plain click replaces the transfer selection.
   Shift extends only when the prior anchor belongs to the same model; otherwise
   it starts a single-row selection. The range follows current table order and
   may run upward. The clicked focus row remains the existing details-sidebar
   selection. Right-clicking outside the current selection first selects only
   that row; right-clicking inside preserves the range.
2. **Insertion/order.** Selected columns are normalized to source model order,
   regardless of range direction. Same-table transfer ignores `copy` and only
   reorders. Removing the selected block happens before resolving `before`, so
   dropping within the block is a no-op. An absent `before` means append.
3. **Drag UI.** A row drag starts for the complete current selection when the
   pointer starts on a selected row; starting on an unselected row first selects
   it alone. Every destination exposes a line immediately before each displayed
   row and after the final displayed row. Dropping on a table whose relevant
   insertion rows are hidden is not offered. Ctrl is read on `drop`, not only on
   drag start; it copies only for a cross-table drop.
4. **Clipboard.** Clipboard state is webview-memory-local to one diagram tab and
   stores source model/column identities. Cut does not edit until Paste and is
   visually marked. Copy can paste repeatedly; successful Cut paste clears the
   clipboard. Paste is disabled when references no longer exist, when source and
   destination are the same table, or in source mode. Closing menus does not
   clear it.
5. **Atomicity and validation.** One `transferColumns` edit changes all affected
   models/files, PKs, and FKs before persistence. Missing models/columns or an
   unknown `before` column throws `EditError`; no partial result is returned.
   Duplicate input names are deduped. `addColumn` trims both values, rejects a
   blank with `Column name and data type are required`, and rejects a duplicate
   with `A column named "<name>" already exists in model "<model>"`.
6. **Column preservation/names.** The complete parsed `ModelColumn` object is
   moved or shallow/deep-value copied, including `dataTests`, `tests`, `config`,
   `meta`, and `extra`. YAML comments and node style are not part of the domain
   object and need not move. Collision names are allocated sequentially against
   both pre-existing destination names and earlier columns in the same transfer.
7. **FK pair transformation.** Treat each FK independently as ordered pairs
   `(owner/source column, target model/target column)`. On move, replace the
   owner model/name when its source column moved and replace the target
   model/name when its target column moved. Group that FK's resulting pairs by
   `(owner model, target model)` while preserving pair order. Thus partial
   composite moves split an FK; whole moves simply relocate/retarget it. Real
   stays real and virtual stays virtual. Unchanged groups retain all constraint
   keys. A newly split real group copies all keys except `name`; this avoids
   duplicate named constraints. If the entire constraint moves as one group,
   its `name` is preserved unless the destination already has that constraint
   name, in which case `name` is omitted. Rewritten targets use canonical
   `ref('<destination>')`; untouched targets retain their original `to` text.
   Copy performs none of this.
8. **PK transfer.** Determine PK membership from the displayed virtual-first
   PK. On move, remove selected PK members from the source and synchronize its
   artifacts; on copy, leave source untouched. Destination PK members append in
   transfer order using collision-resolved names. If destination has a PK, its
   real/virtual mode and unique-test enabled state win. If it has none, inherit
   source mode and enabled state. Real PK synchronization owns `not_null`; a
   virtual destination strips PK-owned `not_null` from transferred PK columns.
   Moving the last source PK member removes its PK artifacts. Non-PK column
   tests remain preserved.
9. **Matrix naming.** Only the per-model table-menu item and modal heading become
   **Edit columns**. Canvas/global menu and toolbar remain **Edit fields matrix**
   (with the existing all-model qualifier where present).
10. **Matrix reorder.** The handle is a fixed final UI column, unaffected by
    matrix-column visibility/order preferences. It appears only in model scope.
    Any filter value with non-whitespace text disables every handle and drop.
    Reorder emits `transferColumns` with identical source/destination and
    `copy:false`.
11. **Matrix creation.** The creation row is always after filtered existing rows
    in model scope. Only Name and Data type render editable inputs there; other
    cells are blank. Enter in either input submits only when both trimmed values
    are nonblank. The draft clears only after dispatch; domain errors use the
    existing diagram error path. A successful host update leaves a new empty row.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/edit/columnTransfer.test.ts` | `reorders a source-order block within one model` | `[id,a,b,c]`, columns `[b,a]`, append | `[id,c,a,b]`; no names changed |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `moves complete column values before destination column` | source column with every `ModelColumn` field; destination `[x,z]`, before `z` | source removes it; destination `[x,fullColumn,z]` with deep-equal keys/values |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `copies without changing source or foreign keys` | copied FK column | source object/FKs unchanged; destination copy added; no destination FK |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `allocates repeated moved and copied suffixes` | destination `id,id_MOVED,id_MOVED_2,id_COPIED` | move -> `id_MOVED_3`; copy -> `id_COPIED_2` |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `splits an outgoing composite real FK` | child `(a,b)->parent(x,y)`, move `b` to archive | child `(a)->parent(x)`; archive `(b)->parent(y)`; split clone has no `name` |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `splits and redirects an incoming virtual FK` | child virtual `(a,b)->parent(x,y)`, move `y` to archive | child has virtual `(a)->parent(x)` and `(b)->archive(y)` |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `redirects both ends of a moved self-reference pair` | source self FK `(parent_id)->source(id)`, move both columns to archive | archive FK `(parent_id)->archive(id)` |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `moves real PK membership and enabled unique tests` | source real PK `[id,tenant]`, unique enabled; destination no PK; move tenant | source PK `[id]`; destination PK `[tenant]`; both constraints/tests/not_null synchronized |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `copies PK membership while preserving source` | same setup, copy tenant | source unchanged; destination real PK/test/not_null created |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `destination PK settings win` | source real PK column; destination virtual PK `[existing]` | destination virtual PK `[existing,moved]`; no real constraint or PK-owned not_null |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `adds a trimmed named typed column at the end` | model `[id]`, name ` status `, type ` varchar ` | columns `[id,{name:'status',dataType:'varchar'}]` |
| `test/unit/dbt/edit/columnTransfer.test.ts` | `rejects incomplete and duplicate new columns` | blank type; then existing name `id` | exact required/duplicate `EditError` messages from Behavior note 5 |
| `test/unit/webview/columnTransferState.test.ts` | `shift selection follows table order in either direction` | anchor `b`, Shift-click `d`, then anchor `d`, Shift-click `b` in `[a,b,c,d]` | selected columns `[b,c,d]` both times; focus is clicked endpoint |
| `test/unit/webview/columnTransferState.test.ts` | `shift click in another model starts a new selection` | selection in A, Shift-click B.x | B selection `[x]` |
| `test/unit/webview/columnTransferState.test.ts` | `cut clears only after paste while copy remains` | cut/copy selection then `afterPaste` | cut -> `null`; copy -> unchanged clipboard |
| `test/unit/webview/columnTransferState.test.ts` | `paste builds exact before-position transfer edit` | cut A `[b,c]`, target B before `y` | `{kind:'transferColumns',sourceModel:'A',destinationModel:'B',columns:['b','c'],before:'y',copy:false}` |
| `test/unit/webview/matrixRowOrder.test.ts` | `detects only nonblank active filters` | `{name:'   ',dataType:'int'}` then all blanks | `true`, then `false` |
| `test/unit/webview/matrixRowOrder.test.ts` | `builds same-table row reorder edit` | model orders, dragged amount, before customer_id | exact `transferColumns` edit with one column and `copy:false` |
| `test/unit/webview/matrixRowOrder.test.ts` | `requires both trimmed add-column fields` | `status`/blank then ` status `/` varchar ` | `null`, then exact `{kind:'addColumn',model:'orders',name:'status',dataType:'varchar'}` |

Manual interaction checks cover insertion-line positioning, Ctrl state at drop,
context-menu enablement, cut styling, and the matrix's rightmost drag handle.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- `npm run typecheck` — explicit final strict-TypeScript check must be green.

### Do not touch

- Source YAML domain/edit modules and source-diagram UI: this feature is model
  mode only.
- OS/VS Code clipboard wrappers: the transfer clipboard is webview-local and is
  unrelated to AI prompt clipboard features.
- Saved `.dbtiagram.yml` layout format: column order lives in model YAML and
  clipboard/selection state is transient.
- `src/dbt/merge/` policy and serializer APIs: existing sequence reconciliation
  persists the new domain order; transferred comments are explicitly excluded.
- Global matrix editing, filtering, and persisted matrix-column preferences,
  except for retaining its existing **Edit fields matrix** name and omitting the
  new model-only row controls.

## Acceptance Criteria

- [ ] Click and Shift+click select one contiguous same-table column range.
- [ ] Dragging reorders in-table or moves cross-table at a visible insertion line; Ctrl-drop copies cross-table.
- [ ] Context-menu Copy/Cut/Paste follows the specified before-row/append and clipboard behavior.
- [ ] Transfers preserve parsed column keys/values and allocate collision-safe names.
- [ ] Moved incoming/outgoing FK pairs are redirected and composite FKs split; copied columns carry no FKs.
- [ ] PK membership and real/virtual/not-null/unique-test semantics follow moved/copied PK columns.
- [ ] The per-model menu/modal says **Edit columns** while global naming remains **Edit fields matrix**.
- [ ] Per-model matrix rows reorder through rightmost handles, disabled whenever a filter is active.
- [ ] The final per-model matrix row appends a column on Enter only with nonblank Name and Data type.
- [ ] `npm test` and `npm run typecheck` are green.
