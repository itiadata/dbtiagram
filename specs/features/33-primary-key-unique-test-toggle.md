---
id: 33
title: Opt in or out of the model-level unique-combination test for a primary key
status: implemented
priority: high
created: 2026-08-31
owner: unassigned
depends_on: [08, 27]
---

# Opt in or out of the model-level unique-combination test for a primary key

## Summary

As a data engineer, I want a checkbox that controls whether setting a primary key
also writes the model-level `dbt_utils.unique_combination_of_columns` data test,
so that I can declare a primary key on models where that test is not wanted
(unenforceable, too expensive, or already covered elsewhere) without the editor
adding it back behind my back.

## Background

Spec 08 made a *real* primary key keep three constructs in sync: the model-level
`dbt_utils.unique_combination_of_columns` data test, the `primary_key` constraint,
and `not_null` on each PK column. `setPrimaryKeyOnModel` in
`src/dbt/edit/primaryKey.ts` always writes all three; there is no way to have the
constraint and the `not_null` checks without the unique-combination test.

That third construct is the one users disagree about. The other two are cheap
metadata; the unique-combination test is an actual query that runs on every
`dbt test`. Making it opt-in per model, with the checkbox reflecting whatever the
YAML already says, keeps dbtiagram honest about the file on disk.

## Scope

**In scope**

- A `uniqueTest` flag on the `setPrimaryKey` edit.
- A "Unique combination of columns test" checkbox in the details sidebar's
  Primary key section, initialised from the model's current YAML.
- Writing the test when the box is checked, removing it entirely when unchecked.
- Surfacing the current state through `TableNode.primaryKey`.
- A small red warning badge next to the diagram's PK key icon (spec 08) on real
  primary keys whose unique-combination test is off, so the state is visible on
  the canvas, not only in the details sidebar.

**Out of scope**

- Any other model-level data test. Only
  `dbt_utils.unique_combination_of_columns` is owned by the PK editor.
- Column-level tests, including the PK-owned `not_null` (unchanged) and the
  read-only flask icon of spec 30.
- Virtual primary keys, which by definition write nothing to the model file. The
  checkbox is disabled while Virtual is checked.
- Editing the test's other options (`enabled`, extra `arguments`) from the UI.

## Scenarios

### The checkbox reflects an existing test

```
Given model "orders" has a primary key on "order_id"
And its model.yml has a `dbt_utils.unique_combination_of_columns` data test
When I select the "orders" table and look at the Primary key section
Then the "Unique combination of columns test" checkbox is checked
```

### The checkbox is unchecked when the test is absent

```
Given model "customers" has a `primary_key` constraint on "customer_id"
And its model.yml has no `dbt_utils.unique_combination_of_columns` data test
When I select the "customers" table
Then the "Unique combination of columns test" checkbox is unchecked
```

### Unchecking removes the test

```
Given the checkbox is checked for model "orders"
When I uncheck it
Then the `dbt_utils.unique_combination_of_columns` entry is removed from the model's data_tests
And the `primary_key` constraint is unchanged
And `not_null` on "order_id" is unchanged
```

### Checking writes a fresh test

```
Given model "customers" has a primary key on "customer_id" and no unique-combination test
When I check the checkbox
Then the model gains a data test
  `dbt_utils.unique_combination_of_columns: { arguments: { combination_of_columns: [customer_id] } }`
```

### Changing PK columns while the test is on updates it in place

```
Given model "orders" has a primary key on "order_id" and the checkbox is checked
And its unique-combination test entry also carries `enabled: true`
When I add "line_id" to the primary key
Then the test's `combination_of_columns` becomes [order_id, line_id]
And `enabled: true` is preserved
```

### Changing PK columns while the test is off does not resurrect it

```
Given model "customers" has a primary key on "customer_id" and the checkbox is unchecked
When I add "region" to the primary key
Then the model still has no `dbt_utils.unique_combination_of_columns` data test
```

### The checkbox is disabled for a virtual primary key

```
Given model "orders" has a virtual primary key
When I look at the Primary key section
Then the "Unique combination of columns test" checkbox is unchecked and disabled
```

### The diagram warns when the test is off

```
Given model "customers" has a real primary key on "customer_id"
And its unique-combination test is off
When I look at the "customers" table card on the canvas
Then the PK key icon on "customer_id" shows a red warning badge
  titled "Unique combination of columns test is off"
```

### The diagram does not warn when the test is on, or for a virtual PK

```
Given model "orders" has a real primary key with the unique-combination test on
And model "products" has a virtual primary key
When I look at both table cards on the canvas
Then neither PK key icon shows the red warning badge
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/edit/types.ts` | modify | Add the optional `uniqueTest` flag to the `setPrimaryKey` edit. |
| `src/dbt/edit/primaryKey.ts` | modify | Take the flag; export `hasUniqueCombinationTest`; create / update / remove the model-level entry accordingly. |
| `src/dbt/edit/index.ts` | modify | Thread `edit.uniqueTest` into `setPrimaryKeyOnModel`. |
| `src/diagram/graph.ts` | modify | Export a named `TablePrimaryKey` type carrying `uniqueTest`; populate it in `buildDiagram`. |
| `src/diagram/flow.ts` | modify | Use `TablePrimaryKey` in `FlowNodeData` instead of the inline structural type. |
| `webview-ui/PrimaryKeySection.tsx` | modify | Render the checkbox, post the flag on every `setPrimaryKey`, update the explanatory note. |
| `webview-ui/FieldsMatrix.tsx` | modify | Leave `uniqueTest` unspecified on its two `setPrimaryKey` posts (documented "preserve" semantics). |
| `webview-ui/TableNode.tsx` | modify | Render a red warning badge next to the PK key icon when the displayed PK is real and `uniqueTest` is `false`. |
| `webview-ui/icons.ts` | modify | Re-export the `TriangleAlert` Lucide icon for the warning badge. |
| `webview-ui/styles.css` | modify | Add `.table-node__pk-warning-icon` (uses the existing `--error` theme variable). |
| `specs/ARCHITECTURE.md` | modify | Update the key exports of `src/dbt/edit/primaryKey.ts` and `src/diagram/graph.ts`. |
| `test/unit/dbt/edit/primaryKey.test.ts` | modify | Cases for the flag; existing "creates the test" cases pass `uniqueTest: true`. |
| `test/unit/diagram/graph.test.ts` | modify | `TableNode.primaryKey.uniqueTest` reflects the model's YAML. |

### Signatures

```ts
// src/dbt/edit/types.ts  (pure)
export type ModelEdit =
  // …
  | {
      kind: 'setPrimaryKey';
      model: string;
      columns: string[];
      virtual: boolean;
      /**
       * Whether the model-level `dbt_utils.unique_combination_of_columns` test
       * should exist after this edit (spec 33). Omitted means "leave its
       * presence as it is": update an existing entry, never create one.
       */
      uniqueTest?: boolean;
    }
  // …
```

```ts
// src/dbt/edit/primaryKey.ts  (pure)

/** Whether the model already declares the PK unique-combination data test. */
export function hasUniqueCombinationTest(model: ModelDefinition): boolean;

export function setPrimaryKeyOnModel(
  model: ModelDefinition,
  columns: string[],
  virtual: boolean,
  uniqueTest?: boolean,
): ModelDefinition;
```

```ts
// src/diagram/graph.ts  (pure)

/** The displayed primary key of a table node. */
export interface TablePrimaryKey {
  columns: string[];
  virtual: boolean;
  /**
   * Whether the model declares the `dbt_utils.unique_combination_of_columns`
   * data test (spec 33). Always `false` for a virtual primary key.
   */
  uniqueTest: boolean;
}

export interface TableNode {
  // …
  primaryKey?: TablePrimaryKey;
  // …
}
```

```ts
// src/diagram/flow.ts  (pure)
export interface FlowNodeData {
  // …
  primaryKey?: TablePrimaryKey;
  // …
}
```

### Behavior notes

1. **Resolution of `uniqueTest` inside `setPrimaryKeyOnModel`** (real PK path only):

   | `uniqueTest` | Test currently present | Result |
   |---|---|---|
   | `true` | yes | Updated in place; the entry's other keys and the value's other `arguments` keys are preserved (today's `buildUniqueTest` behavior). |
   | `true` | no | A **fresh** entry is appended: `{ 'dbt_utils.unique_combination_of_columns': { arguments: { combination_of_columns: [...columns] } } }`. Nothing is inherited, matching the user's "replace entirely" requirement. |
   | `false` | yes | The entry is removed. `model.dataTests` becomes `undefined` when it would otherwise be empty. |
   | `false` | no | No change. |
   | omitted | yes | Updated in place (as `true`/present). |
   | omitted | no | Not created. |

2. **Empty column list wins.** When `columns` is empty there is no primary key to
   assert, so the entry is removed regardless of `uniqueTest`. This preserves
   today's "clearing the PK removes all three artifacts" behavior.
3. **Virtual ignores the flag.** The virtual branch already calls
   `removeRealPrimaryKeyArtifacts`, which removes the entry. `uniqueTest` is not
   consulted, and `buildDiagram` reports `uniqueTest: false` for a virtual PK, so
   the checkbox reads unchecked and is disabled.
4. **The early return must account for the flag.** The existing guard

   ```ts
   if (displayed === undefined && resulting === undefined) return model;
   ```

   would swallow a toggle on a model that has no PK. Extend it so it returns
   early only when the test's presence also already matches the requested state:

   ```ts
   const testSatisfied =
     uniqueTest === undefined ||
     hasUniqueCombinationTest(model) === (uniqueTest && columns.length > 0);
   if (displayed === undefined && resulting === undefined && testSatisfied) return model;
   ```

   Identity preservation elsewhere is unchanged: when nothing actually changes,
   the same `model` object is still returned, so `applyEdit`'s no-op detection and
   the surgical write-back (spec 29) behave as before.
5. **`hasUniqueCombinationTest`** reuses the existing private
   `isUniqueCombinationEntry` predicate, so both the bare-string form
   (`- dbt_utils.unique_combination_of_columns`) and the mapping form count as
   present. Checking the box on a model whose entry is the bare string upgrades it
   to the mapping form, as it does today.
6. **`not_null` and the `primary_key` constraint are untouched by this flag.**
   `syncColumnNotNull` and `syncPrimaryKeyConstraint` keep running on every real
   PK edit exactly as before, so scenario "Unchecking removes the test" leaves
   both intact.
7. **Graph population.** In `buildDiagram`, the displayed PK becomes
   `{ columns, virtual, uniqueTest: virtual ? false : hasUniqueCombinationTest(m) }`.
   `src/diagram/graph.ts` importing from `src/dbt/edit/primaryKey.ts` is within
   the rules — both are `pure`, neither imports `vscode`.
8. **UI.** The checkbox is a second `details__checkbox-row` directly beneath the
   Virtual row, labelled exactly `Unique combination of columns test`. It is
   `checked={node.primaryKey?.uniqueTest ?? false}` and
   `disabled={virtual || columns.length === 0}` — there is nothing to assert
   without PK columns, and nothing is written for a virtual PK. Toggling it posts
   `{ kind: 'setPrimaryKey', model: node.id, columns, virtual, uniqueTest: !current }`.
9. **Every `setPrimaryKey` post from `PrimaryKeySection` carries the flag**,
   including the chip add/remove and the Virtual toggle, using the checkbox's
   current value. That is what makes scenario "Changing PK columns while the test
   is off does not resurrect it" hold.
10. **`FieldsMatrix` omits the flag** on both of its posts. Under the "omitted =
    preserve presence" rule, toggling PK membership from the matrix updates an
    existing test but never introduces one. This is a deliberate change from
    today's always-create behavior and is what makes the checkbox the single place
    the test can be brought into existence.
    unique_combination_of_columns data test, the primary_key constraint, and
    not_null checks to the model file." It becomes: `Writes the primary_key
    constraint and not_null checks to the model file. The unique combination test
    is written only while the box above is checked.`
12. **Diagram warning badge (`TableNode.tsx`).** Next to the existing
    `pkColumns`/`pkVirtual` derivation, compute
    `pkUniqueTestOff = !pkVirtual && data.primaryKey !== undefined && !data.primaryKey.uniqueTest`.
    On a PK column row (`isPk` true), when `pkUniqueTestOff` is also true, render a
    second small icon right after the existing `table-node__pk-icon` span: a
    `TriangleAlert` (size 10) inside a `<span className="table-node__pk-warning-icon"
    title="Unique combination of columns test is off">`. It never renders for a
    virtual PK (`pkVirtual` true) or when the model has no PK at all
    (`data.primaryKey === undefined`) — both already imply `uniqueTest: false` from
    `buildDiagram`, but the explicit `!pkVirtual` check keeps the virtual case
    unambiguous in the component itself. `.table-node__pk-warning-icon` uses
    `color: var(--error)`, mirroring `.table-node__pk-icon`'s use of `--accent`.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/edit/primaryKey.test.ts` | `creates the test when uniqueTest is true` | model with `primary_key` on `id`, no data tests; edit `{kind:'setPrimaryKey',columns:['id'],virtual:false,uniqueTest:true}` | `dataTests` equals `[{ 'dbt_utils.unique_combination_of_columns': { arguments: { combination_of_columns: ['id'] } } }]` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `removes the test when uniqueTest is false` | model with the mapping-form test on `['id']`; edit with `columns:['id'], uniqueTest:false` | `dataTests` is `undefined`; the `primary_key` constraint still present |
| `test/unit/dbt/edit/primaryKey.test.ts` | `keeps not_null when the test is removed` | same as above, column `id` has `dataTests: ['not_null']` | column `id` still has `dataTests: ['not_null']` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `preserves sibling keys when updating an existing test` | existing entry `{ 'dbt_utils.unique_combination_of_columns': { enabled: true, arguments: { combination_of_columns: ['id'] } } }`; edit `columns:['id','line'], uniqueTest:true` | entry value keeps `enabled: true` and `arguments.combination_of_columns` is `['id','line']` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `does not create the test when uniqueTest is omitted` | model with `primary_key` on `id`, no data tests; edit without `uniqueTest` | `dataTests` is `undefined` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `updates an existing test when uniqueTest is omitted` | model with the test on `['id']`; edit `columns:['id','line']`, no `uniqueTest` | `arguments.combination_of_columns` is `['id','line']` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `removes the test when the PK is cleared even with uniqueTest true` | model with the test; edit `columns: [], uniqueTest: true` | `dataTests` is `undefined` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `a virtual PK ignores uniqueTest` | model with the test; edit `columns:['id'], virtual:true, uniqueTest:true` | `dataTests` is `undefined`; virtual meta block written |
| `test/unit/dbt/edit/primaryKey.test.ts` | `upgrades a bare-string entry` | `dataTests: ['dbt_utils.unique_combination_of_columns']`; edit `columns:['id'], uniqueTest:true` | single mapping-form entry with `combination_of_columns: ['id']` |
| `test/unit/dbt/edit/primaryKey.test.ts` | `toggling the flag on a model with no PK still applies` | model with no PK and no test; edit `columns: ['id'], uniqueTest: true` | `dataTests` contains the mapping-form entry (the early return does not swallow it) |
| `test/unit/dbt/edit/primaryKey.test.ts` | `hasUniqueCombinationTest detects both forms` | model with the bare string; model with the mapping; model with neither | `true`, `true`, `false` |
| `test/unit/diagram/graph.test.ts` | `reports uniqueTest true when the test exists` | model with a `primary_key` constraint and the mapping-form test | `node.primaryKey` equals `{ columns: ['id'], virtual: false, uniqueTest: true }` |
| `test/unit/diagram/graph.test.ts` | `reports uniqueTest false when the test is absent` | model with a `primary_key` constraint only | `node.primaryKey` equals `{ columns: ['id'], virtual: false, uniqueTest: false }` |
| `test/unit/diagram/graph.test.ts` | `reports uniqueTest false for a virtual PK` | model with a virtual PK meta block and a stray unique-combination test | `node.primaryKey.uniqueTest` is `false` |

`webview-ui/TableNode.tsx`'s warning badge is pure JSX rendering with no
extractable pure-logic seam and no existing component-test harness (no
jsdom/RTL in this repo's unit setup) — it is covered by Manual Verify below
only, matching how the existing `table-node__pk-icon` and
`table-node__test-icon` (spec 30) are verified.

Existing cases in `test/unit/dbt/edit/primaryKey.test.ts` that assert the
unique-combination test is *created* for a model that did not have one must add
`uniqueTest: true` to their edit object; cases where the model already has the
test need no change.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.
- Manual: on `fixtures/sample-dbt/models/orders.yml` (which already has the test)
  confirm the box is checked; uncheck it and confirm only the `data_tests` entry
  disappears from the file; re-check it and confirm a fresh entry is written.
- Manual: with the test unchecked, confirm the "orders" table card shows a red
  warning badge next to the `order_id` key icon; re-check the box and confirm
  the badge disappears. Confirm "products" (virtual PK, spec 08 fixture) never
  shows the badge.

### Do not touch

- `syncColumnNotNull` and `syncPrimaryKeyConstraint` — `not_null` and the
  `primary_key` constraint keep their current unconditional behavior.
- `src/dbt/parse.ts`, `src/dbt/merge/**`, `src/dbt/serialize.ts` — the on-disk
  shape of `data_tests` is unchanged; this feature only decides whether one entry
  exists.
- `src/shared/protocol.ts` — the flag rides inside the existing
  `diagram:edit` / `ModelEdit` payload.
- The `virtual` semantics of spec 08, including the virtual meta block and the
  virtual-first PK resolution in `buildDiagram`.

## Acceptance Criteria

- [ ] The Primary key section shows a "Unique combination of columns test"
      checkbox reflecting the model's YAML.
- [ ] Unchecking it removes the model-level test and leaves the `primary_key`
      constraint and `not_null` checks intact.
- [ ] Checking it writes a fresh mapping-form test for the current PK columns.
- [ ] Changing PK columns while it is unchecked never re-creates the test.
- [ ] The checkbox is unchecked and disabled for a virtual primary key and when
      there are no PK columns.
- [ ] A real primary key with the test off shows a red warning badge next to
      its key icon on the diagram canvas; the badge disappears once the test is
      on, and never appears for a virtual primary key.
- [ ] `npm run verify` is green.
