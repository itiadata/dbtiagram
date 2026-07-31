---
id: 05
title: Filter diagram by model.yml files and models
status: implemented
priority: medium
created: 2026-07-31
owner: unassigned
depends_on: [04]
---

# Filter diagram by model.yml files and models

## Summary

As a dbt developer, I want to focus the diagram on a subset of my workspace.
Today the diagram always renders **every** model from **every** model.yml file
found by the glob. This feature adds a **left sidebar** to the webview (a stable
home for future UI) containing a **Filter** section with two checkbox lists:

- **Model yml files** — one checkbox per model.yml file, **all checked by
  default**.
- **Models** — one checkbox per model, **all checked by default**.

Both sections have a search box that narrows the list by name. The **file
selection has precedence** over the model selection: a model whose file is
unchecked is hidden even if the model itself is checked. File entries are
labeled VS Code-style: the bare file name when basenames are unique, otherwise
a folder-disambiguated path.

## Background

The webview (`webview-ui/App.tsx`) receives a full `diagram:update` message
(`DiagramGraph` = nodes + edges keyed by model name, plus `pendingErrors`) and
renders every node. There is no notion of which model belongs to which yml file
on the webview side, and no UI chrome beyond the header, the Add-column form,
and the canvas. As model.yml count grows, the diagram becomes cluttered and
users have no way to isolate, e.g., a single mart.

Spec 04 introduced the pure `ModelStore` on the host and the 
`mergeFlowNodes`/`avoidOverlap` position-preservation machinery in the webview.
This spec builds on both: filtering is a **webview-side view concern**, so the
host keeps sending the full graph and simply attaches the per-file metadata the
webview needs to derive its own filtered view. Positions of still-visible
tables keep surviving via the existing `mergeFlowNodes` logic.

Parsing/serialization (`src/dbt/*`), graph derivation (`src/diagram/graph.ts`),
`src/diagram/flow.ts`, `src/diagram/layout.ts`, `src/diagram/positions.ts`,
`src/vscode/modelWatcher.ts`, `src/vscode/project.ts`, and the edit protocol are
all **unchanged**.

## Scope

- **A left sidebar** in the webview layout (`.app` becomes a sidebar + main
  column). This spec fills it with the Filter section; the container is
  explicitly intended to host other UI in the future.
- **Model yml files filter**: checkbox list of every parsed model.yml file
  (each with the model names it defines), all checked by default, plus a
  name-search box.
- **Models filter**: checkbox list of every model, all checked by default, plus
  a name-search box. The file filter has **precedence** over the model filter.
- **VS Code-style file labels**: basename when unique; when two files share a
  basename, the shortest unique path suffix (which includes the folder) is
  shown.
- **Protocol**: `diagram:update` gains a `modelFiles` array (`{ uri, label,
  models }[]`) computed by the host from the model store.
- **Selection lifecycle**: new files/models default to **checked**; deleted
  ones drop out of the selection; the user's other choices are preserved.
- **Empty state**: when the filtered diagram has no nodes, the canvas stays
  mounted and shows a "No models match the current filters." overlay, so
  re-checking a box is instant.
- **Header status**: shows the filtered count, e.g. `5 of 12 models`, whenever
  a filter hides something.
- **Refit policy addition**: toggling a file/model checkbox re-fits the view
  (an explicit user action); search inputs never affect the diagram.

### Out of scope

- Persisting the filter selection across VS Code sessions (it survives panel
  hide/reveal via `retainContextWhenHidden`, matching spec 04's non-persistence
  of positions).
- Sending the filter state back to the host — filtering is entirely webview-side
  and needs no round-trip messages.
- "Select all / clear all" bulk actions on the checkbox lists.
- Making the Add-column form's model field a dropdown of visible models.
- Filtering files that have no record in the store (a file whose every parse
  failed and that has no last-good content contributes no models and is not
  listed; the existing `pendingErrors` banner still reports it).
- Changing how the host computes the graph: the full graph is always sent and
  filtered locally.

## Implementation Notes

### 1. Protocol (`src/shared/protocol.ts`)

```
export interface DiagramModelFile {
  uri: string;      // fsPath of the model.yml file (stable key for selection)
  label: string;    // VS Code-style display name (basename or disambiguated path)
  models: string[]; // model names defined in this file, in file order
}

diagram:update: { type; diagram: DiagramGraph; pendingErrors: DiagramPendingError[]; modelFiles: DiagramModelFile[] }
```

`diagram:update` is the only change; `diagram:error`, `diagram:edit`,
`webview:ready` are untouched. The webview message listener is a switch, so the
added field is purely additive.

### 2. Pure file labels (`src/shared/labels.ts`)

`disambiguateFileLabels(paths: readonly string[], root?: string): Map<string, string>`

- Normalizes path separators (`\` → `/`) so Windows fsPaths behave on all
  platforms.
- `root` is the workspace root (first workspace folder); when omitted, the
  longest common prefix of all paths is used so relative labels are computed
  against a sensible ancestor.
- Counts basenames across all paths. A basename that occurs **once** yields
  `basename` as the label.
- Basenames that occur more than once are disambiguated by the **shortest
  suffix of path segments** (from the end) that is unique within the group,
  e.g. `models/orders.yml` vs `archive/orders.yml` (depth 2). If no suffix is
  unique, the full root-relative path is used (guaranteed unique).
- No external library: VS Code's `getBaseLabel` lives inside `vscode` and is
  not publishable as a dependency; a ~40-line pure function reproduces the
  behavior and matches the precedent of hand-rolling the glob matcher (spec 04)
  rather than adding a runtime dependency.

### 3. Pure filter logic (`src/shared/filter.ts`)

All functions are pure and MUST NOT import `vscode`:

- `matchesSearch(text: string, query: string): boolean` — case-insensitive
  substring match; empty/whitespace query matches everything.
- `reconcileSelection(previous: readonly string[], all: readonly string[], selected: ReadonlySet<string>): Set<string>` —
  merges the user's checked set with a fresh universe on every `diagram:update`:
  items present in `all` keep the user's choice, items **new** since `previous`
  are added (checked by default), and items that left `all` are dropped. This
  distinguishes "new file/model" from "user unchecked it".
- `computeVisibleModels(files: readonly DiagramModelFile[], selectedFiles: ReadonlySet<string>, selectedModels: ReadonlySet<string>): Set<string>` —
  for each file, models are visible only when **both** their file is in
  `selectedFiles` **and** the model is in `selectedModels`. Files unchecked ⇒
  their models are invisible regardless of the model selection (file precedence).
- `filterGraph(graph: DiagramGraph, visible: ReadonlySet<string>): DiagramGraph` —
  keeps nodes whose `id` is visible and edges whose `source` **and** `target`
  are both visible (an edge to a hidden table is dropped, mirroring
  `buildDiagram`'s own "only known targets" rule).

### 4. Panel (`src/webview/panel.ts`)

- `publish()` additionally computes `modelFiles` from `store.records`:
  `uri`, `models` (model names), and `label` via
  `disambiguateFileLabels(uris, workspaceRoot)`.
- `workspaceRoot` = `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`
  (undefined fallback → common-prefix mode). Labels are recomputed on every
  publish, so a newly created duplicate-basename file re-disambiguates the list
  exactly as VS Code tabs do.
- No other panel changes; filtering never reaches the host.

### 5. Webview (`webview-ui/App.tsx` + new `webview-ui/FilterSidebar.tsx`)

`App.tsx`:

- New state: `modelFiles: DiagramModelFile[]`, `selectedFiles: Set<string>`,
  `selectedModels: Set<string>`, `fileSearch`, `modelSearch`, `filterTick`.
- On `diagram:update`: set the full `graph`, set `modelFiles`, and reconcile
  both selections via `reconcileSelection` (the previous update's uri list /
  model-name list is tracked in a ref).
- Derive the visible graph with memos:
  `visibleModels = computeVisibleModels(...)`,
  `visibleGraph = filterGraph(graph, visibleModels)`, and
  `flow = buildFlowElements(visibleGraph, layoutDiagram(visibleGraph))`
  keyed on `[visibleGraph, layoutTick]`. Search boxes do **not** enter these
  memos (they only narrow the checkbox lists).
- Toggling a file/model checkbox increments `filterTick`, which flows to
  `DiagramCanvas` and triggers a re-fit (see below); `mergeFlowNodes` keeps the
  positions of still-visible tables, so only genuinely (re-)added tables get an
  automatic slot (spec 04 machinery, unchanged).
- Header status: `${visibleGraph.nodes.length} of ${graph.nodes.length} models`
  when the visible count differs, else `${graph.nodes.length} models`.
- When `graph !== null` but `visibleGraph.nodes.length === 0`, the canvas stays
  mounted and a `.empty-overlay` reads "No models match the current filters."
  This keeps React Flow (and its node state) alive so re-checking a box is
  immediate.

`DiagramCanvas`:

- Accepts `filterTick`; the fit effect additionally fires when it changes
  (`isFirst || added || reset || filterChanged`). Positions are still adopted
  via `mergeFlowNodes` — refitting the viewport never snaps tables back to
  dagre slots.

New `FilterSidebar.tsx` (presentational, props only):

- `<aside className="sidebar">` with the "Filter" title.
- **Model yml files** section: header with a `checked/total` count, a search
  input (`aria-label="Search model yml files"`, placeholder "Search files…"),
  and a scrollable checkbox list of the files whose `label` matches the search.
  Rows are keyed by `uri`; each row shows the `label` with the full `uri` as a
  tooltip (`title`).
- **Models** section: same shape, rows keyed by model name, search placeholder
  "Search models…".
- Empty search results render a muted "No matches" line.

### 6. Styles (`webview-ui/styles.css`)

- `.app` keeps `height: 100vh`; a new `.app__body` flex row splits the window
  into `.sidebar` (fixed ~260px, `border-right`, `overflow-y: auto`) and
  `.app__main` (flex column containing the existing header, banners, form,
  canvas — unchanged internally).
- Sidebar styles: `.sidebar__title`, `.sidebar__section`,
  `.sidebar__section-header` (h3 + count), `.sidebar__search`, `.sidebar__list`
  (scrollable, max-height), `.sidebar__item` rows, `.sidebar__item-label`
  (ellipsis), `.sidebar__empty`, and `.empty-overlay` (absolute, centered over
  the canvas, pointer-events: none). Dark theme continues via the existing
  `prefers-color-scheme` block.

### 7. Tests (`test/unit/`)

- `shared/labels.test.ts`: unique basenames → bare names; duplicate basenames
  in sibling folders → shortest unique suffix (folder included); deeper
  duplicates (same two-segment suffix) → longer suffix; Windows backslashes;
  common-prefix root when no root passed; explicit workspace root.
- `shared/filter.test.ts`: `matchesSearch` (case, whitespace, empty query);
  `reconcileSelection` (new items added, removed items dropped, user's unchecked
  choice preserved, first call with an empty previous list selects everything);
  `computeVisibleModels` (file precedence — unchecked file hides its models
  even when they are selected; model selection narrows within checked files);
  `filterGraph` (node removal, edge dropped when either endpoint is hidden,
  edges between two visible nodes kept).
- Existing suites (`dbt/*`, `diagram/*`, `shared/glob`, `vscode/editorButton`,
  `fixture`, integration) are unchanged and must keep passing.

## Scenarios

### All files and models are selected by default

```
Given the dbt Diagram is open
Then the sidebar lists every parsed model.yml file with its checkbox checked
And the Models section lists every model with its checkbox checked
And the diagram shows every model from every file
```

### Unchecking a file hides exactly its models

```
Given the dbt Diagram is open
When the user unchecks orders.yml in the Model yml files list
Then every table defined in orders.yml disappears from the diagram
And tables from every other file remain
And the orders.yml entry stays visible and unchecked in the list
```

### The file filter has precedence over the model filter

```
Given the dbt Diagram is open
And the user unchecks products.yml in the Model yml files list
When the user checks the products model in the Models list
Then the products table still does not appear in the diagram
```

### The model filter narrows within checked files

```
Given the dbt Diagram is open
When the user unchecks the order_items model in the Models list
Then the order_items table disappears
And the order_items.yml file entry remains checked
And all other models remain visible
```

### Searching narrows a checkbox list without changing the diagram

```
Given the dbt Diagram is open
When the user types "order" in the Model yml files search box
Then the file list shows only entries whose label contains "order"
And the diagram is unchanged
And unchecking a file from the narrowed list still applies to the diagram
```

### Duplicate file names are disambiguated with their folder

```
Given a workspace containing two model.yml files named orders.yml in different folders
Then the Model yml files list shows each entry with enough of its folder path to tell them apart
When all file names in the workspace are unique
Then each entry shows only its file name
```

### New files and models appear checked by default

```
Given the dbt Diagram is open
When the user creates a new model.yml file (or adds a new model block)
Then the new file appears in the sidebar checked
And its models appear on the diagram
And any model the user had unchecked stays unchecked
```

### A deleted file leaves the selection and the diagram

```
Given the dbt Diagram is open and products.yml is checked
When the user deletes products.yml
Then products.yml disappears from the file list
And the products table disappears from the diagram
And no stale selection remains
```

### Filtering everything out shows the empty state

```
Given the dbt Diagram is open
When the user unchecks every model.yml file
Then the canvas shows "No models match the current filters."
And the header shows 0 of N models
When the user checks one file again
Then its tables appear immediately
```

### The view re-fits when the filter changes

```
Given the dbt Diagram is open and the user has panned/zoomed
When the user checks or unchecks a file (or model) checkbox
Then the view re-fits the remaining tables
And manually dragged tables keep their positions
And typing in either search box does not move or refit the diagram
```

## Acceptance Criteria

- [ ] The webview has a left sidebar that will host future UI; this feature
      fills it with a Filter section containing Model yml files and Models.
- [ ] Every model.yml file and every model defaults to **checked**; the diagram
      is identical to today until the user filters.
- [ ] Unchecking a file hides exactly the tables defined in that file.
- [ ] The file filter takes precedence: a model is hidden whenever its file is
      unchecked, regardless of the model checkbox.
- [ ] The model filter narrows the diagram within checked files.
- [ ] Both search boxes narrow their list by name (case-insensitive substring)
      and never alter the diagram or the viewport.
- [ ] File labels are the bare name when unique and folder-disambiguated when
      duplicated (VS Code-style).
- [ ] New files/models are checked by default; deleted ones drop out of the
      selection.
- [ ] Filtering everything out shows the empty-state overlay; re-checking is
      instant and restores tables with their positions preserved.
- [ ] Toggling a checkbox re-fits the view; positions of still-visible tables
      are preserved (spec 04 `mergeFlowNodes` unchanged).
- [ ] Header status shows the filtered count ("X of Y models") when filters
      hide anything.
- [ ] `src/shared/labels.ts` and `src/shared/filter.ts` are pure (no `vscode`
      import) and covered by sub-second Vitest unit tests.
- [ ] `npm test` and `npm run typecheck` pass; `src/dbt/*`,
      `src/diagram/{graph,flow,layout,positions}.ts`, `src/vscode/*`,
      fixtures, and the integration suite are unchanged.

## Confirm at Approval

These decisions are encoded above as defaults but are explicitly flagged for
confirmation at approval time:

- **(a) Webview-side filtering.** The host always sends the full graph plus
  `modelFiles` metadata; the webview derives its filtered view locally. No
  filter state is sent back to the host.
- **(b) Label implementation.** No external library: a small pure function
  reproduces VS Code-style labels (basename when unique, shortest unique path
  suffix otherwise). VS Code's own `getBaseLabel` is not a publishable npm
  package.
- **(c) Selection lifecycle.** New files/models default to checked; removed ones
  are dropped from the selection; the user's other choices survive each
  `diagram:update`.
- **(d) File precedence.** "Precedence" means a model is invisible whenever its
  file is unchecked, even if the model itself is checked.
- **(e) Refit policy.** Toggling a file/model checkbox re-fits the view (explicit
  user action); typing in a search box does not. Positions of still-visible
  tables are preserved in both cases.
- **(f) Filter persistence.** The selection lives only in webview state:
  survives panel hide/reveal via `retainContextWhenHidden`, resets on reopening
  the panel (matches spec 04's non-persistence of positions).
- **(g) Empty state.** The canvas stays mounted with a "No models match the
  current filters." overlay rather than being replaced, so toggling back does
  not rebuild React Flow.
