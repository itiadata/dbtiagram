---
id: 38
title: Open a model's .sql file from the diagram and the sidebar
status: implemented
priority: high
created: 2026-09-01
owner: unassigned
depends_on: [15, 25]
---

# Open a model's .sql file from the diagram and the sidebar

## Summary

As a data engineer reading a diagram, I want a right-click action that opens the
`.sql` file implementing the model — from the table card (header or column row)
and from the left sidebar's model list — so that I can jump from "what this
table looks like" to "how it is built" without searching the file tree. When the
model has no `.sql` file, the action is still listed but greyed out, with a
tooltip saying so, rather than silently missing.

## Background

Every dbt model is a `.sql` file whose base name is the model name; the
`model.yml` next to it only describes it. Spec 15 and spec 25 already added
`Reveal in model.yml` to both the table card menu and the sidebar model rows, so
the SQL counterpart belongs on the same two menus. Not every model in a
`model.yml` has a `.sql` file (sources, seeds, snapshots, and models declared
before they are written), so the action must degrade visibly rather than
disappear — an absent menu item reads as "this build doesn't support it", a
greyed one with a tooltip reads as "this model has no SQL yet".

## Scope

**In scope**

- An `Open SQL file` item on the table card's context menu (header and column
  row) and on the left sidebar's model row menu (right-click and the `⋯`
  button).
- Discovering `<model>.sql` files in the workspace, derived from the existing
  `dbtiagram.modelFileGlob` setting.
- Opening the file, or focusing its tab where it already is, without moving the
  user's cursor in an already-open file.
- Rendering the item disabled with a tooltip when no `.sql` file was found, and
  re-checking the workspace at click time so a file created since the last scan
  is still found.

**Out of scope**

- Parsing, analysing or diagramming the SQL. The file is opened as-is.
- Creating a missing `.sql` file.
- Renaming or moving `.sql` files when a model is renamed in the diagram.
- A file-system watcher for `.sql` files. The availability set is refreshed on
  panel ready, on a full model refresh, and on a click that misses.
- Any command palette or editor-title entry point.

## Scenarios

### Open a model's SQL from the table header

```
Given the workspace contains models/marts/orders.sql
And the diagram shows the "orders" table
When the user right-clicks the "orders" header and chooses "Open SQL file"
Then models/marts/orders.sql opens in a normal editor tab, without splitting
the view
And it is not opened as a preview tab
```

### Open a model's SQL from a column row

```
Given the workspace contains models/marts/orders.sql
And the diagram shows the "orders" table with a column "customer_id"
When the user right-clicks the "customer_id" row and chooses "Open SQL file"
Then models/marts/orders.sql opens, exactly as from the header
```

### Open a model's SQL from the sidebar

```
Given the workspace contains models/marts/orders.sql
When the user right-clicks "orders" in the sidebar's Models list
And chooses "Open SQL file"
Then models/marts/orders.sql opens in an editor
```

### An already-open SQL file is focused, not reopened

```
Given models/marts/orders.sql is already open in a tab
And the caret in that tab is on line 40
When the user chooses "Open SQL file" for "orders"
Then that existing tab is focused
And no second tab for the file is created
And the caret is still on line 40
```

### No SQL file for the model

```
Given the workspace contains no file named legacy_orders.sql
And the diagram shows the "legacy_orders" table
When the user right-clicks the "legacy_orders" header
Then "Open SQL file" is listed but disabled
And its tooltip reads: No .sql file found for "legacy_orders"
```

### A SQL file created since the diagram opened

```
Given "orders" had no .sql file when the diagram opened
And the user has since created models/marts/orders.sql outside the diagram
When the user chooses "Open SQL file" for "orders"
Then the workspace is re-scanned
And models/marts/orders.sql opens
And the menu item is no longer greyed out the next time it is shown
```

### The file vanished between the scan and the click

```
Given the diagram believes "orders" has a .sql file
And models/marts/orders.sql has since been deleted
When the user chooses "Open SQL file" for "orders"
Then the diagram shows the error banner: No .sql file found for "orders"
And no editor is opened
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/sqlFiles.ts` | create | Pure derivation of the `.sql` discovery glob from the model glob, the model name of a `.sql` path, and the path index. |
| `src/shared/protocol.ts` | modify | Add the `model:sqlFiles` (host → webview) and `model:openSql` (webview → host) messages. |
| `src/webview/openSql.ts` | create | Pure orchestration of the open action against a host port: lookup, rescan-on-miss, republish, open or report. |
| `src/vscode/sqlFiles.ts` | create | VS Code wrappers: `findFiles` discovery and opening/focusing a `.sql` file. |
| `src/vscode/project.ts` | modify | Export the existing private `findOpenViewColumn` so the SQL opener reuses it. |
| `src/webview/panel.ts` | modify | Hold the model → `.sql` path map, publish it, and handle `model:openSql`. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch `model:sqlFiles` to a new `onSqlFiles` handler. |
| `webview-ui/App.tsx` | modify | `sqlModels` state, `onOpenModelSql` callback, the table menu item, and the two new `FilterSidebar` props. |
| `webview-ui/FilterSidebar.tsx` | modify | The sidebar model row's `Open SQL file` item, enabled/disabled from `sqlModels`. |
| `webview-ui/icons.ts` | modify | Re-export the `FileCode2` Lucide icon. |
| `test/unit/shared/sqlFiles.test.ts` | create | Unit tests for the pure glob/name/index helpers. |
| `test/unit/webview/openSql.test.ts` | create | Unit tests for `openModelSql` against a fake host. |
| `specs/ARCHITECTURE.md` | modify | Rows for `src/shared/sqlFiles.ts`, `src/webview/openSql.ts`, `src/vscode/sqlFiles.ts`; updates to `protocol.ts`, `project.ts`, `panel.ts`, `useHostMessages`, `FilterSidebar`, `icons.ts`. |
| `specs/README.md` | modify | Feature index row for 38. |

### Signatures

```ts
// src/shared/sqlFiles.ts  (shared — must not import `vscode`)

/** Fallback discovery glob when the model glob has no recognisable YAML tail. */
export const DEFAULT_SQL_GLOB = '**/models/**/*.sql';

/**
 * The `.sql` discovery glob implied by a model.yml glob: a trailing `.yml` or
 * `.yaml` (case-insensitive) is replaced by `.sql`, so
 * `**\/models/**\/*.yml` becomes `**\/models/**\/*.sql`. Any other shape falls
 * back to `DEFAULT_SQL_GLOB`.
 */
export function sqlGlobForModelGlob(modelGlob: string): string;

/**
 * The dbt model name a `.sql` path implements: its base name without the
 * `.sql` extension. Handles both `/` and `\` separators. Returns `null` when
 * the path does not end in `.sql` (case-insensitive) or has an empty base name.
 */
export function modelNameFromSqlPath(fsPath: string): string | null;

/**
 * Index of model name -> `.sql` fs path. Paths are consumed in order and the
 * FIRST path for a given model name wins, matching how `openModelSource`
 * resolves duplicate model names. Paths that are not `.sql` files are skipped.
 */
export function indexSqlPaths(paths: readonly string[]): Map<string, string>;
```

```ts
// src/shared/protocol.ts  (shared)

// added to MessageToWebview:
/**
 * The model names that currently have a `.sql` file in the workspace (spec
 * 38). The webview only needs existence, so the paths stay on the host.
 */
| { type: 'model:sqlFiles'; models: string[] }

// added to MessageToExtension:
/** Open (or focus) the `.sql` file implementing `model` (spec 38). */
| { type: 'model:openSql'; model: string }
```

```ts
// src/webview/openSql.ts  (pure — must not import `vscode`)

/** Everything `openModelSql` needs from the extension host. */
export interface OpenSqlHost {
  /** The currently known `.sql` path for `model`, or undefined. */
  lookup(model: string): string | undefined;
  /** Re-scans the workspace and returns the fresh model -> path index. */
  rescan(): Promise<Map<string, string>>;
  /** Opens or focuses the file; must not move the caret in an open tab. */
  open(fsPath: string): Promise<void>;
  /** Pushes the fresh availability set to the webview (`model:sqlFiles`). */
  publish(models: string[]): void;
  /** Reports a failure to the webview's error banner. */
  postError(message: string): void;
}

/**
 * Opens the `.sql` file for `model`, re-scanning the workspace once when the
 * cached index does not know it.
 */
export function openModelSql(host: OpenSqlHost, model: string): Promise<void>;
```

```ts
// src/vscode/sqlFiles.ts  (vscode-facing)

/** Discovers every `.sql` file matching `glob`, indexed by model name. */
export function findSqlFiles(glob: string): Promise<Map<string, string>>;

/**
 * Opens `uri` as a normal tab in the active editor group (no split), reusing
 * an existing tab where the file is already open. Unlike `revealInEditor`, it
 * never sets a selection, so the caret in an already-open file is left
 * exactly where the user left it.
 */
export function openSqlFile(uri: vscode.Uri): Promise<void>;
```

```ts
// src/vscode/project.ts  (vscode-facing)
/** The view column of an editor/tab already showing `uri`, or undefined. */
export function findOpenViewColumn(uri: vscode.Uri): vscode.ViewColumn | undefined;
```

```ts
// webview-ui/hooks/useHostMessages.ts  (webview)
export interface HostMessageHandlers {
  // …existing members unchanged…
  /** Model names that have a `.sql` file in the workspace (spec 38). */
  onSqlFiles: (models: string[]) => void;
}
```

```ts
// webview-ui/FilterSidebar.tsx  (webview)
interface FilterSidebarProps {
  // …existing members unchanged…
  /** Model names with a `.sql` file; drives the item's enabled state (spec 38). */
  sqlModels: ReadonlySet<string>;
  /** Opens the model's `.sql` file (spec 38). */
  onOpenModelSql: (name: string) => void;
}
```

### Behavior notes

- **Discovery glob.** `panel.ts` derives it as
  `sqlGlobForModelGlob(DiagramPanel.modelFileGlob())`, so a workspace that
  customised `dbtiagram.modelFileGlob` gets a matching SQL scan. `findSqlFiles`
  passes the same `'**/node_modules/**'` exclude `loadModelYmlFiles` uses.
- **When the index is (re)built.** `panel.ts` keeps a private
  `sqlPaths: Map<string, string>` (initially empty) and refreshes it:
  1. while handling `webview:ready`, publishing `model:sqlFiles` afterwards;
  2. at the end of `refresh()`, publishing again;
  3. from `openModelSql`'s rescan-on-miss (see below).
  There is deliberately **no** `.sql` file watcher (Out of scope).
- **`openModelSql` sequence** (scenarios 1–3, 6, 7):
  1. `host.lookup(model)` — if it returns a path, `await host.open(path)` and
     stop.
  2. Otherwise `const fresh = await host.rescan()`, then
     `host.publish([...fresh.keys()])` so a greyed item un-greys next time
     (scenario 6's last `And`).
  3. `fresh.get(model)` — if present, `await host.open(path)`.
  4. Otherwise `host.postError(\`No .sql file found for "${model}"\`)`.
  - If `host.open` rejects, catch and
    `host.postError(\`Could not open ${fsPath}\`)`.
  - The stale-cache case (scenario 7) resolves through the same path: the
    lookup hits, `open` rejects because the file is gone, and the error banner
    shows `Could not open <path>`. To make scenario 7's literal message hold,
    step 1 is instead written as: on an `open` rejection for a **cached** path,
    fall through to the rescan branch (steps 2–4), so a deleted file yields
    `No .sql file found for "orders"` and the availability set is corrected.
- **Message error text is the literal string**
  `No .sql file found for "<model>"` (double quotes around the model name) in
  both the disabled tooltip and the error banner, so the two read identically.
- **Opening.** `openSqlFile` mostly mirrors `revealInEditor`'s tab-reuse rules
  but opens into the active editor group rather than splitting beside the
  diagram —
  `viewColumn: findOpenViewColumn(uri) ?? vscode.ViewColumn.Active`,
  `preserveFocus: false`, `preview: existingColumn === undefined` — but sets no
  selection and calls no `revealRange`, so an already-open file keeps its caret
  (scenario 4). `findOpenViewColumn` is exported from `project.ts` unchanged in
  body; only its `export` keyword is added.
- **Webview availability set.** `App.tsx` holds
  `const [sqlModels, setSqlModels] = useState<Set<string>>(new Set())`, filled
  by `onSqlFiles: (models) => setSqlModels(new Set(models))`.
- **Table menu item.** Added to `buildTableMenuItems` in `App.tsx`,
  immediately **after** `Reveal in model.yml`, so the two "go to source"
  actions sit together, and therefore before spec 37's `Add related tables`
  when both features are present. Exact shape:

  ```
  label:    'Open SQL file'
  icon:     <FileCode2 size={16} />
  disabled: !sqlModels.has(model)
  title:    sqlModels.has(model) ? undefined : `No .sql file found for "${model}"`
  onSelect: () => onOpenModelSql(model)
  ```

  Because it lives in `buildTableMenuItems`, header and column right-clicks are
  identical (scenario 2), and the item always names the **table**, never the
  column.
- **Sidebar menu item.** The same object is appended to `modelMenuItems` in
  `FilterSidebar.tsx`, after `Reveal in model.yml`, so both the right-click and
  the `⋯` button offer it (scenario 3).
- **The greyed item is never clickable.** `ContextMenu` already renders
  `disabled` items with `disabled` on the button and no `onClick`, so no host
  message is sent for a model with no SQL (scenario 5).

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/sqlFiles.test.ts` | `sqlGlobForModelGlob swaps a .yml tail for .sql` | `'**/models/**/*.yml'` | `'**/models/**/*.sql'` |
| `test/unit/shared/sqlFiles.test.ts` | `sqlGlobForModelGlob swaps a .yaml tail` | `'**/models/**/*.yaml'` | `'**/models/**/*.sql'` |
| `test/unit/shared/sqlFiles.test.ts` | `sqlGlobForModelGlob is case-insensitive on the extension` | `'**/models/**/*.YML'` | `'**/models/**/*.sql'` |
| `test/unit/shared/sqlFiles.test.ts` | `sqlGlobForModelGlob falls back for an unrecognised glob` | `'**/schema_*'` | `'**/models/**/*.sql'` |
| `test/unit/shared/sqlFiles.test.ts` | `modelNameFromSqlPath reads the base name (posix)` | `'/repo/models/marts/orders.sql'` | `'orders'` |
| `test/unit/shared/sqlFiles.test.ts` | `modelNameFromSqlPath reads the base name (windows)` | `'C:\\repo\\models\\marts\\orders.sql'` | `'orders'` |
| `test/unit/shared/sqlFiles.test.ts` | `modelNameFromSqlPath rejects a non-sql path` | `'/repo/models/marts/orders.yml'` | `null` |
| `test/unit/shared/sqlFiles.test.ts` | `modelNameFromSqlPath accepts an uppercase extension` | `'/repo/models/ORDERS.SQL'` | `'ORDERS'` |
| `test/unit/shared/sqlFiles.test.ts` | `indexSqlPaths maps names to paths` | `['/a/orders.sql', '/b/customers.sql']` | `Map([['orders','/a/orders.sql'],['customers','/b/customers.sql']])` |
| `test/unit/shared/sqlFiles.test.ts` | `indexSqlPaths keeps the first path for a duplicated name` | `['/a/orders.sql', '/b/orders.sql']` | `Map([['orders','/a/orders.sql']])` |
| `test/unit/shared/sqlFiles.test.ts` | `indexSqlPaths skips non-sql paths` | `['/a/orders.yml', '/a/orders.sql']` | `Map([['orders','/a/orders.sql']])` |
| `test/unit/webview/openSql.test.ts` | `opens the cached path without rescanning` | host whose `lookup('orders')` returns `'/a/orders.sql'` | `open` called once with `'/a/orders.sql'`; `rescan` not called; `postError` not called |
| `test/unit/webview/openSql.test.ts` | `rescans on a cache miss and opens the found file` | `lookup` returns `undefined`; `rescan` resolves `Map([['orders','/a/orders.sql']])` | `open` called with `'/a/orders.sql'`; `publish` called with `['orders']` |
| `test/unit/webview/openSql.test.ts` | `reports a missing file after the rescan` | `lookup` returns `undefined`; `rescan` resolves `new Map()` | `open` not called; `publish` called with `[]`; `postError` called with `No .sql file found for "orders"` |
| `test/unit/webview/openSql.test.ts` | `a deleted cached file falls back to the rescan and reports` | `lookup` returns `'/a/orders.sql'`; the first `open` rejects; `rescan` resolves `new Map()` | `publish` called with `[]`; `postError` called with `No .sql file found for "orders"` |
| `test/unit/webview/openSql.test.ts` | `a deleted cached file that moved is opened at its new path` | `lookup` returns `'/a/orders.sql'`; the first `open` rejects; `rescan` resolves `Map([['orders','/b/orders.sql']])` | `open` called a second time with `'/b/orders.sql'`; `postError` not called |

Scenario mapping: 1/2/3 → `opens the cached path without rescanning` (the menu
wiring itself is Manual Verify); 4 → covered by `openSqlFile`'s reuse rules,
verified manually (no Electron-free test can assert caret position); 5 → the
disabled-item wiring, Manual Verify plus the shared literal tooltip string;
6 → `rescans on a cache miss and opens the found file`; 7 → `a deleted cached
file falls back to the rescan and reports`.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

- `src/webview/openSource.ts` and `revealInEditor` — spec 15/25's
  "Reveal in model.yml" behavior, including its selection handling, must remain
  byte-identical. The new opener is a separate function precisely so that path
  is untouched.
- `src/dbt/**` — `.sql` files are never parsed, and no model.yml is written.
- `src/vscode/project.ts`'s `loadModelYmlFiles` / `writeModelYmlFile` /
  `readFileText` — the only change to this file is adding `export` to
  `findOpenViewColumn`.
- `package.json` settings — no new configuration key is introduced; the SQL
  glob is derived from `dbtiagram.modelFileGlob`.

## Acceptance Criteria

- [ ] `Open SQL file` appears on the table card's context menu from both the
      header and a column row, and on the sidebar model row's menu.
- [ ] Choosing it opens the model's `.sql` file as a normal tab, without
      splitting the view.
- [ ] An already-open `.sql` file is focused rather than reopened, and its
      caret position is preserved.
- [ ] With no `.sql` file, the item is shown disabled with the tooltip
      `No .sql file found for "<model>"`.
- [ ] A `.sql` file created after the diagram opened is found on the next click,
      and the item stops being greyed out afterwards.
- [ ] A `.sql` file deleted after the last scan produces the error banner
      `No .sql file found for "<model>"` and opens no editor.
- [ ] `npm run verify` is green.
