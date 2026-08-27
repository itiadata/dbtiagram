---
id: 14
title: Multiple diagram panels open side by side
status: approved
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [01, 05, 13]
---

# Multiple diagram panels open side by side

## Summary

As a dbt developer, I want to open **more than one dbt Diagram at a time**. Today
the panel is a singleton: once a diagram is open, clicking "Open dbt Diagram" for
a *different* `model.yml` or a *different* `.dbtiagram.yml` just reveals the
existing tab (and, for layouts, silently replaces its content). I want each
distinct source to get its own diagram tab, so I can compare two saved diagrams
side by side. Re-opening the **same** source keeps the current behavior: reveal
the tab that is already showing it.

## Background

`src/webview/panel.ts` holds a single `static current: DiagramPanel | undefined`.
`createOrShow` reveals it when set, and when a `layoutUri` is passed it calls
`openLayout` on that same panel — which is spec 13's documented "Single active
layout … opening another layout file switches the panel's active layout"
(Confirm at Approval (h)). This feature supersedes that decision.

Each panel already owns everything it needs to be independent: its own
`ModelStore`, its own model watcher registration, its own `selfWrites` map, and
its own `activeLayout`. The change is therefore mostly about replacing the
singleton with a keyed registry and making disposal per-panel.

## Scope

- **A panel registry keyed by *diagram identity*** replaces
  `DiagramPanel.current`.
- **Diagram identity** (see Implementation Notes §1):
  - A diagram opened from a `.dbtiagram.yml` file is identified by that file's
    `fsPath`.
  - A diagram opened from a `model.yml` file (spec 01 button) or from the
    command palette is identified by the `fsPath` of the file the user invoked
    it from; the command palette with no model file active uses a per-invocation
    identity so it always opens a new tab.
- **Open behavior**: if a panel with the same identity exists, reveal it;
  otherwise create a new panel in a new tab.
- **Initial filter scoping for model-file diagrams**: a panel opened from
  `models/core/schema.yml` starts with **only that file** checked in the "Model
  yml files" filter, so it opens showing just the models that file defines. The
  user can check further files afterwards; nothing else about spec 05's filter
  changes. Layout-opened panels are unaffected (spec 13's layout wins), and
  palette-opened panels keep spec 05's "all files checked" default.
- **Per-panel title**: the tab title distinguishes the panels — `dbt Diagram —
  <layout name>` for a saved diagram, `dbt Diagram — <file base name>` for a
  model-file-originated one, plain `dbt Diagram` for a palette-originated one.
- **Independent lifecycle**: closing one panel disposes only its own watchers and
  listeners; the others keep working, keep receiving live model.yml updates
  (spec 04), and keep writing back to their own layout files (spec 13).
- **Independent state**: each panel has its own filter selection, sidebar state,
  selection, and active layout. Editing a model in one panel writes to
  `model.yml` and every open panel re-renders it via the normal watcher path.

### Out of scope

- Webview panel **serialization/restore** across VS Code restarts
  (`WebviewPanelSerializer`).
- Restricting a panel's **graph** to the originating `model.yml`: the host still
  sends the whole workspace graph to every panel. Scoping is a filter default
  only, so the user can widen it at any time and FK edges to models in other
  files still appear once those files are checked.
- A "diagrams" tree view or a picker listing the open panels.
- Deduplicating watchers across panels (each panel keeps its own registration;
  the count is small and the code stays simple).
- Any change to `src/dbt/*` or `src/diagram/*` — this feature is host-side only.
- Cross-panel synchronization of filter/selection/layout state.

## Implementation Notes

### 1. Diagram identity (`src/webview/panelKey.ts`, pure)

MUST NOT import `vscode`.

```ts
export type DiagramSource =
  | { kind: 'layout'; fsPath: string }
  | { kind: 'model'; fsPath: string }
  | { kind: 'adhoc'; id: string };

export function diagramPanelKey(source: DiagramSource): string;
export function diagramPanelTitle(source: DiagramSource, layoutName?: string): string;
```

- `diagramPanelKey` returns `layout:<normalized fsPath>`,
  `model:<normalized fsPath>`, or `adhoc:<id>`. Path normalization lower-cases
  the path on case-insensitive platforms (a `caseInsensitive` parameter defaults
  to `process.platform === 'win32'`, passed explicitly by the caller so the
  module stays testable and pure) and unifies `\` and `/` separators.
- `diagramPanelTitle` returns `dbt Diagram — <layoutName ?? base name minus
  suffix>` for `layout`, `dbt Diagram — <base name>` for `model`, and
  `dbt Diagram` for `adhoc`.

### 2. Registry (`src/webview/panel.ts`)

- `private static readonly panels = new Map<string, DiagramPanel>();`
- `DiagramPanel.current` is removed. Anything needing "all panels" uses
  `DiagramPanel.all(): Iterable<DiagramPanel>`.
- `createOrShow(extensionUri, source: DiagramSource)` replaces the current
  `(extensionUri, layoutUri?)` signature:
  1. Compute `key = diagramPanelKey(source)`.
  2. If `panels.has(key)`, `reveal(column)` that panel and return. For a
     `layout` source the panel additionally re-reads and re-applies the layout
     file, so a layout edited on disk since the panel opened is picked up.
  3. Otherwise create the webview panel with the computed title, load the model
     store, register it under `key`, and open the layout when the source is a
     layout.
- `dispose()` deletes the panel's own key from the map instead of clearing a
  singleton.
- The panel stores its `source` and `key` so `dispose` and title updates can use
  them.
- When a layout is saved for the first time on an `adhoc` / `model` panel
  (`layout:save` with no active layout), the panel **re-keys itself** to
  `layout:<saved path>` and updates its title. If a panel is already registered
  under that key, the save still succeeds and the panel keeps its old key (two
  tabs pointing at one file is degenerate but harmless); see Confirm at
  Approval (d).

### 3. Initial filter scoping

- **Protocol** (`src/shared/protocol.ts`), additive: to webview
  `{ type: 'filter:scope'; uri: string }` — "check only this model.yml file".
- The panel posts it immediately after the first `diagram:update` when its
  source is `{ kind: 'model' }`, and re-posts it on `webview:ready` for the same
  race reason spec 13 §7 documents for `layout:apply`. It is **never** posted
  for `layout` or `adhoc` sources.
- The webview handles it by setting `selectedFiles` to exactly `{ uri }` and
  `selectedModels` to that file's models, then bumping `filterTick` to refit.
- **Ordering guarantee**: when a panel has both a scope and a layout (impossible
  today, since a panel has exactly one source), `layout:apply` wins. The webview
  ignores `filter:scope` once a layout has been applied.
- If the scoping URI is not among the known `modelFiles` (the file matched the
  title-bar predicate but produced no models, e.g. a parse failure), the message
  is ignored and the default all-checked state stands.

### 4. Call sites

- `src/vscode/editorButton.ts` — `dbtiagram.open` passes
  `{ kind: 'model', fsPath }` from the active editor's URI, or
  `{ kind: 'adhoc', id: <counter/uuid> }` when there is no file-backed active
  editor; `dbtiagram.openLayout` passes `{ kind: 'layout', fsPath }` from the
  menu-supplied URI.
- `src/extension.ts` — unchanged apart from forwarding the source.

### 5. Column placement

New panels open in `vscode.ViewColumn.Beside` when at least one diagram panel is
already open, so the second diagram lands next to the first instead of on top of
it. The first diagram keeps today's behavior (the active editor's column, else
`ViewColumn.One`).

### 6. Tests

- `test/unit/webview/panelKey.test.ts`: `diagramPanelKey` is stable for the same
  path, differs for different paths, distinguishes kinds (`model:/a/x.yml` !==
  `layout:/a/x.yml`), is case-insensitive and separator-insensitive when
  `caseInsensitive` is true and case-sensitive when it is false;
  `diagramPanelTitle` produces the three documented titles and strips
  `.dbtiagram.yml`.
- `test/integration/`: opening two different `.dbtiagram.yml` files yields two
  visible panels; opening the same one twice yields one.
- All existing suites stay green.

## Scenarios

### Two saved diagrams open in two tabs

```
Given a workspace with orders.dbtiagram.yml and finance.dbtiagram.yml
And the user opened orders.dbtiagram.yml as a diagram
When the user opens finance.dbtiagram.yml from the editor title bar
Then a second dbt Diagram tab opens beside the first
And it shows exactly finance's tables at their stored positions
And the orders diagram tab is still open and unchanged
```

### Re-opening the same diagram just focuses it

```
Given the orders.dbtiagram.yml diagram is already open in a tab
When the user opens orders.dbtiagram.yml from the editor title bar again
Then no new tab is created
And the existing orders diagram tab is revealed
And its layout is re-read from disk so any external edit is applied
```

### Two model files give two scoped diagrams

```
Given models/core/schema.yml defines customers and models/marts/schema.yml
  defines orders
When the user opens the diagram from models/core/schema.yml
Then a diagram tab opens with only models/core/schema.yml checked in the
  "Model yml files" filter
And only the models that file defines are on the canvas
And every other model.yml is still listed in the filter, unchecked
When the user opens models/marts/schema.yml and clicks "Open dbt Diagram"
Then a second diagram tab opens scoped to models/marts/schema.yml
And each tab has its own filter selection and sidebar state
When the user re-clicks the button on models/core/schema.yml
Then the first tab is revealed rather than a third one created
And its filter selection is whatever the user last set, not re-scoped
```

### Widening a scoped diagram

```
Given a diagram scoped to models/core/schema.yml
When the user checks models/marts/schema.yml in the filter
Then that file's models appear on the canvas
And FK edges between the two files' models are drawn
```

### Scoping does not apply to saved diagrams or the palette

```
Given a saved diagram is opened from a .dbtiagram.yml file
Then its visible tables are exactly the layout's tables, with no file scoping
Given the diagram is opened from the command palette with no model file active
Then every model.yml file is checked, as it is today
```

### Tab titles distinguish the diagrams

```
Given two diagrams opened from orders.dbtiagram.yml and finance.dbtiagram.yml
Then their tab titles read "dbt Diagram — orders" and "dbt Diagram — finance"
```

### Panels are independent

```
Given two diagram tabs are open
When the user closes one
Then the other keeps rendering, keeps receiving live model.yml updates,
  and keeps writing back to its own layout file
When the user drags a table in one saved diagram
Then only that diagram's layout file is rewritten
```

### A model edit in one panel updates the others

```
Given two diagram tabs both show the orders table
When the user renames a column in the first tab
Then models/.../schema.yml is rewritten once
And the second tab shows the renamed column without user action
And neither tab's node positions are lost
```

### Saving an unsaved diagram re-keys its tab

```
Given a diagram opened from a model.yml with no active layout
When the user clicks "Save diagram" and names it "order-marts"
Then the tab title becomes "dbt Diagram — order-marts"
And opening order-marts.dbtiagram.yml from the editor title bar reveals that
  same tab instead of opening a new one
```

## Acceptance Criteria

- [ ] Opening a diagram for a source that has no open panel creates a new tab;
      opening it for a source that already has one reveals that tab.
- [ ] Diagram identity is the originating file path (layout file or model file),
      with palette invocations without a file-backed editor always opening a new
      tab.
- [ ] Opening a second `.dbtiagram.yml` never replaces the content of an already
      open diagram tab.
- [ ] A panel opened from a `model.yml` starts with only that file checked in the
      file filter; revealing an existing panel never re-scopes it; layout- and
      palette-opened panels keep their existing defaults.
- [ ] Checking further files in a scoped panel widens it normally, edges
      included.
- [ ] Tab titles distinguish open diagrams by layout name or file base name.
- [ ] Each panel owns its watchers, model store, filter/sidebar state, and active
      layout; closing one does not affect the others.
- [ ] A `model.yml` edit made in one panel is reflected in every other open panel
      through the existing watcher path, with no layout loss.
- [ ] Saving a previously unsaved diagram re-keys and re-titles its panel.
- [ ] `src/webview/panelKey.ts` is pure (no `vscode` import) and covered by
      sub-second Vitest unit tests.
- [ ] `npm test` and `npm run typecheck` pass; `src/dbt/*` and `src/diagram/*`
      are unchanged.

## Confirm at Approval

- **(a) Identity + initial scoping.** *(Confirmed.)* Panels are keyed by the
  originating file path, **and** a panel opened from a `model.yml` starts with
  only that file checked in the filter, so the two tabs genuinely differ. This
  overrides spec 05's "all files checked by default" for the button-opened case
  only; the palette-opened and layout-opened cases are unchanged.
- **(b) Supersedes spec 13 (h).** Spec 13's "single active layout" is replaced by
  "one panel per layout file". Spec 13's status stays `done`; this spec records
  the override.
- **(c) Placement.** *(Confirmed as specced.)* A second diagram opens in
  `ViewColumn.Beside`.
- **(d) Two panels claiming one layout file.** *(Confirmed as specced.)* Both
  tabs stay open and both write to that file; last write wins.
- **(e) No restore across restarts.** *(Confirmed as specced.)* Diagram tabs
  disappear on VS Code reload, same as today.
- **(b) Supersedes spec 13 (h).** Spec 13's "single active layout" is replaced by
  "one panel per layout file". Spec 13's status stays `done`; this spec records
  the override.
- **(c) Placement.** A second diagram opens in `ViewColumn.Beside`. Say if you
  prefer it in the same column as a plain extra tab.
- **(d) Two panels claiming one layout file.** If an unsaved diagram is saved
  over a path already owned by another open panel, both tabs stay open and both
  write to that file (last write wins). Confirm, or ask for the older panel to be
  closed / the save to be refused.
- **(e) No restore across restarts.** Diagram tabs disappear on VS Code reload
  (no `WebviewPanelSerializer`), same as today. Confirm this is fine for v1.
