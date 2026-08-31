---
id: 30
title: Show a test-tube icon on columns that have a data test
status: approved
priority: medium
created: 2026-08-31
owner: unassigned
depends_on: [28]
---

# Show a test-tube icon on columns that have a data test

## Summary

As a data engineer reading the diagram, I want a small flask icon next to any
column that carries a dbt data test, so that I can see at a glance which columns
are covered by tests without opening the `model.yml` file.

## Background

Column rows today show only a primary-key icon (`KeyRound`, size 10, rendered
*before* the column name — `webview-ui/TableNode.tsx`). Per-column tests are
already parsed and preserved end to end (`ModelColumn.tests` for the legacy
`tests:` key and `ModelColumn.dataTests` for `data_tests:`), but the diagram
layer drops them: `TableNodeColumn` carries only `name`, `dataType`,
`description` and `meta`, so the webview cannot see them.

The primary-key editor *owns* `not_null` on PK columns
(`syncColumnNotNull` in `src/dbt/edit/primaryKey.ts` adds it when a column joins
the real PK and removes it when it leaves). That test is an artifact of the PK,
not a test the user authored, so it must not on its own light up the flask icon —
otherwise every PK column would carry both icons and the flask would carry no
information.

## Scope

**In scope**

- Carrying each column's data-test names from `ModelColumn` into
  `TableNodeColumn`.
- Rendering a `FlaskConical` icon, size 10, **after** the column name, for any
  column whose test list is non-empty.
- A tooltip on the icon listing the test names.
- Excluding the PK-owned `not_null` entry from the icon's trigger condition.

**Out of scope**

- Editing, adding or removing column tests from the diagram (no new `ModelEdit`).
- Model-level tests (see spec 33 for the PK unique-combination test).
- Any icon for tests in the details sidebar or the fields matrix.

## Scenarios

### A column with an authored test shows the flask

```
Given a model.yml column "email" with `data_tests: [unique]`
When the diagram is rendered
Then the "email" row shows a flask icon after the column name
And the icon's tooltip reads "Tests: unique"
```

### A column with the legacy `tests:` key shows the flask

```
Given a model.yml column "order_id" with `tests: [not_null, unique]` and no primary key
When the diagram is rendered
Then the "order_id" row shows a flask icon after the column name
And the icon's tooltip reads "Tests: not_null, unique"
```

### A mapping-form test shows its test name

```
Given a column "status" with `data_tests: [{ accepted_values: { values: [a, b] } }]`
When the diagram is rendered
Then the "status" row shows a flask icon
And the icon's tooltip reads "Tests: accepted_values"
```

### A PK column whose only test is the PK-owned not_null shows no flask

```
Given model "orders" has a real primary key on "order_id"
And column "order_id" has `data_tests: [not_null]` and nothing else
When the diagram is rendered
Then the "order_id" row shows the key icon before the name
And it shows no flask icon after the name
```

### A PK column with an additional test shows both icons

```
Given model "orders" has a real primary key on "order_id"
And column "order_id" has `data_tests: [not_null, unique]`
When the diagram is rendered
Then the "order_id" row shows the key icon before the name
And a flask icon after the name whose tooltip reads "Tests: unique"
```

### A column with no tests shows no flask

```
Given a column "amount" with no `tests` and no `data_tests`
When the diagram is rendered
Then the "amount" row shows no flask icon
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/tests.ts` | create | Pure helpers naming a `DataTestEntry` and computing a column's displayable test names, with the PK-owned `not_null` exclusion. |
| `src/diagram/graph.ts` | modify | Add `tests?: string[]` to `TableNodeColumn`; populate it in `buildDiagram` using `columnTestNames`, excluding the PK-owned `not_null` for columns in the displayed primary key. |
| `webview-ui/icons.ts` | modify | Re-export `FlaskConical` from `lucide-react` (spec 28 convention: no direct `lucide-react` imports elsewhere). |
| `webview-ui/TableNode.tsx` | modify | Render the flask icon span after the column-name cell when `column.tests` is non-empty. |
| `webview-ui/styles.css` | modify | Add `.table-node__test-icon` mirroring `.table-node__pk-icon` sizing, colored `var(--muted)`. |
| `specs/ARCHITECTURE.md` | modify | Add the `src/dbt/tests.ts` row; update the `src/diagram/graph.ts` key-exports note. |
| `test/unit/dbt/tests.test.ts` | create | Unit tests for `dataTestName` and `columnTestNames`. |
| `test/unit/diagram/graph.test.ts` | modify | Assert `TableNodeColumn.tests` is populated and PK-`not_null`-excluded. |

### Signatures

```ts
// src/dbt/tests.ts  (pure — must not import `vscode`)
import type { DataTestEntry, ModelColumn } from './types';

/**
 * The display name of a data test entry: the string itself for the bare form,
 * or the single key of the mapping form. `undefined` for an unusable entry
 * (an empty mapping, or a mapping whose first key is the empty string).
 */
export function dataTestName(entry: DataTestEntry): string | undefined;

/**
 * Every test name declared on a column, `tests` first then `dataTests`, in
 * declaration order, duplicates collapsed (first wins).
 * When `isPrimaryKeyColumn` is true, a single `not_null` entry is dropped
 * because the PK editor owns it (`syncColumnNotNull`).
 */
export function columnTestNames(column: ModelColumn, isPrimaryKeyColumn: boolean): string[];
```

```ts
// src/diagram/graph.ts  (pure)
export interface TableNodeColumn {
  name: string;
  dataType?: string;
  description?: string;
  meta?: Record<string, unknown>;
  /** Display names of this column's data tests (spec 30); omitted when empty. */
  tests?: string[];
}
```

### Behavior notes

1. `dataTestName` for a mapping entry takes `Object.keys(entry)[0]`. Entries with
   zero keys yield `undefined` and are skipped by `columnTestNames`.
2. Ordering in `columnTestNames`: all names from `column.tests` (legacy key) in
   order, then all names from `column.dataTests` in order. De-duplication keeps
   the first occurrence, so `tests: [unique]` + `data_tests: [unique]` yields
   `['unique']`.
3. The `not_null` exclusion drops **only the first** `not_null` name, and only
   when `isPrimaryKeyColumn` is true. `data_tests: [not_null, not_null]` on a PK
   column therefore yields `['not_null']` — the second entry is user-authored
   noise, not a PK artifact, and the icon appears. This keeps the rule a single
   removal rather than a filter, matching `syncColumnNotNull`, which adds exactly
   one entry.
4. The exclusion uses the **displayed** primary key
   (`TableNode.primaryKey.columns`), i.e. virtual-first, matching how
   `TableNode.tsx` decides to draw the key icon. A *virtual* PK never writes
   `not_null`, so a virtual-PK column carrying `not_null` had it authored by the
   user; this is accepted collateral of using the displayed PK and is documented
   here deliberately rather than adding a second code path.
5. `buildDiagram` omits the `tests` key entirely when the computed list is
   empty, so existing snapshot-shaped assertions on columns without tests stay
   valid.
6. Icon rendering in `TableNode.tsx`: a `<span className="table-node__test-icon"
   title={`Tests: ${column.tests.join(', ')}`}><FlaskConical size={10} /></span>`
   placed **immediately after** the name cell (`span.table-node__column-name` /
   `InlineEditField`) and before the type cell. The row is a flex container with
   `gap: 8px`; the span uses `flex-shrink: 0` like `.table-node__pk-icon`.
7. Tooltip text is exactly `Tests: ` followed by the names joined with `, `.
   The row's own `title={column.description}` is left untouched; the icon's
   `title` wins while the pointer is over the icon.
8. The icon is decorative and must not intercept clicks: it carries no
   `onClick`, so the row's existing click handler (column selection / FK
   gesture) still fires.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/tests.test.ts` | `names a bare string entry` | `dataTestName('unique')` | `'unique'` |
| `test/unit/dbt/tests.test.ts` | `names a mapping entry by its first key` | `dataTestName({ accepted_values: { values: ['a'] } })` | `'accepted_values'` |
| `test/unit/dbt/tests.test.ts` | `returns undefined for an empty mapping` | `dataTestName({})` | `undefined` |
| `test/unit/dbt/tests.test.ts` | `concatenates legacy tests then data_tests` | `columnTestNames({ name: 'c', tests: ['not_null'], dataTests: ['unique'] }, false)` | `['not_null', 'unique']` |
| `test/unit/dbt/tests.test.ts` | `collapses duplicates keeping the first` | `columnTestNames({ name: 'c', tests: ['unique'], dataTests: ['unique'] }, false)` | `['unique']` |
| `test/unit/dbt/tests.test.ts` | `drops the PK-owned not_null` | `columnTestNames({ name: 'c', dataTests: ['not_null'] }, true)` | `[]` |
| `test/unit/dbt/tests.test.ts` | `keeps other tests on a PK column` | `columnTestNames({ name: 'c', dataTests: ['not_null', 'unique'] }, true)` | `['unique']` |
| `test/unit/dbt/tests.test.ts` | `keeps a second not_null on a PK column` | `columnTestNames({ name: 'c', dataTests: ['not_null', 'not_null'] }, true)` | `['not_null']` |
| `test/unit/dbt/tests.test.ts` | `keeps not_null on a non-PK column` | `columnTestNames({ name: 'c', dataTests: ['not_null'] }, false)` | `['not_null']` |
| `test/unit/dbt/tests.test.ts` | `skips unusable entries` | `columnTestNames({ name: 'c', dataTests: [{}, 'unique'] }, false)` | `['unique']` |
| `test/unit/diagram/graph.test.ts` | `carries column test names into the node` | model with column `email`, `dataTests: ['unique']`, no PK | node column `email` has `tests: ['unique']` |
| `test/unit/diagram/graph.test.ts` | `omits tests when a column has none` | model with column `amount`, no tests | node column `amount` has `tests === undefined` |
| `test/unit/diagram/graph.test.ts` | `excludes the PK-owned not_null from the node` | model `orders`, `primary_key` constraint on `order_id`, column `order_id` `dataTests: ['not_null']` | node column `order_id` has `tests === undefined` |

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

- `src/dbt/parse.ts` and `src/dbt/merge/shape.ts`: column tests already round-trip
  losslessly; this feature is read-only and must not change the write path.
- `src/dbt/edit/primaryKey.ts`: `syncColumnNotNull` keeps sole ownership of
  `not_null`. This feature only *reads* around it.
- The PK icon markup, its `size={10}`, its `--virtual` modifier and its position
  before the column name.
- `src/diagram/flow.ts` handle-id conventions and row-index lookups: adding a
  key to `TableNodeColumn` must not change any geometry.

## Acceptance Criteria

- [ ] `TableNodeColumn` carries `tests?: string[]`, populated by `buildDiagram`.
- [ ] A column with any authored test renders `FlaskConical` at size 10 after the
      column name.
- [ ] A PK column whose only test is the PK-owned `not_null` renders no flask.
- [ ] The icon tooltip reads `Tests: <names joined by ", ">`.
- [ ] `FlaskConical` is imported from `webview-ui/icons.ts`, not `lucide-react`.
- [ ] `npm run verify` is green.
