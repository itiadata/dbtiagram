---
id: 14
title: One diagram tab per source file, scoped to that file
status: done
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [01, 05, 13]
---

# One diagram tab per source file, scoped to that file

## Summary

As a dbt developer, I want each file I open a diagram from to get **its own
diagram tab**, showing **only that file**:

- Opening the diagram from `models/core/schema.yml` opens a tab that shows only
  the models defined in `models/core/schema.yml`.
- Opening the diagram from a **different** `model.yml` opens a **second** tab,
  scoped to that other file.
- Opening a `.dbtiagram.yml` saved diagram opens its **own** tab too.
- Opening a source that **already has a tab** reveals that tab instead of
  creating a duplicate.

Today the panel is a singleton: the second "Open dbt Diagram" click just reveals
the one existing tab (and for layouts silently replaces its content), and every
tab shows every model.yml in the workspace.

## Background

`src/webview/panel.ts` holds a single `static current: DiagramPanel | undefined`.
`createOrShow` reveals it when set, and when a `layoutUri` is passed it calls
`openLayout` on that same panel — spec 13's documented "single active layout"
(Confirm at Approval (h)). **This feature supersedes that decision.**

Each panel already owns everything it needs to be independent: its own
`ModelStore`, its own model watcher registration, its own `selfWrites` map, and
its own `activeLayout`. The change is therefore mostly replacing the singleton
with a keyed registry, plus a small additive protocol message for the initial
file scoping.

## Scope

- **A registry keyed by source file path** replaces `DiagramPanel.current`.
  - A diagram opened from a `.dbtiagram.yml` is keyed by that file's path.
  - A diagram opened from a `model.yml` (spec 01 title-bar button) is keyed by
    that file's path.
  - A command-palette invocation with no file-backed active editor gets a
    per-invocation key, so it always opens a fresh tab.
- **Open behavior**: same key ⇒ reveal the existing tab; new key ⇒ create a new
  tab. Revealing a layout tab re-reads its layout file from disk so external
  edits are picked up. Revealing a model tab does **not** re-scope its filter.
- **Initial file scoping**: a tab opened from `models/core/schema.yml` starts
  with **only that file checked** in the "Model yml files" filter. Every other
  model.yml is still listed, unchecked, so the user can widen the view at any
  time (FK edges to newly checked files then appear normally). This overrides
  spec 05's "all files checked by default" for **button-opened model tabs only**;
  layout-opened tabs (spec 13's layout wins) and palette-opened tabs are
  unchanged.
- **Per-tab title** so the tabs are distinguishable, with the distinguishing
  name **first** so it is what shows in a narrow tab or in the taskbar/
  Alt-Tab/window-list entry (amended after spec 23 introduced separate
  windows, where this matters most):
  - layout source → `<layout name> — dbt Diagram`
  - model source → `<file base name> — dbt Diagram`
  - palette source → `dbt Diagram`
- **Independent lifecycle**: closing one tab disposes only its own watchers and
  listeners; the others keep rendering, keep receiving live model.yml updates
  (spec 04), and keep writing back to their own layout files (spec 13).
- **Independent state**: each tab has its own filter selection, sidebar state,
  selection, and active layout. A model edit made in one tab is written to
  `model.yml` once and re-rendered in every other open tab through the existing
  watcher path, with no position loss.

### Out of scope

- Webview panel **serialization/restore** across VS Code restarts
  (`WebviewPanelSerializer`). Diagram tabs disappear on reload, as today.
- Restricting a tab's **graph** on the host: the host still sends the whole
  workspace graph to every tab. Scoping is a filter default only.
- A "diagrams" tree view or a picker listing the open tabs.
- Deduplicating watchers across tabs (each tab keeps its own registration; the
  count is small and the code stays simple).
- Any change to `src/dbt/*` or `src/diagram/*` — host + webview only.
- Cross-tab synchronization of filter/selection/layout state.

## Implementation Notes

### 1. Diagram identity (`src/webview/panelKey.ts`, pure)

MUST NOT import `vscode`.

```ts
export type DiagramSource =
  | { kind: 'layout'; fsPath: string }
  | { kind: 'model'; fsPath: string }
  | { kind: 'adhoc'; id: string };

export function diagramPanelKey(source: DiagramSource, caseInsensitive?: boolean): string;
export function diagramPanelTitle(source: DiagramSource, layoutName?: string): string;
```

- `diagramPanelKey` returns `layout:<normalized path>`, `model:<normalized path>`
  or `adhoc:<id>`. Normalization unifies `\` and `/` separators and lower-cases
  the path when `caseInsensitive` is true. The parameter defaults to
  `process.platform === 'win32'` but callers pass it explicitly so the module
  stays pure and testable.
- `diagramPanelTitle` returns the three titles listed in Scope; for `layout` it
  uses `layoutName` when given, else the base name with the `.dbtiagram.yml`
  suffix stripped.

### 2. Registry (`src/webview/panel.ts`)

- `private static readonly panels = new Map<string, DiagramPanel>();` replaces
  `DiagramPanel.current`.
- `createOrShow(extensionUri, source: DiagramSource)` replaces the current
  `(extensionUri, layoutUri?)` signature:
  1. `key = diagramPanelKey(source)`.
  2. If `panels.has(key)`: `reveal(column)`; for a `layout` source also re-read
     and re-apply the layout file. Return — no re-scoping, no new tab.
  3. Otherwise create the webview panel with `diagramPanelTitle(source)`, load
     the model store, register it under `key`, and open the layout when the
     source is a layout.
- The panel stores its `source` and `key`; `dispose()` deletes its own key from
  the map.
- When `layout:save` completes on a tab that had no active layout, the panel
  **re-keys** itself to `layout:<saved path>` and updates its title, so opening
  that file later reveals the same tab. If another panel already holds that key,
  the save still succeeds and this panel keeps its old key (see Confirm (c)).

### 3. Initial filter scoping

- **Protocol** (`src/shared/protocol.ts`), additive, to webview:
  `{ type: 'filter:scope'; uri: string }` — "check only this model.yml file".
- The panel posts it right after the first `diagram:update` when its source is
  `{ kind: 'model' }`, and re-posts it on `webview:ready` for the same race
  reason spec 13 §7 documents for `layout:apply`. It is **never** posted for
  `layout` or `adhoc` sources.
- The webview sets `selectedFiles` to exactly `{ uri }` and `selectedModels` to
  that file's models, then bumps `filterTick` to refit.
- If the URI is not among the known `modelFiles` (e.g. the file parsed to no
  models), the message is ignored and spec 05's all-checked default stands.
- A tab never receives both `filter:scope` and `layout:apply` (a panel has
  exactly one source); should that ever change, `layout:apply` wins and
  `filter:scope` is ignored once a layout has been applied.

### 4. Call sites

- `src/extension.ts` — `dbtiagram.open` builds `{ kind: 'model', fsPath }` from
  the active editor's file URI, or `{ kind: 'adhoc', id }` (monotonic counter)
  when there is no file-backed active editor. `dbtiagram.openLayout` builds
  `{ kind: 'layout', fsPath }` from the menu-supplied resource (falling back to
  the active editor).

### 5. Column placement

Every diagram tab opens with `vscode.ViewColumn.Beside`, so the diagram always
appears split to the right of the file it was opened from. Because `Beside`
resolves to the group next to the *active* one, a second diagram opened from a
model.yml in the left group joins the existing diagram group as a sibling tab
rather than creating a third column.

### 6. Layout write-back guard

Spec 13's debounced `layout:changed` write fires 400 ms after `layout:active`
arrives, using the canvas's reported table positions. On a freshly opened tab
those positions are still empty, so the write could truncate the layout file to
`tables: []` before the first render. The webview therefore **arms** the live
write-back only once the canvas has reported at least one table; a user who
later unchecks everything still writes an empty list, because arming has already
happened.

### 7. Tests

- `test/unit/webview/panelKey.test.ts`: `diagramPanelKey` is stable for the same
  path, differs across paths, distinguishes kinds (`model:/a/x.yml` !==
  `layout:/a/x.yml`), and is case-/separator-insensitive only when
  `caseInsensitive` is true; `diagramPanelTitle` produces the three documented
  titles and strips `.dbtiagram.yml`.
- `test/unit/` webview-side scoping: applying `filter:scope` yields exactly the
  one file checked with its models; an unknown URI leaves the selection
  untouched.
- `test/integration/`: opening two different `.dbtiagram.yml` files yields two
  visible panels; opening the same one twice yields one.
- All existing suites stay green.

## Scenarios

### Opening a model.yml scopes the diagram to it

```
Given models/core/schema.yml defines customers
And models/marts/schema.yml defines orders
When the user opens the diagram from models/core/schema.yml
Then a diagram tab titled "schema.yml — dbt Diagram" opens
And only models/core/schema.yml is checked in the "Model yml files" filter
And only customers is on the canvas
And models/marts/schema.yml is listed in the filter, unchecked
```

### A second model.yml opens a second tab

```
Given the diagram for models/core/schema.yml is open
When the user opens models/marts/schema.yml and clicks "Open dbt Diagram"
Then a second diagram tab opens, scoped to models/marts/schema.yml
And the first tab is still open and unchanged
And each tab has its own filter selection and sidebar state
```

### Re-opening the same model.yml just focuses its tab

```
Given the diagram for models/core/schema.yml is open
And the user has additionally checked models/marts/schema.yml in that tab
When the user clicks "Open dbt Diagram" on models/core/schema.yml again
Then no new tab is created
And that tab is revealed with its filter selection untouched
```

### Widening a scoped diagram

```
Given a diagram scoped to models/core/schema.yml
When the user checks models/marts/schema.yml in the filter
Then that file's models appear on the canvas
And FK edges between the two files' models are drawn
```

### Saved diagrams open in their own tabs

```
Given a workspace with orders.dbtiagram.yml and finance.dbtiagram.yml
And the user opened orders.dbtiagram.yml as a diagram
When the user opens finance.dbtiagram.yml from the editor title bar
Then a second diagram tab opens titled "finance — dbt Diagram"
And it shows exactly finance's tables at their stored positions
And the orders diagram tab is still open and unchanged
When the user opens orders.dbtiagram.yml again
Then its existing tab is revealed and its layout re-read from disk
```

### Saved diagrams and the palette are not file-scoped

```
Given a saved diagram is opened from a .dbtiagram.yml file
Then its visible tables are exactly the layout's tables, with no file scoping
Given the diagram is opened from the command palette with no file-backed editor
Then every model.yml file is checked, as it is today
```

### Tabs are independent

```
Given two diagram tabs are open
When the user closes one
Then the other keeps rendering, keeps receiving live model.yml updates,
  and keeps writing back to its own layout file
When the user drags a table in one saved diagram
Then only that diagram's layout file is rewritten
```

### A model edit in one tab updates the others

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
Then the tab title becomes "order-marts — dbt Diagram"
And opening order-marts.dbtiagram.yml from the editor title bar reveals that
  same tab instead of opening a new one
```

## Acceptance Criteria

- [ ] Opening a diagram for a source with no open tab creates a new tab; opening
      one that already has a tab reveals it.
- [ ] Diagram identity is the originating file path (model.yml or
      .dbtiagram.yml); palette invocations without a file-backed editor always
      open a new tab.
- [ ] Opening a second `.dbtiagram.yml` never replaces the content of an already
      open diagram tab.
- [ ] A tab opened from a `model.yml` starts with only that file checked in the
      file filter; revealing an existing tab never re-scopes it; layout- and
      palette-opened tabs keep their existing defaults.
- [ ] Checking further files in a scoped tab widens it normally, edges included.
- [ ] Tab titles distinguish open diagrams by layout name or file base name.
- [ ] Diagram tabs open split to the right (`ViewColumn.Beside`).
- [ ] Each tab owns its watchers, model store, filter/sidebar state, and active
      layout; closing one does not affect the others.
- [ ] A `model.yml` edit made in one tab is reflected in every other open tab
      through the existing watcher path, with no layout loss.
- [ ] Saving a previously unsaved diagram re-keys and re-titles its tab.
- [ ] Opening a saved diagram never truncates its layout file before the canvas
      has rendered.
- [ ] `src/webview/panelKey.ts` is pure (no `vscode` import) and covered by
      sub-second Vitest unit tests.
- [ ] `npm test` and `npm run typecheck` pass; `src/dbt/*` and `src/diagram/*`
      are unchanged.

## Confirm at Approval

- **(a) Supersedes spec 13 (h).** Spec 13's "single active layout" becomes "one
  tab per layout file". Spec 13 stays `done`; this spec records the override.
- **(b) Placement.** *(Confirmed.)* Diagram tabs always open with
  `ViewColumn.Beside` — split, to the right of the source file. Further diagrams
  join that right-hand group as sibling tabs.
- **(c) Two tabs claiming one layout file.** *(Confirmed as specced.)* If an
  unsaved diagram is saved over a path another open tab already owns, both tabs
  stay open and both write to that file (last write wins).
- **(d) No restore across restarts.** *(Confirmed as specced.)* Diagram tabs
  disappear on VS Code reload (no `WebviewPanelSerializer`), same as today.

## Amendments

- **Title order flipped (post spec 23).** The distinguishing name now comes
  first (`<name> — dbt Diagram`, was `dbt Diagram — <name>`), so it is what's
  visible in a narrow tab, the OS taskbar, or Alt-Tab — this matters more once
  spec 23 lets diagrams open in their own separate window.
- **(b) superseded.** Placement is no longer always `ViewColumn.Beside`; spec
  23's `dbtiagram.openBehavior` setting governs it (`splitTab` remains the
  default, matching this note's original intent).
