---
id: 51
title: Rename a model across dbt project files
status: implemented
priority: high
created: 2026-09-30
owner: unassigned
depends_on: [06, 08, 29, 38, 47]
---

# Rename a model across dbt project files

## Summary

As a dbt developer, I want a model rename performed in the diagram to rename
its model SQL file and every applicable `ref()` in the workspace, as well as
the model and FK references already maintained in model YAML, so that the dbt
project remains consistent. The whole rename is compensating-transactional: a
preflight conflict rejects it without writes, and a later failure restores all
files and paths that were changed.

## Background

Spec 06 renames the YAML model and FK `to` values, while spec 38 explicitly left
SQL renaming out of scope. A dbt model's identity also appears in its `.sql`
filename and in Jinja `ref()` calls in models, macros, tests and snapshots.

## Scope

**In scope**

- Find the renamed model's dbt project by walking from its declaring model YAML
  toward the workspace-folder root to the nearest `dbt_project.yml`.
- Read the project's `name` and dbt code paths. Defaults are `models`, `macros`,
  `tests`, and `snapshots` when their corresponding path keys are absent.
- Rename the unique `<oldName>.sql` model file below that project's model paths
  to `<newName>.sql`, preserving its directory.
- Permit a YAML-only rename when no matching model SQL exists.
- Rewrite one-argument `ref('oldName')` only in YAML/SQL files belonging to the
  renamed model's project.
- Rewrite two-argument `ref('projectName', 'oldName')` in every dbt project in
  every open workspace folder; never rewrite another package's qualified ref.
- Reject the rename when more than one open dbt project has the target
  project's `name`, because qualified refs cannot then be attributed safely.
- Scan `.sql` files under configured model, macro, test and snapshot paths.
- Ignore apparent refs in SQL comments, Jinja comments and non-Jinja SQL string
  literals. Preserve all text other than the model-name argument.
- Reject an ambiguous source SQL file or an existing destination path before
  writing anything.
- Roll back YAML text, SQL text and the SQL path on any failure.
- Record the successful operation as one undo/redo action, including SQL text
  changes and the SQL file rename.
- Add fixture model, macro, test and snapshot refs for manual verification.

**Out of scope**

- Renaming columns, sources, seeds, snapshots or dbt project/package names.
- Rewriting `source()`, dynamic/non-literal `ref()` arguments, Python files,
  packages outside open workspace folders, or files outside configured paths.
- Rewriting refs in `dbt_project.yml`, including hook/config strings.
- Creating a missing SQL model file.
- Guaranteeing atomic filesystem semantics; rollback is compensating and an
  incomplete rollback is reported explicitly.

## Scenarios

### Rename the model file and project-local refs

```
Given project "sample" declares model "orders" and has one models/marts/orders.sql
And model, macro, test and snapshot SQL files contain ref('orders')
When the user renames "orders" to "sales_orders" in the diagram
Then the YAML model name and its applicable FK refs become "sales_orders"
And models/marts/orders.sql becomes models/marts/sales_orders.sql
And each project-local ref becomes ref('sales_orders')
```

### Rewrite matching qualified refs across workspace folders

```
Given another workspace dbt project contains ref('sample', 'orders')
And it also contains ref('another_package', 'orders') and ref('orders')
When project "sample" model "orders" is renamed to "sales_orders"
Then ref('sample', 'orders') becomes ref('sample', 'sales_orders')
And the other two refs remain byte-identical
```

### Ignore comments and SQL strings

```
Given a scanned SQL file contains a Jinja ref('orders')
And SQL comments, a Jinja comment and SQL string literals also spell ref('orders')
When "orders" is renamed
Then only the executable Jinja ref argument is changed
```

### Rename a YAML-only model

```
Given model "legacy_orders" has no matching SQL file
When it is renamed to "archived_orders"
Then its YAML and applicable refs are renamed successfully
And no SQL file is created
```

### Reject ambiguous or colliding SQL paths

```
Given two configured model paths contain files named orders.sql
When the user tries to rename model "orders"
Then the operation is rejected with "Cannot rename model \"orders\": multiple model SQL files were found"
And no file content or path changes
```

```
Given the unique orders.sql exists
And sales_orders.sql already exists beside it
When the user tries to rename "orders" to "sales_orders"
Then the operation is rejected with "Cannot rename model \"orders\": sales_orders.sql already exists"
And no file content or path changes
```

### Reject a model outside a dbt project

```
Given the model YAML has no ancestor dbt_project.yml inside its workspace folder
When the user tries to rename its model
Then the operation is rejected with "Cannot rename model: no dbt_project.yml contains <path>"
And no file changes
```

### Reject an ambiguous dbt project name

```
Given two open dbt projects are named "sample"
When the user tries to rename a model belonging to either project
Then the operation is rejected with "Cannot rename model: multiple open dbt projects are named \"sample\""
And no file changes
```

### Roll back a failed rename

```
Given preflight succeeds
And writing a later SQL ref update fails
When the rename transaction runs
Then every earlier YAML and SQL write is restored byte-for-byte
And a renamed SQL path is restored to its old path
And the diagram reports the original failure
```

### Report an incomplete rollback

```
Given a rename write fails
And restoring at least one prior change also fails
When rollback completes
Then the diagram reports "Model rename failed and rollback was incomplete: <details>"
And the panel reloads its model and SQL state from disk
```

### Refuse divergent undo or redo

```
Given a successful model rename is present in history
And one affected file no longer matches the exact recorded state
When the user undoes or redoes the rename
Then the operation is rejected with "Cannot restore model rename: <path> no longer matches the recorded state"
And the panel reloads its model and SQL state from disk
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/sqlRefs.ts` | create | Pure lexer/parser that discovers and surgically rewrites literal Jinja `ref()` calls while excluding comments and SQL strings. |
| `src/dbt/projectConfig.ts` | create | Pure decoding of the dbt project name and configured/default model, macro, test and snapshot paths. |
| `src/dbt/modelRename.ts` | create | Pure preflight and mutation plan for project-aware YAML and SQL renames. |
| `src/dbt/edit/model.ts` | modify | Delegate YAML FK ref rewriting to the package-aware rename policy without changing non-rename edits. |
| `src/dbt/edit/index.ts` | modify | Accept the explicit rename scope used by the workspace rename planner. |
| `src/dbt/edit/internal.ts` | modify | Declare the rename-scope type shared by the dispatcher and model handler. |
| `src/vscode/dbtProjects.ts` | create | Discover nearest/all workspace dbt projects and enumerate configured SQL files without leaving workspace folders. |
| `src/vscode/modelRename.ts` | create | VS Code filesystem adapter for transactional rename operations. |
| `src/vscode/project.ts` | modify | Add raw UTF-8 write and existence helpers used by the transaction. |
| `src/webview/modelRename.ts` | create | Execute and reverse planned renames with preflighted current-state checks and compensating rollback behind a testable host port. |
| `src/webview/panel.ts` | modify | Route `setModelName` through the transactional rename and record/replay its workspace history entry. |
| `src/webview/history.ts` | modify | Add one atomic workspace-rename history entry containing exact before/after texts and old/new SQL paths. |
| `src/shared/history.ts` | modify | Expose the safe history projection and label for a model rename transaction. |
| `test/unit/dbt/sqlRefs.test.ts` | create | Lexer and surgical rewrite tests. |
| `test/unit/dbt/projectConfig.test.ts` | create | Project config defaults and configured paths. |
| `test/unit/dbt/modelRename.test.ts` | create | Cross-project YAML/SQL planning and preflight tests. |
| `test/unit/webview/modelRename.test.ts` | create | Transaction success, rollback and incomplete rollback tests against a fake host. |
| `test/unit/webview/history.test.ts` | modify | Atomic model-rename undo/redo projection and cursor tests. |
| `test/unit/dbt/edit/model.test.ts` | modify | Project-qualified FK rename expectations. |
| `test/integration/suite/extension.test.ts` | modify | Filesystem integration coverage for SQL rename and rollback-safe conflict rejection. |
| `fixtures/sample-dbt/models/customers.sql` | create | Fixture model with an unqualified ref to the renamed model. |
| `fixtures/sample-dbt/models/orders.sql` | create | SQL file that must follow an `orders` rename. |
| `fixtures/sample-dbt/models/order_items.sql` | create | Additional downstream fixture ref. |
| `fixtures/sample-dbt/models/products.sql` | create | Independent fixture model SQL. |
| `fixtures/sample-dbt/macros/orders_helper.sql` | create | Macro ref fixture plus ignored comment/string examples. |
| `fixtures/sample-dbt/tests/orders_positive.sql` | create | Singular-test ref fixture. |
| `fixtures/sample-dbt/snapshots/orders_snapshot.sql` | create | Snapshot ref fixture. |
| `specs/ARCHITECTURE.md` | modify | Register new modules and changed responsibilities. |
| `specs/features/51-transactional-model-rename.md` | modify | Move lifecycle status to implemented after automatic verification. |
| `specs/README.md` | modify | Keep the feature index lifecycle status synchronized. |

### Signatures

```ts
// src/dbt/sqlRefs.ts (pure — must not import `vscode`)
export interface SqlRefOccurrence { start: number; end: number; package?: string; name: string }
export function findSqlRefs(text: string): SqlRefOccurrence[];
export function rewriteSqlRefs(
  text: string,
  shouldRename: (target: Readonly<{ package?: string; name: string }>) => boolean,
  newName: string,
): string;

// src/dbt/projectConfig.ts (pure — must not import `vscode`)
export interface DbtProjectConfig {
  name: string;
  modelPaths: string[];
  macroPaths: string[];
  testPaths: string[];
  snapshotPaths: string[];
}
export function parseDbtProjectConfig(text: string): DbtProjectConfig;

// src/dbt/edit/internal.ts (pure — must not import `vscode`)
export interface ModelRenameScope {
  targetProjectRoot: string;
  targetPackage: string;
  targetModelIndex: number;
  modelProjectRoots: readonly (string | null)[];
}

// src/dbt/edit/index.ts (pure — must not import `vscode`)
export function applyEdit(
  models: ModelDefinition[],
  edit: ModelEdit,
  renameScope?: ModelRenameScope,
): ApplyEditResult;

// src/dbt/edit/model.ts (pure — must not import `vscode`)
export function renameModel(
  models: ModelDefinition[],
  oldName: string,
  newName: string,
  scope?: ModelRenameScope,
): ApplyEditResult;

// src/dbt/modelRename.ts (pure — must not import `vscode`)
export interface RenameTextFile { path: string; before: string; after: string }
export interface ModelRenamePlan {
  textFiles: RenameTextFile[];
  sqlRename?: { from: string; to: string };
}
export interface ModelRenameInput {
  oldName: string;
  newName: string;
  targetModelFilePath: string;
  targetProjectRoot: string;
  targetPackage: string;
  modelFiles: readonly { path: string; projectRoot: string | null; text: string }[];
  sqlFiles: readonly { path: string; projectRoot: string; text: string; kind: 'model' | 'macro' | 'test' | 'snapshot' }[];
  matchingModelSqlPaths: readonly string[];
  destinationExists: boolean;
  workspaceProjects: readonly { root: string; name: string }[];
}
export function planModelRename(input: ModelRenameInput): ModelRenamePlan;
export function reverseModelRenamePlan(plan: ModelRenamePlan): ModelRenamePlan;

// src/vscode/dbtProjects.ts (vscode-facing)
export interface WorkspaceDbtProject { root: vscode.Uri; config: DbtProjectConfig }
export function findContainingDbtProject(file: vscode.Uri): Promise<WorkspaceDbtProject | null>;
export function findWorkspaceDbtProjects(): Promise<WorkspaceDbtProject[]>;
export function findProjectSqlFiles(project: WorkspaceDbtProject): Promise<Map<string, 'model' | 'macro' | 'test' | 'snapshot'>>;

// src/vscode/project.ts (vscode-facing)
export function writeFileText(uri: vscode.Uri, text: string): Promise<void>;
export function fileExists(uri: vscode.Uri): Promise<boolean>;

// src/vscode/modelRename.ts (vscode-facing)
export const vscodeModelRenameFiles: ModelRenameFileHost;

// src/webview/modelRename.ts (pure orchestration — must not import `vscode`)
export interface ModelRenameFileHost {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
}
export function executeModelRename(host: ModelRenameFileHost, plan: ModelRenamePlan): Promise<void>;

// src/webview/history.ts (pure orchestration — must not import `vscode`)
export type NewUndoEntry =
  | { label: string; domain: 'modelYaml'; files: ModelFileDelta[] }
  | { label: string; domain: 'sourceYaml'; files: SourceFileDelta[] }
  | { label: string; domain: 'layout'; before: DiagramLayout; after: DiagramLayout }
  | { label: string; domain: 'modelRename'; plan: ModelRenamePlan };

// src/shared/history.ts (shared — must not import `vscode`)
export type HistoryDomain = 'yaml' | 'layout';
export function describeModelRename(oldName: string, newName: string): string;
```

### Behavior notes

- Paths are normalized for comparison, but original filesystem casing is kept.
- `targetModelFilePath` is the declaring YAML file selected by the panel's
  existing first-match model lookup. Its matching flattened model index is the
  only declaration renamed, so same-named models in other projects are not
  renamed accidentally.
- Project ownership is the nearest ancestor `dbt_project.yml`; walking stops at
  the containing workspace root. No marker produces the literal rejection in
  the scenario.
- Source SQL candidates are only `<oldName>.sql` below configured model paths.
  Zero candidates is valid; two or more reject. The destination collision check
  runs only when one source candidate exists.
- A one-argument ref is rewritten iff the containing file's project root equals
  the target project root. A two-argument ref is rewritten iff its package is
  exactly the target `name`, regardless of workspace folder.
- YAML rewriting is limited to parsed model names and real/virtual FK `to`
  values. Arbitrary textual refs elsewhere in YAML are not scanned.
- If two discovered open-workspace projects have the target package name,
  planning rejects with `Cannot rename model: multiple open dbt projects are
  named "<name>"` before any write.
- `findSqlRefs` recognizes literal one/two-argument calls inside `{{ ... }}` or
  `{% ... %}` with either quote style and arbitrary whitespace. It ignores
  `--`, `/* */`, `{# #}` and SQL quoted strings outside Jinja. It does not try
  to evaluate variables or concatenation.
- Preflight completes before the first write. Changed text files are written in
  stable path order, then the SQL path is renamed. On failure, completed steps
  are reversed in reverse order using captured exact original text.
- A rollback that succeeds rethrows the original error. An incomplete rollback
  throws `Model rename failed and rollback was incomplete: ${details}` and
  forces a complete panel refresh.
- The in-memory model store and SQL path index are replaced only after success
  or a post-failure reload; intermediate state is never published.
- Undo and redo use the same preflighted transaction machinery and refuse to
  overwrite divergent current content. A mismatching or missing expected text
  file, source path, or destination-path collision rejects with `Cannot restore
  model rename: <path> no longer matches the recorded state`. One successful
  rename is one history row.
- `dbt_project.yml` is read for configuration only and is never included in ref
  rewriting.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/sqlRefs.test.ts` | `finds literal refs in Jinja expressions and statements` | `{{ ref('orders') }} {% set x = ref("sample", "orders") %}` | targets `[{name:'orders'},{package:'sample',name:'orders'}]` |
| `test/unit/dbt/sqlRefs.test.ts` | `ignores comments and SQL strings` | refs inside `--`, `/* */`, `{# #}`, `'...'`, plus one executable Jinja ref | only the executable occurrence is returned |
| `test/unit/dbt/sqlRefs.test.ts` | `rewrites only the name argument without reformatting` | `{{  ref( "sample" , 'orders' )  }}` | `{{  ref( "sample" , 'sales_orders' )  }}` |
| `test/unit/dbt/projectConfig.test.ts` | `uses dbt path defaults` | `name: sample` | model/macro/test/snapshot paths `['models']`, `['macros']`, `['tests']`, `['snapshots']` |
| `test/unit/dbt/projectConfig.test.ts` | `reads configured path arrays` | all four dbt path keys | literal configured arrays |
| `test/unit/dbt/modelRename.test.ts` | `rewrites local and matching qualified refs` | target `sample`; local one-arg, remote one-arg, matching/nonmatching qualified refs | local one-arg and `sample` qualified changed; other two unchanged |
| `test/unit/dbt/modelRename.test.ts` | `permits no model SQL` | no matching path | plan has no `sqlRename` |
| `test/unit/dbt/modelRename.test.ts` | `rejects multiple model SQL files` | two `orders.sql` paths | exact multiple-files error |
| `test/unit/dbt/modelRename.test.ts` | `rejects an existing destination` | one source and `destinationExists: true` | exact already-exists error |
| `test/unit/dbt/modelRename.test.ts` | `rejects duplicate target package names` | two workspace projects named `sample` | `Cannot rename model: multiple open dbt projects are named "sample"` |
| `test/unit/dbt/modelRename.test.ts` | `rewrites only parsed YAML identities and FK refs` | model YAML containing model/FK refs plus an unrelated textual ref | model/FK names changed; unrelated YAML scalar byte-identical |
| `test/unit/webview/modelRename.test.ts` | `writes text in path order then renames the SQL path` | successful plan and in-memory fake filesystem | operation log contains sorted writes followed by `rename:orders.sql->sales_orders.sql` |
| `test/unit/webview/modelRename.test.ts` | `rolls back every completed operation` | failure on second text write | first text restored exactly and operation rejects with original failure |
| `test/unit/webview/modelRename.test.ts` | `reports incomplete rollback` | write failure plus restore failure | exact prefix `Model rename failed and rollback was incomplete:` |
| `test/unit/webview/modelRename.test.ts` | `refuses divergent history state` | expected text differs from fake filesystem | `Cannot restore model rename: /project/models/schema.yml no longer matches the recorded state`; no writes |
| `test/unit/webview/history.test.ts` | `stores a rename as one reversible action` | successful plan with two text files and one path rename | one history item labelled `Rename model orders to sales_orders` |
| `test/integration/suite/extension.test.ts` | `executes a model rename transaction on workspace files` | temporary YAML and SQL files under the fixture workspace | source path absent, destination present, and both exact planned texts persisted; cleanup restores the workspace |

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.

### Do not touch

- Column rename semantics and non-rename edit handlers.
- SQL formatting outside the exact quoted ref argument.
- Files outside open workspace folders or configured dbt code paths.
- Source YAML and `source()` calls.

## Acceptance Criteria

- [x] A model rename updates its YAML identity, applicable FK refs, unique SQL filename and applicable SQL refs.
- [x] Local and package-qualified refs obey project boundaries across all workspace folders.
- [x] Duplicate open-workspace package names are rejected before writes.
- [x] Comments, SQL strings, dynamic refs and unrelated packages remain byte-identical.
- [x] Missing SQL succeeds; ambiguous SQL and destination collisions write nothing.
- [x] Any mid-operation failure rolls back, and incomplete rollback is explicit.
- [x] Undo/redo treats the complete rename as one action.
- [x] The sample fixture exercises models, macros, tests and snapshots.
- [x] `npm run verify` is green.
