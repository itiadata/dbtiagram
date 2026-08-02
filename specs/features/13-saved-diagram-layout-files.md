---
id: 13
title: Saved diagram layout files
status: done
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [04, 05]
---

# Saved diagram layout files

## Summary

As a dbt developer, once I have arranged a diagram the way I like it, I want to
**save that arrangement** — which tables are visible and where each one sits —
to a file I can name and place myself, commit to git, and reopen later.

The layout is stored **separately from any `model.yml`**: model.yml files keep
describing models/columns exactly as they do today and are never touched by
this feature. The layout file is its own YAML document with its own extension.

While a saved diagram is open, **every layout interaction writes straight back
to that file** (same live write-back philosophy as model edits in spec 06), so
the file always mirrors what is on screen.

## Background

Today the diagram is ephemeral. Node positions come from dagre
(`src/diagram/layout.ts`) and survive live model.yml edits via `mergeFlowNodes`
(spec 04), but they reset the moment the panel is reopened. Visibility is the
webview-only filter selection from spec 05, which is explicitly non-persistent
("Filter persistence: the selection lives only in webview state ... resets on
reopening the panel").

Spec 01 gave model.yml files an editor-title-bar button driven by the
`dbtiagram.isModelYml` context key. This feature reuses that pattern for a
second file kind.

## Scope

- **A new file kind: the diagram layout file**, a YAML document with the
  extension `.dbtiagram.yml` (see Implementation Notes §1 for the schema).
- **Save diagram** action in the webview toolbar. It opens the native VS Code
  save dialog so the user picks the folder and file name, then writes the
  current visible tables and their positions.
- **Save target memory**: after a successful save (or after opening a layout
  file), the panel remembers that file as the *active layout*.
- **Live write-back while a layout is active**: dragging a table, or changing
  which tables are visible, rewrites the active layout file (debounced). No
  extra "save" click is needed after the first one.
- **Open diagram from the editor title bar** for `.dbtiagram.yml` files, exactly
  like spec 01 does for model files. Clicking it opens the diagram panel with
  that layout applied and makes it the active layout.
- **Applying a layout**: the visible model set becomes exactly the tables listed
  in the file, and each listed table is placed at its stored position. Automatic
  dagre layout is skipped for tables that have a stored position.
- **Reconciliation with the workspace**: a layout entry naming a model that no
  longer exists is ignored on load and dropped on the next write; a model that
  exists but is absent from the layout is **hidden** (see Confirm at Approval
  (d)).
- **Layout file changes on disk** (git checkout, external edit) while it is the
  active layout are **not** watched in this feature (see Out of scope).

### Out of scope

- Storing anything beyond `tables` (name + x/y): no viewport/zoom, no edge
  routing choices, no per-table collapse state, no colours. The schema is
  versioned so these can be added later.
- Any change to model.yml parsing, serialization, or writing — `src/dbt/*` is
  untouched apart from nothing at all.
- Watching the layout file for external changes and hot-reloading it.
- A tree view / picker listing all layout files in the workspace.
- Multiple layout files open at once (the panel is a singleton; opening a second
  layout switches the active layout).
- "Save As" for an already-active layout, and an explicit "close layout" action.
- Persisting the *file-level* filter checkboxes (spec 05). Only the resulting
  visible **model** set is stored, so a layout is independent of how the user
  arrived at it.

## Implementation Notes

### 1. Layout file format

Extension: **`.dbtiagram.yml`**. The double extension keeps the file valid YAML
for editors while being distinguishable from a model file, and it does **not**
collide with the default `dbtiagram.modelFileGlob` (`**/models/**/*.yml`) once
the model loader excludes `*.dbtiagram.yml` (see §5).

```yaml
version: 1
name: Order marts
tables:
  - name: orders
    x: 120
    y: 40
  - name: order_items
    x: 520
    y: 40
```

- `version` — schema version, currently the literal `1`. Unknown versions are
  rejected with a readable error.
- `name` — display name. Defaults to the file's base name (without
  `.dbtiagram.yml`) when the user does not supply one; shown in the panel
  header.
- `tables` — the visible tables. Order is the model name order at write time
  (stable, so diffs stay small). `x`/`y` are the React Flow node positions,
  rounded to integers.

### 2. Pure layout module (`src/diagram/layoutFile.ts`)

MUST NOT import `vscode`. The `yaml` package is already a dependency (used by
`src/dbt/parse.ts` / `serialize.ts`).

- `export const LAYOUT_FILE_SUFFIX = '.dbtiagram.yml';`
- `interface DiagramLayoutTable { name: string; x: number; y: number }`
- `interface DiagramLayout { version: 1; name: string; tables: DiagramLayoutTable[] }`
- `parseDiagramLayout(text: string, fallbackName: string): DiagramLayout` —
  throws a `DiagramLayoutParseError` with a readable message on invalid YAML,
  a non-object root, a missing/unknown `version`, a non-array `tables`, or an
  entry with a missing `name` or non-finite `x`/`y`. Duplicate table names keep
  the first entry. Keys outside the known schema are dropped rather than
  round-tripped (see Confirm at Approval (e)).
- `serializeDiagramLayout(layout: DiagramLayout): string` — deterministic YAML
  with the key order `version`, `name`, `tables`, and `name`, `x`, `y` inside
  each table.
- `defaultLayoutName(fsPath: string): string` — base name minus the suffix.
- `isLayoutFilePath(fsPath: string): boolean` — case-insensitive suffix test.
- `buildLayout(name, visible: readonly { name: string; x: number; y: number }[]): DiagramLayout` —
  sorts by `name` and rounds coordinates.
- `applyLayout(layout, knownModels: ReadonlySet<string>): { visible: Set<string>; positions: Map<string, { x: number; y: number }>; missing: string[] }` —
  drops entries whose model is unknown and reports them in `missing`.

### 3. Protocol (`src/shared/protocol.ts`)

Additive only:

- To webview: `{ type: 'layout:apply'; layout: DiagramLayout; missing: string[] }`
  — sent right after `diagram:update` when a layout is opened.
- To webview: `{ type: 'layout:active'; path: string | null; name: string | null }`
  — tells the webview which layout file is active (drives the header label and
  the Save button's "Save"/"Save as…" wording).
- To extension: `{ type: 'layout:save'; layout: DiagramLayout }` — the explicit
  Save action; the host prompts for a path when there is no active layout.
- To extension: `{ type: 'layout:changed'; layout: DiagramLayout }` — the
  debounced live update; ignored by the host when no layout is active.

`DiagramLayout` is imported by `protocol.ts` from `src/diagram/layoutFile.ts`,
matching how `DiagramGraph` and `ModelEdit` are already imported there.

### 4. VS Code wrapper (`src/vscode/layoutFiles.ts`)

The only place that touches the file system for layouts:

- `readLayoutFile(uri): Promise<string>` — thin `workspace.fs.readFile` wrapper.
- `writeLayoutFile(uri, layout): Promise<void>` — serialize + `workspace.fs.writeFile`.
- `promptForLayoutPath(defaultName): Promise<vscode.Uri | undefined>` —
  `window.showSaveDialog` with `filters: { 'dbt Diagram': ['dbtiagram.yml'] }`,
  `saveLabel: 'Save Diagram'`, and a default URI inside the first workspace
  folder. The suggested file name is the **bare** name (`mydiagram`) with **no
  extension**: VS Code appends the filter's extension itself, so including the
  suffix here would produce `mydiagram.dbtiagram.yml.dbtiagram.yml`. The
  returned path is still normalized to end with `.dbtiagram.yml`, covering
  platforms/dialogs that do not append it.

### 5. Model loading excludes layout files (`src/vscode/project.ts`)

`loadModelYmlFiles` passes an exclude that also filters `**/*.dbtiagram.yml`, so
a layout saved inside `models/` is never parsed as a model file. The pure
`matchesGlob` path used by `modelWatcher`/`panel` is guarded with
`isLayoutFilePath` for the same reason.

### 6. Editor title bar (`src/vscode/editorButton.ts` + `editorButtonContext.ts`,
`package.json`)

- New pure predicate `isDiagramLayoutFile(fsPath: string | undefined): boolean`
  in `editorButton.ts` (delegates to `isLayoutFilePath`), unit tested next to
  the existing `shouldShowButton`.
- New context key `dbtiagram.isDiagramLayout`, kept in sync in
  `registerEditorTitleButton` from the active editor alone (no `findFiles`
  needed — the check is a pure path test).
- New command `dbtiagram.openLayout` ("Open dbt Diagram") contributed to
  `editor/title` group `navigation` with
  `when: dbtiagram.isDiagramLayout && resourceScheme == file`, sharing the icon
  of `dbtiagram.open`. It receives the resource URI from the menu and calls
  `DiagramPanel.createOrShow(extensionUri, uri)`.

### 7. Panel (`src/webview/panel.ts`)

- `createOrShow(extensionUri, layoutUri?)` — when `layoutUri` is given, the
  panel reads and parses it, stores it as the active layout, and posts
  `layout:apply` + `layout:active` after the first `diagram:update`. A parse
  failure surfaces as a `diagram:error` and leaves the layout inactive.
- **The apply is re-sent on `webview:ready`.** The first `layout:apply` races
  the webview's message listener exactly like the first `diagram:update` does,
  so a freshly opened panel would otherwise show the default (unfiltered,
  auto-laid-out) diagram. On `webview:ready` the panel therefore **re-reads the
  active layout file from disk** and re-posts `layout:apply`, which also picks
  up any change written since the panel opened.
- If a panel already exists and a `layoutUri` is passed, the panel is revealed
  and the new layout replaces the active one.
- `layout:save`: if there is an active layout, write straight to it; otherwise
  call `promptForLayoutPath`, write, set the active layout, and post
  `layout:active`. Cancelling the dialog is a no-op.
- `layout:changed`: write to the active layout if any; ignore otherwise.
- Writes go through the existing self-write suppression map so the layout file
  never re-enters the model pipeline (it is excluded anyway, but the guard keeps
  the invariant local).
- `layout:active` is re-posted on `webview:ready` so a reopened webview knows
  its state.

### 8. Webview (`webview-ui/App.tsx`, `DiagramCanvas`, `FilterSidebar.tsx`)

- New state: `activeLayout: { path: string; name: string } | null`.
- On `layout:apply`: replace `selectedModels` with exactly the layout's table
  names, check **all** files (so file precedence never hides a layout table),
  seed a `layoutPositions` map consumed by `mergeFlowNodes` as the initial
  position source for those nodes, and bump `filterTick` to refit. `missing`
  names raise a dismissible banner ("2 tables in this diagram no longer exist:
  …").
- A **Save diagram** button in the header (`Save diagram` when no layout is
  active, `Saved to <name>` indicator plus the layout name when one is). It
  posts `layout:save` with the layout built from the current visible nodes.
- Live write-back: a `useEffect` watching the visible node set and their
  positions posts a debounced (400 ms) `layout:changed` — but only while
  `activeLayout !== null`, and never for a change caused by applying a layout.
  Node drags are already reported by React Flow's `onNodesChange`; the effect
  keys on the resulting node array, so drag-in-progress moves coalesce into one
  write at the end of the debounce window.
- Position seeding: `layoutPositions` takes precedence over dagre in
  `buildFlowElements`/`mergeFlowNodes` for tables present in the layout;
  tables added to the layout later (via the filter) still get a dagre slot.

### 9. Fixture

`fixtures/sample-dbt/` gains a `diagrams/orders.dbtiagram.yml` sample so F5
debugging can exercise the open-from-title-bar path immediately.
`test/unit/fixture.test.ts` asserts it parses and that every table it names
exists in the fixture's models.

### 10. Tests (`test/unit/`)

- `diagram/layoutFile.test.ts`: round-trip serialize→parse; deterministic key
  order and sorted tables; rejects invalid YAML, non-object root, missing or
  unknown `version`, non-array `tables`, entry without `name`, non-finite
  coordinates; duplicate names keep the first; `defaultLayoutName` strips the
  suffix; `isLayoutFilePath` is case-insensitive and rejects `foo.yml`;
  `buildLayout` rounds coordinates; `applyLayout` drops unknown models and
  reports them in `missing`.
- `vscode/editorButton.test.ts`: `isDiagramLayoutFile` true for
  `a/b/x.dbtiagram.yml`, false for `x.yml`, `x.dbtiagram.yaml`, and `undefined`.
- Existing suites must keep passing unchanged.

## Scenarios

### Saving a new diagram

```
Given the dbt Diagram is open with some tables hidden and others dragged into place
When the user clicks "Save diagram"
Then VS Code shows a save dialog defaulting to the workspace root
When the user picks a folder and the name "order-marts"
Then a file order-marts.dbtiagram.yml is written there
And it lists exactly the visible tables with their current x/y positions
And no model.yml file is modified
And the panel header shows the diagram name "order-marts"
```

### Cancelling the save dialog changes nothing

```
Given the dbt Diagram is open and no layout is active
When the user clicks "Save diagram" and dismisses the save dialog
Then no file is written
And the panel still reports no active diagram
```

### Opening a saved diagram from the editor title bar

```
Given a file order-marts.dbtiagram.yml is open in the editor
Then a button titled "Open dbt Diagram" appears in the editor title bar
When the user clicks it
Then the dbt Diagram panel opens
And exactly the tables listed in the file are visible
And each one sits at its stored position
And the header shows the diagram's name
```

### The layout button does not appear for other files

```
Given the active editor is a .sql, .json, or plain .yml file that is not a layout file
Then the "Open dbt Diagram" layout button does not appear
```

### Interactions update the active layout file

```
Given a saved diagram is open and active
When the user drags a table to a new position
Then order-marts.dbtiagram.yml is updated with the new x/y within a moment
When the user unchecks a model in the Models filter
Then that table is removed from the file's tables list
When the user checks a previously hidden model
Then it is added to the file with the position it was given on screen
And in every case no model.yml file is modified
```

### Model edits still go to model.yml, not the layout

```
Given a saved diagram is open and active
When the user renames a column in the diagram
Then the corresponding model.yml file is rewritten as it is today
And the layout file's tables list is unchanged apart from positions
```

### A layout naming a deleted model degrades gracefully

```
Given a saved diagram lists a table "legacy_orders"
And that model no longer exists in any model.yml
When the user opens the diagram
Then the remaining tables render at their stored positions
And a dismissible notice reports that legacy_orders no longer exists
And the next write to the layout file drops the legacy_orders entry
```

### A model absent from the layout stays hidden

```
Given a saved diagram lists 3 of the workspace's 12 models
When the user opens the diagram
Then only those 3 tables are visible
And the other 9 are unchecked in the Models filter but still listed there
When the user checks one of them
Then it appears on the diagram and is appended to the layout file
```

### An invalid layout file reports a readable error

```
Given a .dbtiagram.yml file with malformed YAML or an unknown version
When the user clicks the "Open dbt Diagram" button for it
Then the panel shows a readable error naming the file and the problem
And no layout is applied and no file is overwritten
```

### Reopening a saved diagram restores it, not the default view

```
Given a saved diagram in which the user removed a model and moved the rest
And the layout file on disk reflects that
When the user closes the diagram panel
And opens the same .dbtiagram.yml again from the editor title bar
Then the diagram shows exactly the tables listed in the file at their stored positions
And it does NOT fall back to every model in the default auto-layout
```

### The save dialog suggests a name without a duplicated extension

```
Given the dbt Diagram is open and no layout is active
When the user clicks "Save diagram"
Then the save dialog suggests a bare name such as "mydiagram"
And the saved file is named mydiagram.dbtiagram.yml
And never mydiagram.dbtiagram.yml.dbtiagram.yml
```

### Layout files are never parsed as models

```
Given a layout file is saved inside the models/ folder
Then it does not appear in the "Model yml files" filter list
And it produces no parse error banner
And it contributes no tables to the diagram
```

## Acceptance Criteria

- [ ] A "Save diagram" action writes the visible tables and their positions to a
      user-chosen `.dbtiagram.yml` file via the native save dialog; cancelling
      writes nothing.
- [ ] The layout file is YAML with `version`, `name`, and `tables[{name,x,y}]`,
      serialized deterministically (sorted tables, fixed key order, integer
      coordinates) so git diffs stay minimal.
- [ ] No `model.yml` file is read, written, or otherwise affected by any layout
      operation.
- [ ] `.dbtiagram.yml` files are excluded from model discovery, the filter
      sidebar, and the parse-error banner even when stored under `models/`.
- [ ] An editor title bar button appears for `.dbtiagram.yml` files and only for
      them, and opens the diagram with that layout applied.
- [ ] Opening a layout makes exactly its tables visible at their stored
      positions and makes that file the active layout. This holds on a freshly
      created panel too: the apply is re-sent (re-reading the file) once the
      webview reports ready, so reopening a saved diagram never falls back to
      the default view.
- [ ] The save dialog suggests a bare file name; the resulting file carries the
      `.dbtiagram.yml` suffix exactly once.
- [ ] While a layout is active, dragging a table or changing table visibility
      rewrites the file (debounced), with no further user action.
- [ ] A layout entry for a model that no longer exists is ignored with a
      dismissible notice and dropped on the next write.
- [ ] An invalid or unknown-version layout file yields a readable error and
      applies nothing.
- [ ] `src/diagram/layoutFile.ts` is pure (no `vscode` import) and covered by
      sub-second Vitest unit tests; all VS Code file access lives in
      `src/vscode/layoutFiles.ts`.
- [ ] `npm test` and `npm run typecheck` pass; `src/dbt/*` is unchanged.

## Confirm at Approval

- **(a) File extension.** `.dbtiagram.yml` (double extension). Alternatives were
  a bare `.yml` (collides with the model glob) or a custom `.dbtiagram`
  extension (loses YAML editor support). Confirm the choice.
- **(b) Stored data.** Only `version`, `name`, and `tables[{name,x,y}]` for now
  — no viewport/zoom, no edge or sidebar state. `version: 1` leaves room to grow.
- **(c) Autosave semantics.** Once a layout is active (saved or opened), layout
  interactions write to it immediately (400 ms debounce), with no dirty state
  and no undo integration. Confirm this rather than an explicit-save model.
- **(d) Models missing from the layout are hidden.** A layout is an exhaustive
  visible-table list, so a model added to the workspace after the layout was
  saved does **not** appear until the user checks it. (This deliberately differs
  from spec 05's "new models default to checked", which still applies when no
  layout is active.)
- **(e) Unknown keys are dropped.** Anything in the file outside the known
  schema is not preserved on rewrite. Confirm, or ask for round-trip
  preservation of unknown keys.
- **(f) File-filter state is not stored.** Only the resulting visible model set
  is; opening a layout checks all files so file precedence cannot hide a layout
  table.
- **(g) No external-change watching.** Editing the layout file in the editor
  while it is active does not reload the diagram, and the next interaction
  overwrites it. Confirm this is acceptable for v1.
- **(h) Single active layout.** Opening another layout file switches the panel's
  active layout; there is no multi-diagram or tab support.
