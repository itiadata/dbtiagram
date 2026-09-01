---
id: 04
title: Live model.yml edits reflected without losing layout
status: done
priority: high
created: 2026-07-31
owner: unassigned
depends_on: [03]
---

# Live model.yml edits reflected without losing layout

## Summary

As a dbt developer, I want to edit a `model.yml` file in the VS Code editor and
see every change reflected in the open diagram **as I type** — without the
diagram resetting the dagre arrangement, snapping dragged tables back to their
default positions, or resetting the viewport. Every diagram update after the
first must be incremental: existing tables keep exactly where the user left
them, only genuinely new tables receive an automatic position, and the view
only auto-fits when the set of tables actually grows or the user runs
Auto-layout.

## Background

Today the diagram only learns about file edits when a text document is **saved**:
`src/extension.ts` listens to `onDidSaveTextDocument` and calls
`DiagramPanel.refresh()`, which re-scans the whole workspace, re-parses every
file, re-runs the dagre layout, and republishes a full `diagram:update`. In the
webview (`webview-ui/App.tsx`), every `diagram:update` recomputes
`layoutDiagram` and blindly adopts the fresh node positions
(`setRfNodes(nodes)`), so any table the user has dragged snaps back to its
dagre slot. The same happens after every webview edit (e.g. Add column). The
viewport is also re-fitted on every update, resetting pan/zoom.

Spec 03 explicitly accepted "manual positions are not persisted" and re-ran the
dagre arrangement after every update; this spec **supersedes those parts of
spec 03**. The dagre engine, the node/handle geometry, the hover semantics, and
the Add-column form are all unchanged. Parsing/serialization (`src/dbt/*`),
graph derivation (`src/diagram/graph.ts`), `src/diagram/flow.ts`, and the
protocol message shapes are preserved except for one additive change
(`diagram:update` gains a `pendingErrors` array).

## Scope

- **Live workspace watching.** A new isolated wrapper (`src/vscode/modelWatcher.ts`)
  listens for `onDidChangeTextDocument` (as-you-type, no save required),
  `onDidSaveTextDocument`, `onDidCreateFiles`, `onDidDeleteFiles`,
  `onDidRenameFiles`, and `onDidChangeConfiguration` events, filtered to files
  matching the `dbtiagram.modelFileGlob` pattern, and dispatches them to the
  panel. The old blanket `onDidSaveTextDocument -> refresh()` listener in
  `src/extension.ts` is removed.
- **A pure model store** (`src/dbt/modelStore.ts`): the panel's in-memory record
  set moves into a pure, unit-tested store that keeps the **last good** parse
  for every file and tracks files whose most recent parse failed
  (`pendingErrors`). `src/webview/panel.ts` becomes a thin shell over the store.
- **Glob matching** (`src/shared/glob.ts`): a small pure matcher for the subset
  of VS Code glob syntax used by `modelFileGlob` (`*`, `?`, `**`, `{a,b}`,
  `[abc]`/`[a-z]`), so workspace events can be filtered without a new runtime
  dependency.
- **Position preservation in the webview.** A pure `src/diagram/positions.ts`
  module provides `mergeFlowNodes` (keep existing node positions, place only
  new nodes) and `avoidOverlap` (nudge a new node below its dagre slot if it
  would overlap an existing table). `webview-ui/App.tsx` adopts merged nodes
  instead of raw layout nodes; Auto-layout still resets everything to the fresh
  dagre arrangement.
- **Refit policy.** The webview auto-fits the view only on first render, when
  the node-id set grows, or after Auto-layout — never on ordinary live edits —
  so pan/zoom survives typing.
- **Parse-failure status.** `diagram:update` carries `pendingErrors`
  (`{ uri, message }[]`); the webview renders a persistent, non-modal banner.
  This replaces the previous modal `showWarningMessage` calls for model-file
  parse failures.
- The `dbtiagram.watchModelFiles` setting (currently declared but unused) now
  actually gates live watching: when `false`, workspace events are ignored and
  the diagram updates only via webview edits and on (re)open.

### Out of scope

- Persisting positions across VS Code sessions (still not persisted; reopening
  the panel re-runs dagre).
- Undo/redo of live edits; the editor owns text history.
- ELK/elkjs or other layout engines; a dagre swap remains a follow-up.
- Fan-out/overlap handling for FK edges (unchanged from spec 03).
- Live updates for files that fail to parse: their **last good** content stays
  on the diagram until the file parses again (no partial/corrupt graph).
- Diffing the YAML to send only changed nodes: the full graph is recomputed and
  republished on every change; the webview's merge step is what makes updates
  feel incremental. Optimization is a follow-up if needed.

## Implementation Notes

### 1. Pure glob matcher (`src/shared/glob.ts`)

`matchesGlob(inputPath: string, glob: string): boolean` compiles the glob to a
single regex and tests the path. Path separators are normalized to `/` first
(`uri.fsPath` on Windows yields `\`). Supported syntax, exactly:

- `*` — any run of non-`/` characters.
- `?` — exactly one non-`/` character.
- `**` — any characters including `/`; `**/` additionally matches **zero**
  path segments (`**/models/**/*.yml` matches `models/orders.yml`).
- `{a,b}` — alternation of comma-separated literals.
- `[abc]`, `[a-z]` — character classes; leading `!` negates.
- Everything else matches literally (regex specials are escaped; `\x` escapes
  a literal `x`).

The default pattern `**/models/**/*.yml` is the primary tested case. No `!`
negation at the glob level (the exclude is passed separately to `findFiles`).

### 2. Pure model store (`src/dbt/modelStore.ts`)

```
ModelFileRecord = { uri: string /* fsPath */; file: ModelYmlFile }
ModelStore     = { records: ModelFileRecord[]; pendingErrors: Map<string, string> }
```

Pure functions (all return new stores, never mutate the input):

- `createModelStore(records?)` — empty or seeded store.
- `upsertRecord(store, uri, file)` — replace/add a record and clear its pending
  error, preserving array order.
- `applyTextChange(store, uri, content)` — `parseModelYml(content, uri)`;
  success upserts and clears the pending error; failure keeps the **last good**
  record for that uri (if any) and records the error message.
- `applyFileDeleted(store, uri)` — drop the record and its pending error.
- `applyFileRenamed(store, oldUri, newUri, content)` — delete the old record,
  then `applyTextChange` for the new uri/content.
- `replaceModelStore(store, loaded, failed)` — full rescan merge: every
  successfully loaded file replaces its record; every failed file keeps its
  previous record (last-good retention) and moves into `pendingErrors`; files
  that are neither loaded nor failed (deleted since last scan) drop out.
  `loaded: { uri, file }[]`, `failed: { uri, error }[]`.

### 3. Isolated workspace watcher (`src/vscode/modelWatcher.ts`)

`registerModelWatcher(callbacks): vscode.Disposable[]` where `callbacks` are:

- `getGlob: () => string` — current `dbtiagram.modelFileGlob` value.
- `getEnabled: () => boolean` — current `dbtiagram.watchModelFiles` value; when
  `false` every callback is skipped.
- `onDocumentChanged(uri, content)` — from `onDidChangeTextDocument` (typing)
  and `onDidSaveTextDocument` (safety net for externally modified files), for
  documents whose path matches the glob.
- `onFilesCreated(uris)` / `onFilesDeleted(uris)` — from
  `onDidCreateFiles`/`onDidDeleteFiles`, filtered by the glob.
- `onFilesRenamed(oldUri, newUri)` — from `onDidRenameFiles` when either path
  matches the glob.
- `onConfigurationChanged()` — when `dbtiagram.modelFileGlob` or
  `dbtiagram.watchModelFiles` changes.

The panel registers this watcher in its constructor and disposes it with the
panel.

### 4. `src/vscode/project.ts` changes

- `loadModelYmlFiles` return type changes from `{ records, warnings }` to
  `{ records, failures: { uri, message }[] }` so callers can keep last-good
  data and route failures to the banner (the old modal `showWarningMessage`
  path is removed). No other callers exist.
- New `readFileText(uri): Promise<string>` helper (used for created/renamed
  files, whose content is not yet a text document event).

### 5. Protocol (`src/shared/protocol.ts`)

```
export interface DiagramPendingError { uri: string; message: string }

MessageToWebview =
  | { type: 'diagram:update'; diagram: DiagramGraph; pendingErrors: DiagramPendingError[] }
  | { type: 'diagram:error'; message: string }
```

`diagram:update` is the only change; `diagram:edit`/`webview:ready` are
untouched.

### 6. Panel rewrite (`src/webview/panel.ts`)

- Holds `store: ModelStore` instead of `records: ModelYmlRecord[]`.
- Constructor: registers the model watcher, publishes the initial diagram, and
  keeps the existing `webview:ready` re-publish (messages posted before the
  webview attaches are otherwise lost).
- `publish()`: `buildDiagram(store.records.flatMap(r => r.file.models))` +
  `pendingErrors` from the store; the webview banner and the panel share one
  truth.
- Live handlers map watcher callbacks to store functions and publish.
- **Self-write guard:** `applyEditAndPersist` records `Date.now()` per fsPath
  after each `writeModelYmlFile`; live change handlers ignore events for a path
  within `SELF_WRITE_IGNORE_MS` (250 ms) so the webview's own disk writes do
  not loop back into a redundant/regressive parse (e.g. when the edited file is
  open in the editor).
- `refresh()` (config changes, keep the public method) now merges via
  `replaceModelStore` with last-good retention instead of dropping broken
  files.

### 7. Position preservation (`src/diagram/positions.ts`, `webview-ui/App.tsx`)

New pure module:

- `rectsOverlap(a, b, padding = 12)` — axis-aligned rectangle overlap test with
  a small breathing margin.
- `avoidOverlap(position, width, height, occupied)` — returns the first
  position at `position.y + n * 8` that does not overlap any rect in `occupied`
  (bounded loop; always terminates).
- `mergeFlowNodes(flowNodes, current)` — maps the freshly laid-out nodes onto
  the current React Flow node list: for ids present in `current`, keep the
  current `position` (and `selected`) but adopt the fresh `data`/`width`/
  `height`; for **new** ids, take the flow (dagre) position nudged by
  `avoidOverlap` against every already-kept rect; ids missing from `flowNodes`
  are dropped. **A new id that is the rename of a vanished card — same
  `columns` and `description` in its `data` — keeps the vanished card's
  position** (so a renamed table never snaps back to its auto-layout slot).
  React Flow's own state stays the source of truth for positions, so mid-drag
  updates and drag-stop positions survive naturally.

`webview-ui/App.tsx` / `DiagramCanvas`:

- One effect, keyed on `[flow, layoutTick]`: when `layoutTick` changed, adopt
  `flow.nodes` verbatim (Auto-layout = fresh dagre); otherwise adopt
  `mergeFlowNodes(flow.nodes, rfNodes)`. `onNodesChange` continues to feed drags
  into `rfNodes`; no new drag bookkeeping is needed.
- The fit effect runs only when: first render, the node-id set **grew**
  (net node count increased — a rename swaps one id for another and does not
  refit), or `layoutTick` changed. Ordinary live edits do not refit.
- A new `pendingErrors` banner renders above the form (styled `.banner--info`).

### 8. Tests (`test/unit/`)

- `shared/glob.test.ts`: default `**/models/**/*.yml` against absolute
  (forward- and backslash), relative, nested, and non-matching paths; `**`
  zero-segment matching; `*` not crossing `/`; `?`; `{a,b}`; `[a-z]`.
- `dbt/modelStore.test.ts`: upsert order and error clearing; text change
  success clears, failure keeps last good + records the error; delete removes
  record and error; rename moves the record; `replaceModelStore` last-good
  retention and pending-error population.
- `diagram/positions.test.ts`: `rectsOverlap`; `avoidOverlap` pushes below an
  obstacle and stops when free; `mergeFlowNodes` keeps existing positions and
  `selected`, refreshes `data`/`width`/`height`, drops vanished ids, gives
  new ids a non-overlapping slot, and carries a vanished card's position over
  to a new id with identical `columns`/`description` (a rename) — including
  distinct carry-overs for several renames in one update.
- Existing suites (`dbt/*`, `diagram/graph`, `diagram/flow`, `diagram/layout`,
  `vscode/editorButton`, `fixture`, integration) are unchanged and must keep
  passing.

## Scenarios

### Typing in a model.yml updates the diagram live

```
Given the dbt Diagram is open and shows the fixture models
When the user types a new column name into orders.yml without saving
Then the orders card in the diagram shows the new column immediately
And the diagram did not re-run the automatic layout
```

### Dragged tables stay where the user put them during edits

```
Given the dbt Diagram is open
When the user drags the orders card to a custom position
And the user edits order_items.yml (typing or webview Add column)
Then the orders card stays at the custom position
And the order_items card (if not dragged) also stays where it was
```

### The viewport is not reset by live edits

```
Given the dbt Diagram is open and the user has zoomed/panned to a custom viewport
When the user types in a model.yml file
Then the viewport does not change
When the user clicks "Auto-layout"
Then the view re-fits the diagram
```

### A newly added model appears without moving existing tables

```
Given the dbt Diagram is open and shows the fixture models
When the user adds a new model block to a model.yml file (or creates a new one)
Then the new table appears in the diagram
And every existing table keeps its current position
And the view re-fits so the new table is visible
```

### A renamed table keeps its position and does not re-fit

```
Given the dbt Diagram is open and the orders card has been dragged to a custom position
When the user renames orders to orders_v2 (inline or in the details sidebar)
Then the card keeps its custom position
And the viewport does not change
And only the card title (and the FK edges pointing at it) reflect the new name
```

### Removing a model removes its card without re-layout

```
Given the dbt Diagram is open and shows the fixture models
When the user deletes the products model block from products.yml
Then the products card disappears
And all remaining cards keep their positions
```

### A temporarily broken file keeps the last good diagram

```
Given the dbt Diagram is open
When the user edits a model.yml file so it is no longer valid YAML
Then the diagram keeps showing the last valid version of that file
And a status banner lists the file as waiting for valid YAML
When the user fixes the YAML
Then the banner disappears and the diagram reflects the fixed content
```

### Renaming a model.yml file transfers its models

```
Given the dbt Diagram is open and shows the fixture models
When the user renames orders.yml to renamed_orders.yml
Then the diagram continues to show the orders model
And no duplicate card appears
```

### Auto-layout still restores the automatic arrangement

```
Given the dbt Diagram is open and tables have been dragged around
When the user clicks "Auto-layout"
Then every table is re-arranged by dagre
And the view re-fits
```

### Watch setting disables live reload

```
Given dbtiagram.watchModelFiles is false and the dbt Diagram is open
When the user edits a model.yml file
Then the diagram does not change
```

## Acceptance Criteria

- [ ] Typing in a model.yml file updates the diagram without waiting for save.
- [ ] Manual node positions (drags) and the viewport survive every live edit and
      every webview edit; only new tables receive automatic positions.
- [ ] Renaming a table keeps its card position and leaves the viewport alone
      (no re-fit), including renames from inline editing or the sidebar.
- [ ] A table added while editing never overlaps an existing table when first
      placed (nudged below its dagre slot if needed).
- [ ] Removing a model file/model block removes its card; remaining cards keep
      their positions.
- [ ] Parse failures keep the last good diagram for that file and surface in a
      non-modal banner; fixing the YAML clears the banner and updates the graph.
- [ ] Renames transfer the models; creates/deletes are picked up live.
- [ ] Auto-layout re-runs dagre and re-fits; the view is not re-fitted on
      ordinary edits.
- [ ] `dbtiagram.watchModelFiles = false` disables live reload.
- [ ] The webview's own disk writes do not loop back into redundant diagram
      updates (self-write guard).
- [ ] `src/shared/glob.ts`, `src/dbt/modelStore.ts`, and `src/diagram/positions.ts`
      are pure (no `vscode` import) and covered by sub-second Vitest unit tests.
- [ ] `npm test` and `npm run typecheck` pass; `src/diagram/flow.ts`,
      `src/diagram/layout.ts`, `src/diagram/graph.ts`, dbt parsing/serialization,
      fixtures, and the integration suite are unchanged.

## Confirm at Approval

These decisions are encoded above as defaults but are explicitly flagged for
confirmation at approval time:

- **(a) Live scope.** "Live" means as-you-type (`onDidChangeTextDocument`), plus
  save/create/delete/rename events, all gated by the existing
  `dbtiagram.watchModelFiles` setting. The blanket save-refresh in
  `src/extension.ts` is removed.
- **(b) Position ownership.** React Flow's own node state is the source of truth
  for positions; `mergeFlowNodes` only places brand-new ids. No positions map is
  stored in App state, and nothing is persisted across sessions.
- **(c) New-node placement.** New tables use their dagre slot, nudged down only
  when that slot would overlap an already-placed table.
- **(d) Refit policy.** Auto-fit happens on first render, node-set growth, and
  Auto-layout only — not on ordinary edits.
- **(e) Error surfacing.** Modal `showWarningMessage` calls for model-file parse
  failures are replaced by the non-modal `pendingErrors` banner in the diagram.

## Addendum: ignore non-model YAML files; collapsible banner

Two follow-up fixes, both scoped to the parse-failure path introduced above:

- **Non-model YAML files are ignored, not reported.** A YAML file with no
  top-level `models` key at all (e.g. a dbt `sources.yml`, `exposures.yml`, or
  any other schema file living under `models/`) is silently skipped instead of
  appearing in the "Waiting for valid YAML" banner. `src/dbt/parse.ts` raises a
  distinct `NotAModelYmlFileError` (extends `ModelYmlParseError`) for this case;
  `src/vscode/project.ts::loadModelYmlFiles` and
  `src/dbt/modelStore.ts::applyTextChange` special-case it to skip/drop the
  file rather than adding it to `failures`/`pendingErrors`. A YAML file whose
  `models` key is present but the wrong type (e.g. `models: "foo"`) still
  reports the original "model.yml is missing the required "models" array"
  error, since that is a genuine model.yml mistake, not an unrelated schema
  file.
- **The banner is collapsible.** `webview-ui/App.tsx` adds a
  `pendingErrorsExpanded` boolean (default collapsed/`false`). Collapsed shows
  only the first pending error plus a count and a "Show all" toggle; expanded
  shows the full list with a "Collapse" toggle. The toggle only renders when
  there is more than one pending error.

Files touched: `src/dbt/parse.ts` (`NotAModelYmlFileError`),
`src/vscode/project.ts`, `src/dbt/modelStore.ts`, `webview-ui/App.tsx`,
`webview-ui/styles.css` (`.banner__header`, `.banner__toggle`).
