---
id: 29
title: Surgical model.yml write-back that only touches edited keys
status: implemented
priority: high
created: 2026-08-31
owner: unassigned
depends_on: [06, 08]
---

# Surgical model.yml write-back that only touches edited keys

## Summary

As a dbt developer who hand-maintains `model.yml` files, I want the diagram
editor to write back **only the properties I actually changed in the diagram**,
so that my custom keys, my key order, and my comments survive untouched. The
editor is not expected to understand every dbt property â€” it must therefore
behave like a surgeon, not like a formatter.

## Background

Today the write path is a plain-object round trip: `parseModelYml` normalizes
the file into typed domain objects, and `serializeModelYml` re-stringifies the
whole file from a hardcoded key order. Three concrete defects follow:

1. **Column-level unknown keys are destroyed.** `ModelColumn` models only
   `name`, `data_type`, `description`, `tests`, `data_tests`, `meta`. A column
   carrying `custom_tag: a value` loses it the first time any edit touches the
   file â€” exactly the reported symptom.
2. **Model-level keys get reordered.** `ModelDefinition.extra` preserves unknown
   model keys, but `toDbtModel` hoists them all to the front and pins modeled
   keys to a fixed order, so editing a description reshuffles the mapping.
3. **Comments and formatting are lost** everywhere, and a single edit rewrites
   every model in the file.

The fix is to stop regenerating files. The edit pipeline
(`applyEdit` and friends) already produces a correct desired state; what is
missing is a write step that *reconciles* that desired state into the existing
YAML document, changing only the nodes that actually differ.

## Scope

**In scope**

- A new pure merge step that patches the original YAML text of a `model.yml`
  using the edited `ModelYmlFile`, preserving everything it did not change.
- Preservation of unknown keys at every level (model, column, constraint,
  config, meta), of the on-disk key order, and of comments and blank lines in
  untouched regions.
- A defined insertion order used **only when a key must be created**:
  - model level: `name`, `description`, `data_tests`, `constraints`, any other
    pre-existing keys, and finally `columns`;
  - column level: `name`, `data_type`, `description`, `config`, then any other
    keys.
- Deletion limited to a fixed allowlist of editor-managed keys, so a key the
  editor does not manage is never removed.
- Routing the extension write path through the merge step.

**Out of scope**

- Changing `parseModelYml`, the domain types, or any `applyEdit` handler.
  Parsing stays exactly as it is; loss-tolerance moves to the write side.
- Adding a `column.extra` bucket â€” unnecessary, since the merge never deletes
  unknown keys.
- Preserving comments attached to array items that the editor *reorders*
  (see Behavior notes).
- Reformatting or normalizing anything the user wrote by hand.
- Changes to the webview, the diagram, or the layout files.

## Scenarios

### A custom column key survives a description edit

```
Given a column `order_item_id` with keys name, data_type, description, custom_tag
When I change its description in the diagram
Then only the `description` value changes on disk
And `custom_tag: a value` is still present with its original value
And the key order name, data_type, description, custom_tag is unchanged
```

### Model-level keys keep their on-disk order

```
Given a model whose keys on disk are, in order, name, tags, description, columns
When I change the model description in the diagram
Then the keys on disk are still, in order, name, tags, description, columns
And `tags` is byte-identical to before
```

### Comments and untouched models are preserved

```
Given a model.yml with comments above and beside several keys
And two models in the file
When I change a column description in the first model
Then every comment in the file is still present
And the text of the second model is byte-identical to before
```

### A newly created model-level key uses the standard order

```
Given a model with keys name, description, tags, columns and no constraints
When I mark a column as a primary key so `constraints` and `data_tests` must be created
Then `data_tests` is inserted immediately after `description`
And `constraints` is inserted immediately after `data_tests`
And `tags` and `columns` keep their relative order, with `columns` last
```

### A newly created column-level key uses the standard order

```
Given a column with keys name, description, custom_tag and no data_type
When the diagram sets its data type
Then `data_type` is inserted between `name` and `description`
And `custom_tag` remains the last key
```

### Removing a primary key removes only managed keys

```
Given a model with `constraints` holding a single primary_key entry
And a model-level `tags` key
When I clear the primary key in the diagram
Then the `constraints` key is removed
And `tags` is untouched
```

### A file that cannot be patched still gets written

```
Given the on-disk text of a model.yml cannot be read or parsed as a YAML mapping
When the extension persists an edit to that file
Then the file is written using the existing full serializer
And no edit is silently dropped
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/merge/index.ts` | create | Public entry: `mergeModelYml`. Parses the original text into a `yaml` Document, reconciles the desired dbt-shaped object into it, returns the patched text. Falls back to `serializeModelYml` when the document is unusable. |
| `src/dbt/merge/shape.ts` | create | Converts a `ModelYmlFile` into the desired plain dbt-shaped object (snake_case), reusing the same mapping rules as `serialize.ts` but exported for the merge. |
| `src/dbt/merge/reconcile.ts` | create | The recursive node reconciler: merge maps, merge sequences positionally, mutate scalars in place, apply the deletion allowlist. |
| `src/dbt/merge/order.ts` | create | Key-insertion ordering: `insertKey` plus the model/column standard orders. |
| `src/dbt/serialize.ts` | modify | Export the shape helpers used by `merge/shape.ts` (or delegate to it) so the two representations cannot drift. No behavior change to `serializeModelYml`. |
| `src/vscode/project.ts` | modify | `writeModelYmlFile` reads the current on-disk text and writes `mergeModelYml(text, file)`; falls back to `serializeModelYml(file)` when the read fails. |
| `test/unit/dbt/merge/reconcile.test.ts` | create | Preservation of unknown keys, order, comments, scalars, deletions. |
| `test/unit/dbt/merge/order.test.ts` | create | Insertion positions for newly created model/column keys. |
| `specs/ARCHITECTURE.md` | modify | Add the four `src/dbt/merge/` rows; note the new write path on `src/vscode/project.ts`. |

### Signatures

```ts
// src/dbt/merge/index.ts  (pure â€” must not import `vscode`)
export function mergeModelYml(originalText: string, file: ModelYmlFile): string;

// src/dbt/merge/shape.ts  (pure)
export function toDbtShape(file: ModelYmlFile): Record<string, unknown>;

// src/dbt/merge/reconcile.ts  (pure)
/** Reconciles `desired` into the YAML node `node` in place. */
export function reconcileNode(node: unknown, desired: unknown, policy: MergePolicy): void;

export interface MergePolicy {
  /** Keys this level is allowed to delete when absent from `desired`. */
  deletable: ReadonlySet<string> | 'all';
  /** Ordering used when a key must be created at this level. */
  order: KeyOrder;
  /** Policy for a child value, by key (maps) or by index (sequences). */
  child(key: string | number): MergePolicy;
}

// src/dbt/merge/order.ts  (pure)
export interface KeyOrder {
  /** Keys in their canonical relative order. */
  readonly preferred: readonly string[];
  /** Keys pinned to the end of the mapping. */
  readonly last: readonly string[];
}

export const MODEL_KEY_ORDER: KeyOrder;
export const COLUMN_KEY_ORDER: KeyOrder;
export const FREE_KEY_ORDER: KeyOrder;

/** Index at which `key` should be inserted into a mapping with `existing` keys. */
export function insertionIndex(existing: readonly string[], key: string, order: KeyOrder): number;
```

```ts
// src/vscode/project.ts  (vscode-facing)
export async function writeModelYmlFile(uri: vscode.Uri, file: ModelYmlFile): Promise<void>;
```

### Behavior notes

**Document handling.** `mergeModelYml` uses `parseDocument` from `yaml`. If the
document has parse errors, or its `contents` is not a map, it returns
`serializeModelYml(file)` unchanged â€” this is the fallback scenario. Output is
`String(doc)`. If `originalText` contains `\r\n`, every `\n` in the output is
converted back to `\r\n`; otherwise output uses `\n`.

**Reconcile rules, applied at every mapping:**

1. For each key in `desired`: if absent in the node, insert it at
   `insertionIndex(...)`; if present and deep-equal to the desired value, leave
   the node completely untouched (this is what preserves comments and
   formatting); otherwise recurse.
2. For each key present in the node but absent from `desired`: delete it **only
   if** it is in `policy.deletable`; otherwise leave it. This is the rule that
   makes unknown keys safe.

**Deletion allowlists.**

- root mapping: `deletable` is the empty set â€” nothing at the root is removed.
- model mapping: `{ description, data_tests, constraints, config, columns, meta }`.
- column mapping: `{ data_type, description, tests, data_tests, meta }`.
- every deeper level (inside `config`, `meta`, a constraint entry, a data test
  entry, any sequence item): `'all'`, because `parseModelYml` preserves those
  sub-trees verbatim, so absence from `desired` is a genuine removal.

**Ordering.** `insertionIndex` places `key` as follows:

- if `key` is in `order.last` â†’ at the end of the mapping;
- else if `key` is in `order.preferred` â†’ immediately after the last existing
  key that precedes it in `preferred`; if there is none, immediately before the
  first existing key that follows it in `preferred`; if there is none either,
  before the first existing key from `order.last`, else at the end;
- else (unknown key) â†’ before the first existing key from `order.last`, else at
  the end.

Concrete orders:

- `MODEL_KEY_ORDER = { preferred: ['name', 'description', 'data_tests', 'constraints'], last: ['columns'] }`
- `COLUMN_KEY_ORDER = { preferred: ['name', 'data_type', 'description', 'config'], last: [] }`
- `FREE_KEY_ORDER = { preferred: [], last: [] }` â€” used everywhere else; new
  keys are appended.

Existing keys are **never** reordered, under any circumstance.

**Scalars.** When both the existing node and the desired value are scalars and
the values differ, mutate the existing `Scalar.value` in place so its comment
and, where still representable, its quoting/block style survive. If the new
value contains a newline and the node style is plain or single/double quoted,
clear the style so `yaml` picks a valid representation. When the kinds differ
(scalar vs map vs sequence), replace the value node outright.

**Sequences** are matched positionally: index *i* of the node against index *i*
of `desired`. Items beyond the desired length are removed; items beyond the
node length are appended. Consequence, accepted deliberately: an operation that
*shifts* items (e.g. removing the first of three FK constraints) rewrites the
shifted items' values and therefore does not preserve comments attached to
them. Models and columns are never reordered by any edit, so their comments are
always safe.

**Write path.** `writeModelYmlFile` calls `readFileText(uri)` inside a
`try`/`catch`; on success it writes `mergeModelYml(text, file)`, on failure
(file missing/unreadable) it writes `serializeModelYml(file)`. Reading fresh
from disk rather than from the in-memory store keeps the patch based on the
true current text.

**Deep equality** treats `undefined` and a missing key as identical, compares
plain objects key-by-key ignoring key order, and arrays index-by-index.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/merge/reconcile.test.ts` | `preserves unknown column keys when a description changes` | YAML column `name/data_type/description/custom_tag`, file with description `bye` | output contains `custom_tag: a value`, key order `name, data_type, description, custom_tag`, `description: bye` |
| `test/unit/dbt/merge/reconcile.test.ts` | `keeps on-disk model key order` | model keys `name, tags, description, columns`; description edited | key order in output is exactly `name, tags, description, columns` |
| `test/unit/dbt/merge/reconcile.test.ts` | `preserves comments and untouched models` | 2-model file with `# lead` and trailing comments; edit in model 1 | every comment string still present; the substring of model 2 is byte-identical |
| `test/unit/dbt/merge/reconcile.test.ts` | `removes only managed keys` | model with `constraints` + `tags`; desired drops `constraints` | `constraints:` absent, `tags:` present |
| `test/unit/dbt/merge/reconcile.test.ts` | `never removes an unmanaged model key absent from desired` | model with `unknown_thing`; desired has no such key | `unknown_thing` present |
| `test/unit/dbt/merge/reconcile.test.ts` | `returns byte-identical text for a no-op merge` | any file, desired equals parsed file | output `===` input |
| `test/unit/dbt/merge/reconcile.test.ts` | `preserves CRLF line endings` | CRLF input, description edited | output contains `\r\n` and no bare `\n` |
| `test/unit/dbt/merge/reconcile.test.ts` | `falls back to the serializer for unparseable text` | `': ['` | output equals `serializeModelYml(file)` |
| `test/unit/dbt/merge/order.test.ts` | `inserts data_tests after description` | existing `['name','description','tags','columns']`, key `data_tests` | index `2` |
| `test/unit/dbt/merge/order.test.ts` | `inserts constraints after data_tests` | existing `['name','description','data_tests','tags','columns']`, key `constraints` | index `3` |
| `test/unit/dbt/merge/order.test.ts` | `pins columns last` | existing `['name','tags']`, key `columns` | index `2` |
| `test/unit/dbt/merge/order.test.ts` | `places an unknown model key before columns` | existing `['name','columns']`, key `config` | index `1` |
| `test/unit/dbt/merge/order.test.ts` | `inserts data_type between name and description` | existing `['name','description','custom_tag']`, key `data_type` | index `1` |
| `test/unit/dbt/merge/order.test.ts` | `appends an unmanaged column key` | existing `['name','description']`, key `data_tests`, COLUMN order | index `2` |

### Verification

- `npm run verify` â€” typecheck + unit suites, must be green.
- `npm test` â€” before the commit, must be green.

### Do not touch

- `src/dbt/parse.ts`, `src/dbt/types.ts` â€” parsing and the domain model stay as
  they are; this feature is write-side only.
- Every file under `src/dbt/edit/` and `src/dbt/virtual.ts` â€” the desired state
  they produce is already correct.
- `serializeModelYml`'s output â€” it remains the fallback path and is asserted by
  existing tests.
- `src/webview/panel.ts`, `src/dbt/modelStore.ts` â€” the write path change is
  confined to `writeModelYmlFile`.

## Acceptance Criteria

- [x] Editing a column description leaves every other key of that column, and
      its key order, byte-identical.
- [x] Editing a model description leaves the model's key order unchanged and
      every unmanaged key byte-identical.
- [x] Comments and blank lines in untouched regions survive a write.
- [x] A merge whose desired state equals the parsed file returns the input text
      unchanged.
- [x] Newly created keys follow the model/column standard orders.
- [x] Only allowlisted managed keys can be deleted.
- [x] Unreadable/unparseable files still get written via `serializeModelYml`.
- [x] `npm run verify` is green.
