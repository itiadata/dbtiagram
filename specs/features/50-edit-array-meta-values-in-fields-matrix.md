---
id: 50
title: Edit array meta values in the fields matrix
status: approved
priority: medium
created: 2026-09-29
owner: unassigned
depends_on: [27, 49]
---

# Edit array meta values in the fields matrix

## Summary

As a diagram user, I want first-level column `config.meta` arrays to remain
arrays when I edit them from the fields matrix, so that values such as
`sample_values` can be changed without being flattened into one comma-separated
YAML string. The matrix shows a compact comma-separated preview; double-clicking
the cell opens a list editor where each existing scalar item can be edited and
the complete array is committed with Save.

## Background

The fields matrix currently converts every meta value to display text. An array
therefore appears comma-separated, but editing that cell sends the preview back
through the scalar `setColumnMeta` edit and replaces the YAML sequence with one
string. This feature gives arrays a type-preserving edit path in both model and
source matrices.

## Scope

**In scope**

- Recognizing an array stored directly as the value of a first-level column
  `config.meta` key.
- Showing array values as a comma-and-space-separated preview in the matrix.
- Opening a modal list editor when an array meta cell is double-clicked.
- Editing existing string, number, and boolean items by double-clicking an item.
- Preserving each edited item's original scalar type.
- Showing nested arrays, mappings, and other unsupported values read-only while
  allowing scalar siblings in the same array to be edited.
- Explicit Save and Cancel actions. Save replaces the meta value with an array;
  Cancel makes no edit.
- The same behavior in model and source fields matrices.

**Out of scope**

- Adding, deleting, duplicating, or reordering array items.
- Editing nested arrays, mappings, `null`, or other non-string/number/boolean
  array items.
- Parsing comma-separated scalar text as a new array.
- Batch-applying an array value to multiple cells.
- Changing how non-array meta values are edited.

## Scenarios

### View an array in a matrix cell

```
Given Day.config.meta.sample_values is ["2026-08-17", "2026-08-18"]
When the fields matrix is open
Then its sample_values cell shows "2026-08-17, 2026-08-18"
And the underlying matrix row retains the array rather than converting it to text
```

### Open and edit existing array items

```
Given Day.config.meta.sample_values is ["2026-08-17", "2026-08-18"]
When the user double-clicks its sample_values matrix cell
Then a modal shows the two existing items in their original order
When the user double-clicks the second item, changes it to "2026-08-19", and clicks Save
Then one setColumnMetaArray edit is sent with ["2026-08-17", "2026-08-19"]
And model.yml still contains sample_values as a YAML sequence in the same order
```

### Preserve scalar item types

```
Given a column meta array is ["10", 10, false]
When the user edits the items to "11", "12", and "true" and clicks Save
Then the saved array is ["11", 12, true]
And the YAML values remain a string, a number, and a boolean respectively
```

### Reject an invalid typed value

```
Given a number item in an open array editor has value 10
When the user changes its text to "ten"
Then the editor reports that the item must be a valid number
And Save does not commit an edit until the value is valid or restored
```

### Keep nested values read-only

```
Given a column meta array is ["open", {label: "fixed"}, [1, 2], null]
When the array editor opens
Then only the "open" item can be edited
And the mapping, nested array, and null items are displayed read-only
And Save preserves every read-only item unchanged
```

### Cancel array editing

```
Given an array editor is open and an item has an uncommitted change
When the user clicks Cancel or presses Escape
Then the editor closes without sending an edit
And the YAML is unchanged
```

### Edit a source column array

```
Given the source fields matrix contains a column whose config.meta.sample_values is [1, 2]
When the user changes the second item to 3 and clicks Save
Then the source column receives [1, 3]
And source.yml still contains sample_values as a YAML sequence
```

### Do not batch-edit array cells as text

```
Given selected cells include an array-valued meta cell
When the selection would otherwise qualify for text batch editing
Then the text batch-apply control is not offered for that selection
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/README.md` | modify | Add feature 50 to the feature index as Draft. |
| `specs/ARCHITECTURE.md` | modify | Record the new array editor and matrix-value helper, and update affected module responsibilities/exports. |
| `src/dbt/edit/types.ts` | modify | Add the type-preserving `setColumnMetaArray` edit variant. |
| `src/dbt/edit/column.ts` | modify | Add immutable replacement of one column meta value with an array. |
| `src/dbt/edit/index.ts` | modify | Dispatch `setColumnMetaArray` through the model edit funnel. |
| `src/dbt/sourceEdit.ts` | modify | Apply `setColumnMetaArray` to source columns through the same pure helper. |
| `src/diagram/matrix.ts` | modify | Retain raw meta values in matrix rows instead of stringifying them. |
| `src/shared/history.ts` | modify | Give array-meta edits the same deterministic history label as scalar meta edits. |
| `webview-ui/matrix-meta-values.ts` | create | Pure display, scalar parsing, edit construction, and batch-safety helpers for matrix meta values. |
| `webview-ui/MetaArrayEditor.tsx` | create | Modal list editor for existing array items, with typed validation and Save/Cancel. |
| `webview-ui/FieldsMatrixRow.tsx` | modify | Render array previews as double-clickable cells and open the array editor. |
| `webview-ui/FieldsMatrix.tsx` | modify | Route array commits and prevent array/non-scalar cells from entering text batch edit. |
| `webview-ui/styles.css` | modify | Style array cells, nested modal, item rows, read-only values, and validation errors. |
| `test/unit/dbt/edit/column.test.ts` | modify | Cover type-preserving model array replacement and identity-preserving no-op. |
| `test/unit/dbt/sourceEdit.test.ts` | modify | Cover array replacement for source columns. |
| `test/unit/dbt/merge/reconcile.test.ts` | modify | Prove model write-back keeps an edited array as a YAML sequence. |
| `test/unit/dbt/sourceMerge.test.ts` | modify | Prove source write-back keeps an edited array as a YAML sequence. |
| `test/unit/diagram/matrix.test.ts` | modify | Cover preservation of raw array meta values in matrix rows. |
| `test/unit/shared/history.test.ts` | modify | Cover the deterministic history label for array-meta edits. |
| `test/unit/webview/matrixMetaValues.test.ts` | create | Cover previews, typed parsing, edit construction, and batch eligibility. |

### Signatures

```ts
// src/dbt/edit/types.ts (pure — must not import `vscode`)
export type ModelEdit =
  // existing variants unchanged
  | {
      kind: 'setColumnMetaArray';
      model: string;
      column: string;
      key: string;
      values: unknown[];
    };

// src/dbt/edit/column.ts (pure — must not import `vscode`)
export function setColumnMetaArrayValue(
  model: ModelDefinition,
  column: string,
  key: string,
  values: readonly unknown[],
): ModelDefinition;

// src/diagram/matrix.ts (pure — must not import `vscode`)
export interface MatrixRow {
  model: string;
  column: string;
  dataType?: string;
  description?: string;
  isPrimaryKey: boolean;
  virtualPrimaryKey: boolean;
  meta: Record<string, unknown>;
}

// webview-ui/matrix-meta-values.ts (webview, pure)
export type EditableMetaScalar = string | number | boolean;
export type MetaScalarParseResult =
  | { ok: true; value: EditableMetaScalar }
  | { ok: false; error: string };
export function isMetaArray(value: unknown): value is unknown[];
export function isEditableMetaScalar(value: unknown): value is EditableMetaScalar;
export function matrixMetaPreview(value: unknown): string;
export function parseEditedMetaScalar(
  original: EditableMetaScalar,
  draft: string,
): MetaScalarParseResult;
export function matrixTextEdit(
  row: MatrixRow,
  columnId: MatrixColumnId,
  value: string,
): ModelEdit | null;
export function matrixArrayEdit(
  row: MatrixRow,
  columnId: MatrixColumnId,
  values: readonly unknown[],
): ModelEdit | null;
export function metaValuesSupportTextBatch(values: readonly unknown[]): boolean;

// webview-ui/MetaArrayEditor.tsx (webview)
export interface MetaArrayEditorProps {
  model: string;
  column: string;
  metaKey: string;
  values: readonly unknown[];
  onSave: (values: readonly unknown[]) => void;
  onCancel: () => void;
}
export function MetaArrayEditor(props: MetaArrayEditorProps): JSX.Element;

// webview-ui/FieldsMatrixRow.tsx (webview)
export interface FieldsMatrixRowProps {
  // existing properties unchanged
  onArrayCommit: (
    row: MatrixRow,
    column: MatrixColumnId,
    values: readonly unknown[],
  ) => void;
}
```

`applyEdit`, `applySourceEdit`, `buildMatrixRows`, `describeModelEdit`,
`FieldsMatrix`, and their existing exported signatures remain unchanged.

### Behavior notes

- `buildMatrixRows` copies each discovered `column.meta[key]` value directly
  into the row. A missing key remains `undefined`; no value is stringified.
- `matrixMetaPreview` displays strings, numbers, and booleans with `String`.
  For an array it joins item previews with the literal separator `", "`.
  Nested arrays and mappings use deterministic JSON text when serializable;
  `null` displays as `null`. This preview is display/filter text only.
- A meta cell whose raw value is an array is not a text input. It remains
  selectable and shows its preview; double-click opens `MetaArrayEditor`.
- The editor takes a shallow working copy. It renders one row per existing item
  and never exposes controls or gestures for adding, deleting, or reordering.
- A string, finite number, or boolean item becomes editable only after that item
  is double-clicked. Nested arrays, mappings, `null`, and unsupported values are
  visibly read-only. Their original references/values are retained on Save.
- String drafts are saved exactly as entered, including surrounding whitespace.
  Number drafts are trimmed and must parse to a finite JavaScript number; the
  literal error is `Enter a valid number`. Boolean drafts are trimmed,
  case-insensitive `true` or `false`; the literal error is `Enter true or false`.
  This preserves the original item type rather than inferring a new one.
- Save validates all edited scalar items. While any draft is invalid, no edit is
  sent and its literal validation error is shown. A successful Save sends one
  `setColumnMetaArray` edit and closes the nested modal.
- Cancel, the nested modal's close button, and Escape discard its working copy
  and send no edit. Escape closes the nested editor first, not the matrix.
  Pointer events inside the nested modal must not trigger the matrix's outside-
  click close behavior.
- `setColumnMetaArrayValue` shallow-copies `values` into `meta[key]`, preserving
  item order and types. If the current value is an array with equal item values
  by `Object.is`, it returns the original model. Unlike scalar editing, an empty
  array is a valid present value and is never treated as a blank/deletion.
- Existing YAML merge behavior reconciles the array as a sequence. It must not
  serialize via comma joining or quote the complete preview as one scalar.
- An array-valued meta cell and any unsupported non-scalar meta cell are not
  eligible for the existing text batch action. A selected meta range is text-
  batchable only when every selected raw value is `undefined`, string, number,
  or boolean. Existing scalar batch behavior otherwise remains unchanged.
- Model and source modes both emit the same `setColumnMetaArray` edit. The host's
  existing mode-specific edit funnel determines which YAML file is persisted.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/matrix.test.ts` | `retains array meta values without stringifying them` | `sample_values: ['2026-08-17', '2026-08-18']` | row meta value deep-equals the same two-item array and is not a string |
| `test/unit/webview/matrixMetaValues.test.ts` | `renders an array as a comma-separated preview` | `['2026-08-17', '2026-08-18']` | `'2026-08-17, 2026-08-18'` |
| `test/unit/webview/matrixMetaValues.test.ts` | `builds one array edit without flattening values` | Day row, `{meta:'sample_values'}`, `['2026-08-17','2026-08-19']` | `{kind:'setColumnMetaArray',model:'orders',column:'Day',key:'sample_values',values:['2026-08-17','2026-08-19']}` |
| `test/unit/webview/matrixMetaValues.test.ts` | `parses edited values according to their original scalar types` | originals `'10'`, `10`, `false`; drafts `'11'`, `'12'`, `'true'` | successful values `'11'`, `12`, `true` |
| `test/unit/webview/matrixMetaValues.test.ts` | `rejects invalid number and boolean drafts` | `(10,'ten')`, `(false,'yes')` | `{ok:false,error:'Enter a valid number'}` and `{ok:false,error:'Enter true or false'}` |
| `test/unit/webview/matrixMetaValues.test.ts` | `classifies only strings numbers and booleans as editable items` | `'open'`, `1`, `false`, `{label:'fixed'}`, `[1,2]`, `null` | `true,true,true,false,false,false` |
| `test/unit/webview/matrixMetaValues.test.ts` | `disables text batch for array and object values` | scalar/undefined list, array list, object list | `true`, `false`, `false` |
| `test/unit/dbt/edit/column.test.ts` | `replaces a meta array while preserving item types and order` | `['10',10,false]` changed to `['11',12,true]` | meta value deep-equals `['11',12,true]` |
| `test/unit/dbt/edit/column.test.ts` | `returns the original model for an equal meta array` | existing `[1,'a',false]`, replacement `[1,'a',false]` | returned model is the original object |
| `test/unit/dbt/merge/reconcile.test.ts` | `writes an edited model meta array as a YAML sequence` | block-sequence `sample_values`, replace second date | parsed output value is the two-item array; output does not contain `sample_values: 2026-08-17,` |
| `test/unit/dbt/sourceEdit.test.ts` | `edits a source column meta array` | source value `[1,2]`, `setColumnMetaArray` values `[1,3]` | source meta value deep-equals `[1,3]` |
| `test/unit/dbt/sourceMerge.test.ts` | `writes an edited source meta array as a YAML sequence` | source block-sequence `[1,2]`, replace with `[1,3]` | parsed output value is `[1,3]`; output does not contain `sample_values: 1,` |
| `test/unit/shared/history.test.ts` | `describes a column meta array edit` | `setColumnMetaArray` for `orders.Day.sample_values` | `'Change orders.Day meta sample_values'` |

The pure parser/classifier tests cover the modal's type preservation, invalid
draft handling, and read-only classification. Component wiring is additionally
checked in Manual Verify because the project has no DOM test harness.

### Verification

- `npm run verify` — typecheck and all unit suites must be green.
- `npm test` — unit and VS Code integration suites must be green.
- `npm run typecheck` — final strict typecheck must be green.
- Manual Verify in a model matrix: edit a block-style `sample_values` date array,
  Save, and confirm the YAML remains a sequence; repeat Cancel and invalid-number
  cases.
- Manual Verify in a source matrix: edit a scalar item in an array containing a
  read-only nested value and confirm both the nested value and sequence survive.

### Do not touch

- Meta-key discovery, matrix column preferences, row creation/reordering,
  primary/foreign-key editing, and scalar meta clearing semantics.
- YAML parser normalization and the location of column metadata under
  `config.meta`.
- Model/source merge policies except for adding focused regression tests; their
  existing sequence reconciliation should perform the write-back.
- The host/webview protocol shape: `ModelEdit` already crosses the typed
  `diagram:edit` message, so no new message type is needed.
- Static viewer behavior; it does not expose matrix editing.

## Acceptance Criteria

- [ ] Array-valued first-level `config.meta` cells display a comma-separated
      preview without losing the underlying array.
- [ ] Double-clicking an array cell opens a list of its existing items.
- [ ] Existing string, number, and boolean items can be edited and retain their
      original YAML types.
- [ ] Nested arrays, mappings, nulls, and unsupported items are read-only and
      survive Save unchanged.
- [ ] Save emits one array edit; Cancel and Escape emit none.
- [ ] Array item order and count cannot be changed in the editor.
- [ ] Model and source YAML write the result as a sequence, never one comma-
      separated scalar.
- [ ] Array/non-scalar cells cannot be overwritten by scalar batch editing.
- [ ] `npm run verify`, `npm test`, and `npm run typecheck` are green.
