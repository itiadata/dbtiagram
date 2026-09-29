---
id: 49
title: Edit source columns in the fields matrix
status: done
priority: medium
created: 2026-09-29
owner: unassigned
depends_on: [27, 40, 46]
---

# Edit source columns in the fields matrix

## Summary

As a dbt developer working with source YAML, I want to open the existing
spreadsheet-style fields matrix for one source table or all displayed source
tables, so that I can efficiently edit source column descriptions, primary-key
metadata, and existing `config.meta` fields without changing source column
identity or order.

## Background

The fields matrix from spec 27 is currently model-mode-only. Source mode hides
its toolbar and table-menu entry points, while an unintended blank-canvas menu
item can update matrix state but cannot render the modal. Source mode already
supports description and forced-virtual primary-key edits. This feature reuses
the same matrix and edit pipeline, adds source column-meta editing as an explicit
exception to the existing source read-only rules, and keeps structural source
column changes unavailable.

## Scope

**In scope**

- Open the fields matrix in source mode from the toolbar, blank-canvas context
  menu, and an individual source table's context menu.
- Reuse the existing global and per-table matrix, filters, rectangular
  selection, batch editing, field visibility/order preferences, and YAML write
  pipeline.
- Keep source column names and data types visible but read-only.
- Allow single-cell and batch editing of source column descriptions and
  discovered `config.meta` fields.
- Allow primary-key membership editing while preserving source mode's mandatory
  virtual-primary-key behavior.
- Label source-mode global identity and actions with “Table”/“tables” rather
  than “Model”/“models”.
- Persist source `config.meta` changes through surgical source-YAML merge while
  preserving unrelated configuration and YAML content.

**Out of scope**

- Adding, deleting, renaming, moving, copying, pasting, or reordering source
  columns. In particular, source per-table matrices have no creation row or row
  reorder handle.
- Editing source column data types.
- Making source primary keys non-virtual.
- Creating new meta-key columns from the matrix; as in spec 27, only keys
  discovered in the current scope are shown.
- Changing model-mode matrix behavior.
- Separating persisted matrix field visibility/order preferences by diagram
  mode; the existing per-model-scope and global-scope preference sets remain
  shared.

## Scenarios

### Open the matrix for one source table

```
Given a source-mode diagram shows table "finops.costs"
When the user opens its context menu and chooses "Edit columns"
Then a modal opens with one row per column of "finops.costs"
And Name and Data type are visible but read-only
And no add-column row or row-reorder handle is shown
```

### Open the matrix for all source tables

```
Given a source-mode diagram shows multiple tables
When the user chooses "Edit fields matrix" from the toolbar
  or "Edit fields matrix (all tables)" from blank canvas
Then the global matrix opens with one row per column across those tables
And its identity column is labelled "Table"
```

### Edit source descriptions and metadata

```
Given the source matrix includes description and config.meta.confidentiality
When the user changes a description and sets confidentiality to "restricted"
Then the edits are written to the matching source-table column in source YAML
And unrelated config keys, YAML comments, and other tables remain unchanged
```

### Batch edit source metadata

```
Given multiple source matrix cells in the same Description or meta field are selected
When the user applies one batch value
Then one existing diagram edit is dispatched for each selected source column
And every matching source YAML value is updated
```

### Edit a source primary key

```
Given the source matrix is open
When the user changes a column's Primary key checkbox
Then the source table's virtual primary-key membership is updated
And Virtual PK remains checked for primary-key columns and cannot be edited
```

### Reject prohibited source edits in the domain

```
Given a source-mode edit reaches the source edit dispatcher
When it tries to rename, retype, add, transfer, or otherwise structurally edit a column
Then it fails with "This field is read-only in source mode"
But setColumnMeta is accepted
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/sourceEdit.ts` | modify | Reuse the existing pure column-meta setter for source tables while retaining all other source read-only restrictions. |
| `src/shared/matrixColumns.ts` | modify | Make matrix field definitions mode-aware so source name/data type/virtual-PK cells are read-only while description, PK, and meta cells remain editable. |
| `webview-ui/matrix-row-order.ts` | modify | Expose a pure mode capability used to suppress source row creation and reordering. |
| `webview-ui/FieldsMatrixRow.tsx` | modify | Render mode-policy read-only text cells and disabled checkbox cells using the shared column definitions. |
| `webview-ui/FieldsMatrix.tsx` | modify | Accept diagram mode, apply mode-aware columns and nouns, and omit source row creation/reordering while retaining field display-column customization. |
| `webview-ui/App.tsx` | modify | Expose all three matrix entry points in source mode, pass mode to the modal, and keep model/source menu wording correct. |
| `test/unit/dbt/sourceEdit.test.ts` | modify | Cover accepted source meta edits and rejected structural edits. |
| `test/unit/dbt/sourceMerge.test.ts` | modify | Verify source column meta persistence preserves sibling config and unknown YAML. |
| `test/unit/shared/matrixColumns.test.ts` | modify | Cover source/model field editability and mode nouns. |
| `test/unit/webview/matrixRowOrder.test.ts` | modify | Cover source/model row-structure capability. |
| `specs/ARCHITECTURE.md` | modify | Update changed module responsibilities; no module is added or removed. |

### Signatures

```ts
// src/dbt/sourceEdit.ts (pure — must not import `vscode`)
export function applySourceEdit(
  sources: SourceDefinition[],
  edit: ModelEdit,
): ApplySourceEditResult;

// src/shared/matrixColumns.ts (shared — must not import `vscode`)
export interface MatrixColumnDef {
  id: MatrixColumnId;
  label: string;
  visible: boolean;
  editable: boolean;
  batchEditable: boolean;
}

export function defaultMatrixColumns(
  metaKeys: readonly string[],
  scope: MatrixScope,
  mode?: DiagramMode,
): MatrixColumnDef[];

// webview-ui/matrix-row-order.ts (webview pure)
export function matrixAllowsRowStructure(mode: DiagramMode): boolean;

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

// webview-ui/FieldsMatrix.tsx (webview)
export interface FieldsMatrixProps {
  mode: DiagramMode;
  target: { scope: 'model'; model: string } | { scope: 'global' };
  graph: DiagramGraph;
  onEdit: (edit: ModelEdit) => void;
  onClose: () => void;
  columns: MatrixColumnDef[];
  seedColumns: (columns: MatrixColumnDef[]) => void;
  onColumnsChange: (columns: MatrixColumnDef[]) => void;
  storedPrefs: StoredMatrixColumnPref[] | undefined;
  columnFilters: MatrixColumnFilters;
  onColumnFilterChange: (columnId: MatrixColumnId, text: string) => void;
}
export function FieldsMatrix(props: FieldsMatrixProps): JSX.Element;
```

`App` remains the sole export of `webview-ui/App.tsx`; no exported signature
changes there.

### Behavior notes

1. **Entry points and nouns.** Model mode keeps its existing toolbar button,
   per-table **Edit columns**, and blank-canvas **Edit fields matrix (all
   models)** labels. Source mode exposes the same locations, with per-table
   **Edit columns**, toolbar **Edit fields matrix**, and blank-canvas **Edit
   fields matrix (all tables)**. The global matrix's first column is **Model**
   in model mode and **Table** in source mode; its heading uses the same noun.
2. **Source editability.** Source Name and Data type text inputs are `readOnly`.
   Source Description and discovered meta inputs are editable and batch-editable.
   Source Primary key is editable and batch-editable. Source Virtual PK is
   checked for PK members, disabled for every row, and not batch-editable.
   Model-mode definitions retain their current editability exactly.
3. **No source structural rows.** `matrixAllowsRowStructure('source')` is
   `false`; consequently source per-table matrices render neither the fixed
   Order column/drag handles nor `FieldsMatrixCreateRow`. Matrix *field*
   show/hide and drag-to-reorder inside the Columns popover remain available;
   they customize the view and do not reorder source YAML columns.
4. **Meta semantics.** `applySourceEdit` handles `setColumnMeta` by applying the
   existing `setColumnMetaValue` behavior to the qualified source table. Values
   are trimmed; clearing an existing key keeps it with `""`; blanking an absent
   key is a no-op. A missing table or column uses the existing exact domain
   errors. Other existing source edit rules are unchanged.
5. **Persistence.** Existing `diagram:edit` routing and `mergeSourceYml` perform
   writes. A source meta edit changes only the target column's `config.meta`
   value; sibling `config` keys, comments, unknown keys, source/table order, and
   other columns/tables are preserved according to the existing reconciler.
6. **Batch behavior.** The existing matrix selection and one-message-per-cell
   loop are reused. Read-only source fields never produce a batch affordance.
   PK batches reuse the existing per-row toggling semantics and source domain
   enforcement forces the resulting PK virtual.
7. **Defensive domain boundary.** `setColumnName`, `setColumnDataType`,
   `addColumn`, and `transferColumns` remain rejected in source mode with the
   exact message `This field is read-only in source mode`, regardless of UI
   suppression. `setColumnMeta` is removed from that rejection list only.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/matrixColumns.test.ts` | `makes only permitted source fields editable` | source/global defaults with meta `confidentiality` | labels start `Table`, and editable/batch pairs are name `false/false`, dataType `false/false`, description `true/true`, primaryKey `true/true`, virtualPrimaryKey `false/false`, meta `true/true` |
| `test/unit/shared/matrixColumns.test.ts` | `preserves model matrix field behavior` | model/global defaults | first label `Model`; name remains editable but not batch-editable; all other non-identity fields remain editable and batch-editable |
| `test/unit/webview/matrixRowOrder.test.ts` | `allows matrix row structure only in model mode` | `model`, `source` | `true`, `false` |
| `test/unit/dbt/sourceEdit.test.ts` | `sets source column meta without changing sibling fields` | `finops.costs.id` with `config.tags`, existing `meta.owner`; set `confidentiality` to ` restricted ` | target meta is `{owner:'data',confidentiality:'restricted'}`; config/tags and all other objects' values are unchanged |
| `test/unit/dbt/sourceEdit.test.ts` | `keeps existing source meta key when cleared` | existing `confidentiality:'restricted'`; set value to spaces | key remains with value `''` |
| `test/unit/dbt/sourceEdit.test.ts` | `rejects source column structural edits` | set name, set data type, add column, and transfer column edits | each throws `This field is read-only in source mode` |
| `test/unit/dbt/sourceMerge.test.ts` | `writes source column meta without damaging unknown YAML` | commented source YAML with `config.tags`, unknown table keys, and another table; apply source meta edit then merge | output contains the comment, sibling/unknown keys, untouched table, and `confidentiality: restricted` |

Manual verification covers the React wiring not exercised by the sub-second pure
unit suite: open per-table and global matrices from all three source entry
points; confirm source nouns; confirm read-only cells; batch-edit Description
and meta; toggle PK; and confirm there is no source add row or reorder handle.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- `npm run typecheck` — explicit final strict-TypeScript check must be green.

### Do not touch

- `src/dbt/edit/` model edit implementations: source meta editing reuses the
  existing setter without changing model semantics.
- Source table/column names and data types, source column sequence, and source
  add/transfer behavior: all remain read-only.
- Matrix selection, filtering, preference protocol/storage, and history
  protocol: existing behavior and message shapes are reused unchanged.
- Details-sidebar source restrictions and source FK behavior.
- Saved `.dbtiagram.yml` layout format, static diagram UI, fixtures, and VS Code
  wrappers.

## Acceptance Criteria

- [ ] Source mode exposes per-table and all-table fields-matrix entry points.
- [ ] Source Name, Data type, and Virtual PK cells are read-only.
- [ ] Source Description, Primary key, and discovered meta cells support single
      and compatible batch edits.
- [ ] Source meta edits are surgically persisted without damaging unrelated YAML.
- [ ] Source matrices cannot add or reorder source columns.
- [ ] Model-mode matrix behavior is unchanged.
- [ ] `npm run verify`, `npm test`, and `npm run typecheck` are green.
