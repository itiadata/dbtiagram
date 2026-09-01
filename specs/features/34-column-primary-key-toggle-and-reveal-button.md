---
id: 34
title: Column primary-key toggle and a Reveal in model.yml button in the details sidebar
status: implemented
priority: medium
created: 2026-09-01
owner: unassigned
depends_on: [06, 08, 15, 25, 33]
---

# Column primary-key toggle and a Reveal in model.yml button in the details sidebar

## Summary

As a dbt modeller editing a diagram, I want the details sidebar's **Column**
section to offer a **Primary key** checkbox that adds the selected column to (or
removes it from) its table's primary key, and I want a **Reveal in model.yml**
button in both the **Table** and **Column** sections, so that I can manage key
membership and jump to the YAML source without leaving the properties pane or
hunting for a context menu.

## Background

Primary key membership is today only editable from the table view of the details
sidebar (`PrimaryKeySection`, spec 08/33) or the fields matrix (spec 27). When a
column is selected, the sidebar shows only Name, Data type and Description — the
user has to reselect the table to make that column part of the key.

"Reveal in model.yml" (spec 15, extended to columns by spec 25) exists only as a
context-menu item on the table header, on a column row, and in the left filter
sidebar. There is no button for it anywhere, so the action is easy to miss.

## Scope

**In scope**

- A **Primary key** checkbox in the details sidebar's Column section that toggles
  the selected column's membership in its table's primary key, reusing the
  existing `setPrimaryKey` edit.
- A **Reveal in model.yml** button in the details sidebar's Table section
  (revealing the model declaration) and in its Column section (revealing that
  column's declaration), reusing the existing `model:openSource` message.
- A pure, unit-tested helper that derives the `setPrimaryKey` edit for a column
  toggle.

**Out of scope**

- Any change to how tests (`tests` / `data_tests`) are displayed or edited; the
  read-only test YAML box discussed during drafting is deliberately deferred.
- Any change to `PrimaryKeySection`, the fields matrix, the table-node icons, or
  the pure PK edit logic in `src/dbt/edit/primaryKey.ts`.
- Any change to the context-menu items, which stay exactly as they are.
- A **Virtual** or **Omit unique combination test** control in the Column
  section; those stay exclusive to the table view.

## Scenarios

### Add a column to a table with no primary key

```
Given a model with no primary key
And its column "id" is selected in the details sidebar
When the user checks the "Primary key" checkbox
Then a setPrimaryKey edit is posted with columns ["id"], virtual false and uniqueTest true
And the model.yml gains the primary_key constraint, the not_null check on "id"
  and the dbt_utils.unique_combination_of_columns test
```

### Append a column to an existing primary key

```
Given a model whose real primary key is ["order_id"] with the unique combination test present
And its column "line_no" is selected in the details sidebar
When the user checks the "Primary key" checkbox
Then a setPrimaryKey edit is posted with columns ["order_id", "line_no"], virtual false and uniqueTest true
And the new column is appended at the end of the key
```

### Remove a column from the primary key

```
Given a model whose primary key is ["order_id", "line_no"]
And its column "line_no" is selected in the details sidebar
And the "Primary key" checkbox is checked
When the user unchecks it
Then a setPrimaryKey edit is posted with columns ["order_id"], virtual false and uniqueTest true
```

### The checkbox preserves a virtual primary key

```
Given a model with a virtual primary key ["id"]
And its column "code" is selected in the details sidebar
When the user checks the "Primary key" checkbox
Then a setPrimaryKey edit is posted with columns ["id", "code"] and virtual true
And uniqueTest is false, matching what the graph reports for a virtual key
```

### The checkbox reflects current membership

```
Given a model whose primary key is ["id"]
When the user selects the column "id"
Then the "Primary key" checkbox is checked
When the user selects the column "name"
Then the "Primary key" checkbox is unchecked
```

### Reveal the model from the Table section

```
Given a table is selected in the details sidebar
When the user clicks the "Reveal in model.yml" button in the Table section
Then a model:openSource message is posted with that model name and no column
```

### Reveal the column from the Column section

```
Given the column "line_no" of model "orders" is selected in the details sidebar
When the user clicks the "Reveal in model.yml" button in the Column section
Then a model:openSource message is posted with model "orders" and column "line_no"
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/columnPrimaryKey.ts` | create | Pure helpers deriving PK membership and the toggle edit for a single column. |
| `webview-ui/DetailsSidebar.tsx` | modify | Render the Column-section "Primary key" checkbox and the "Reveal in model.yml" button in both sections; accept the new `onOpenModelSource` prop. |
| `webview-ui/App.tsx` | modify | Pass the existing `onOpenModelSource` callback to `DetailsSidebar`. |
| `webview-ui/styles.css` | modify | Add the `.details__reveal` button style. |
| `specs/ARCHITECTURE.md` | modify | Add the `webview-ui/columnPrimaryKey.ts` row; update the `DetailsSidebar.tsx` row. |
| `test/unit/webview/columnPrimaryKey.test.ts` | create | Unit tests for the pure helpers. |

### Signatures

```ts
// webview-ui/columnPrimaryKey.ts  (webview — pure, no React, no vscode)
import type { ModelEdit } from '../src/dbt/edit';
import type { TableNode } from '../src/diagram/graph';

/** Whether `columnName` is part of the table's displayed primary key. */
export function isPrimaryKeyColumn(node: TableNode, columnName: string): boolean;

/**
 * The `setPrimaryKey` edit that adds `columnName` to the table's primary key
 * when it is not a member, or removes it when it is.
 */
export function toggleColumnPrimaryKey(node: TableNode, columnName: string): ModelEdit;
```

```ts
// webview-ui/DetailsSidebar.tsx  (webview)
interface DetailsSidebarProps {
  // …existing props unchanged…
  /** Posts `model:openSource`; `column` omitted reveals the model declaration (spec 15/25). */
  onOpenModelSource: (model: string, column?: string) => void;
}
```

### Behavior notes

1. `isPrimaryKeyColumn(node, columnName)` is
   `node.primaryKey?.columns.includes(columnName) ?? false`. Exact string match,
   no trimming or case folding.
2. `toggleColumnPrimaryKey` reads the same defaults `PrimaryKeySection` uses, so
   the two controls stay consistent:
   - `columns = node.primaryKey?.columns ?? []`
   - `virtual = node.primaryKey?.virtual ?? false`
   - `uniqueTest = node.primaryKey?.uniqueTest ?? true`
   It returns
   `{ kind: 'setPrimaryKey', model: node.id, columns: next, virtual, uniqueTest }`
   where `next` is `columns.filter((c) => c !== columnName)` when the column is a
   member, and `[...columns, columnName]` otherwise — **appended at the end**,
   never re-sorted.
3. `uniqueTest` is always sent explicitly (never omitted). For a model with no
   primary key it is therefore `true`, so checking the box on the first column
   creates the `dbt_utils.unique_combination_of_columns` test — matching the
   spec 33 decision that omitting the test stays exceptional and opt-in from the
   table view only. For a virtual key `buildDiagram` reports `uniqueTest: false`,
   and `setPrimaryKeyOnModel` ignores the flag on the virtual path anyway.
4. The helper never mutates `node` or `node.primaryKey.columns`; `next` is always
   a new array.
5. Unchecking the last remaining PK column yields `columns: []`, which the
   existing `setPrimaryKeyOnModel` already treats as "clear the primary key"
   (constraint, `not_null` checks and unique-combination test all removed).
6. In `DetailsSidebar`, the Column section renders — in this order — the context
   line, the reveal button row, `Name`, `Data type`, `Description`, then the
   `Primary key` checkbox using the existing `details__checkbox-row` class:

   ```tsx
   <label className="details__checkbox-row">
     <input
       type="checkbox"
       checked={isPrimaryKeyColumn(entity.node, entity.column.name)}
       onChange={() => onEdit(toggleColumnPrimaryKey(entity.node, entity.column.name))}
     />
     Primary key
   </label>
   ```

   The checkbox is never disabled.
7. The reveal button is rendered in both branches immediately after the section
   heading (Table) / after the context line (Column), as:

   ```tsx
   <button
     type="button"
     className="details__reveal"
     title="Reveal in model.yml"
     onClick={() => onOpenModelSource(/* model */, /* column | undefined */)}
   >
     <ChartNoAxesGantt size={14} />
     Reveal in model.yml
   </button>
   ```

   The Table branch passes only the model id; the Column branch passes the model
   id and the column name. `ChartNoAxesGantt` is imported from
   `./icons`, the same icon the context-menu item uses.
8. `App.tsx` passes its existing `onOpenModelSource` callback (line ~279)
   verbatim to `DetailsSidebar`; no new callback, no new message type, no change
   to `src/shared/protocol.ts`.
9. `.details__reveal` styling: full-width-of-content inline-flex row, `gap: 6px`,
   `align-items: center`, VS Code secondary-button colors
   (`--vscode-button-secondaryBackground` / `--vscode-button-secondaryForeground`,
   hover `--vscode-button-secondaryHoverBackground`), `border: none`,
   `border-radius: 2px`, `padding: 4px 8px`, `cursor: pointer`,
   `margin-bottom: 8px`, `font-size: 11px`. Follows the conventions of the
   existing sidebar button rules; adds no new CSS variables.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/columnPrimaryKey.test.ts` | `reports membership in the primary key` | node with `primaryKey: { columns: ['id'], virtual: false, uniqueTest: true }` | `isPrimaryKeyColumn(node, 'id')` is `true`; `isPrimaryKeyColumn(node, 'name')` is `false` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `reports no membership when the table has no primary key` | node with `primaryKey: undefined` | `isPrimaryKeyColumn(node, 'id')` is `false` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `creates a real primary key with the unique test when none exists` | node `id: 'orders'`, `primaryKey: undefined`; toggle `'id'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: ['id'], virtual: false, uniqueTest: true }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `appends a column to an existing primary key` | `primaryKey: { columns: ['order_id'], virtual: false, uniqueTest: true }`; toggle `'line_no'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: ['order_id', 'line_no'], virtual: false, uniqueTest: true }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `removes a column from the primary key` | `primaryKey: { columns: ['order_id', 'line_no'], virtual: false, uniqueTest: true }`; toggle `'line_no'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: ['order_id'], virtual: false, uniqueTest: true }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `clears the primary key when the last column is removed` | `primaryKey: { columns: ['id'], virtual: false, uniqueTest: true }`; toggle `'id'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: [], virtual: false, uniqueTest: true }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `preserves the virtual flag` | `primaryKey: { columns: ['id'], virtual: true, uniqueTest: false }`; toggle `'code'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: ['id', 'code'], virtual: true, uniqueTest: false }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `preserves an omitted unique test on a real key` | `primaryKey: { columns: ['id'], virtual: false, uniqueTest: false }`; toggle `'code'` | `{ kind: 'setPrimaryKey', model: 'orders', columns: ['id', 'code'], virtual: false, uniqueTest: false }` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `does not mutate the node` | `primaryKey: { columns: ['id'], virtual: false, uniqueTest: true }`; toggle `'code'` | `node.primaryKey.columns` still equals `['id']` after the call |

The reveal-button scenarios and the checkbox-reflects-membership scenario are
covered by the `isPrimaryKeyColumn` tests plus the Manual Verify step; there is
no React component test harness in this repo (see `specs/README.md`), and the
message-posting path itself is already covered by
`test/unit/webview/openSource.test.ts`.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.
- Manual Verify (F5 against `fixtures/sample-dbt/`): select a column, check
  **Primary key**, confirm the model.yml gains the constraint, the `not_null`
  test and the unique-combination test, and that the table node shows the key
  icon; uncheck it and confirm they are removed. Click **Reveal in model.yml**
  from both the Table and the Column section and confirm the editor opens at the
  model and at the column respectively.

### Do not touch

- `src/dbt/edit/primaryKey.ts`, `src/dbt/edit/types.ts`, `src/dbt/edit/index.ts`
  — the `setPrimaryKey` edit and its semantics are reused unchanged.
- `src/shared/protocol.ts` and `src/webview/openSource.ts` — the
  `model:openSource` message and its host handling are reused unchanged.
- `webview-ui/PrimaryKeySection.tsx`, `webview-ui/FieldsMatrix.tsx`,
  `webview-ui/TableNode.tsx` — no change to the table-level PK editor, the
  matrix, or the node icons.
- The `buildTableMenuItems` context-menu items in `App.tsx` — the button is an
  addition, not a replacement.
- `webview-ui/DetailsSidebar.tsx`'s `EditableField` implementation — the draft /
  commit / revert behavior stays byte-identical.

## Acceptance Criteria

- [ ] The Column section of the details sidebar shows a **Primary key**
      checkbox, checked exactly when the selected column is part of the table's
      displayed primary key.
- [ ] Checking it appends the column to the key; unchecking it removes it;
      neither reorders the other key columns.
- [ ] Checking it on a model with no primary key writes the `primary_key`
      constraint, the `not_null` check and the
      `dbt_utils.unique_combination_of_columns` test.
- [ ] The checkbox preserves the table's `virtual` flag and its current
      unique-combination-test state.
- [ ] Both the Table and the Column sections show a **Reveal in model.yml**
      button that opens the model.yml at the model declaration and at the
      column declaration respectively.
- [ ] No file outside the Files table is modified.
- [ ] `npm run verify` is green.
