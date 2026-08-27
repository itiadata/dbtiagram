---
id: 15
title: Locate a model from the sidebar list
status: approved
priority: medium
created: 2026-08-27
owner: unassigned
depends_on: [05, 06, 11]
---

# Locate a model from the sidebar list

## Summary

As a dbt developer working with a large diagram, I want to **right-click a model
in the left sidebar's model list** and get two actions:

- **Reveal in diagram** — the canvas pans/zooms to that table, and the table
  becomes the selected node (so the details sidebar shows its properties).
- **Open in model.yml** — VS Code opens the `model.yml` file that defines the
  model and puts the cursor on (and highlights) the line where the model is
  declared.

## Background

Spec 05 added the left filter sidebar with a "Models" list; spec 11 made it
collapsible/resizable; spec 06 added the details sidebar and the selection model
(`selectedTable` / `selectedColumn`) that a "reveal" action can reuse. Today the
model list only offers a visibility checkbox — there is no way to jump from a
name in the list to the node on the canvas, and no way at all to jump to the YAML
that defines it.

The diagram already knows, per model file, which models it defines
(`DiagramModelFile.models` in `src/shared/protocol.ts`), so the webview does not
need any new data to identify the owning file. It does need the extension host to
locate the declaration **line**, which today is not tracked: `parseModelYml`
returns structure only.

## Scope

- **A context menu on each row of the sidebar's "Models" list**, opened by
  right-click (and by a keyboard-accessible "more" affordance, see
  Implementation Notes §3), containing exactly:
  - `Reveal in diagram` — **disabled** when the model is unchecked (hidden), with
    the tooltip "Model is hidden by the filter"
  - `Open in model.yml`
- **A context menu on each table node in the diagram**, opened by right-click,
  containing `Open in model.yml` (the same action). "Reveal in diagram" is
  omitted there — the node is already on screen.
- **Reveal in diagram**: centers the viewport on the table's node at a readable
  zoom, selects it, and reveals the details sidebar (reusing spec 11 §4's
  auto-reveal). The action is only available for models that are currently
  visible; it never changes the filter selection and therefore never writes to
  an active layout file.
- **Open in model.yml**: the host resolves the model to its defining file, opens
  that document in an editor column beside the diagram, moves the cursor to the
  model's `- name: <model>` line, selects that line, and scrolls it into view
  with `TextEditorRevealType.InCenterIfOutsideViewport`.
- **A pure declaration locator** (`src/dbt/locate.ts`) that maps
  `(file text, model name)` to a zero-based line/column, using the `yaml`
  package's node ranges rather than a regex, so anchors, comments, and quoting
  styles are handled correctly.
- **Graceful degradation**: if the model cannot be located in the file text
  (unexpected structure, file changed on disk), the file is still opened, the
  cursor goes to line 0, and a warning message names the model.

### Out of scope

- A context menu on the **"Model yml files"** list rows.
- Locating a **column** (as opposed to a model) in the YAML.
- Search/filter-as-you-type in the model list.
- Any change to how the diagram is filtered, laid out, or persisted.
- Reveal animation tuning beyond React Flow's built-in `setCenter` duration.

## Implementation Notes

### 1. Pure locator (`src/dbt/locate.ts`)

MUST NOT import `vscode`.

```ts
export interface DeclarationPosition {
  /** Zero-based line of the model's `- name: <model>` entry. */
  line: number;
  /** Zero-based column where the model name starts. */
  column: number;
  /** Length of the model name token as written in the file. */
  length: number;
}

export function findModelDeclaration(
  text: string,
  modelName: string,
): DeclarationPosition | null;
```

Implementation: `parseDocument(text)` from the `yaml` package, walk
`models` → sequence items → the `name` scalar, compare its value to
`modelName`, and convert the scalar's `range[0]` offset to line/column with a
`LineCounter` passed to `parseDocument`. Returns `null` when the document is not
a mapping, has no `models` sequence, or contains no entry with that name.
Malformed YAML returns `null` rather than throwing.

### 2. Protocol (`src/shared/protocol.ts`)

Additive only:

- To extension: `{ type: 'model:openSource'; model: string }` — the
  "Open in model.yml" action. The host resolves the owning file from its own
  `ModelStore`, so the webview does not need to send a path.

"Reveal in diagram" is entirely webview-internal and needs **no** message.

### 3. Context menus (`webview-ui/ContextMenu.tsx`, `FilterSidebar.tsx`, `DiagramCanvas`)

A single reusable `ContextMenu` component is introduced here and reused by
feature 16 for the canvas and note menus:

- Props: `x`, `y` (viewport coordinates), `items: ContextMenuItem[]`, `onClose`.
- `ContextMenuItem = { label: string; disabled?: boolean; checked?: boolean;
  title?: string; onSelect: () => void }`.
- Renders an absolutely positioned `<ul role="menu">` in a portal at the app
  root, flipped when it would overflow the window edge; dismissed on `Escape`,
  on outside `pointerdown`, and on scroll. Disabled items are not selectable and
  render with reduced opacity plus their `title` tooltip. Styled with the VS
  Code theme variables already used in `styles.css` (`.context-menu`).

Sidebar wiring (`FilterSidebar.tsx`):

- Each `<li>` in the Models list gets `onContextMenu` (which calls
  `preventDefault()`) plus a small always-rendered "⋯" button that appears on
  hover/focus, so the menu is reachable without a mouse.
- New props: `onRevealModel: (name: string) => void` and
  `onOpenModelSource: (name: string) => void`. `Reveal in diagram` is passed
  `disabled: !selectedModels.has(name)`.

Canvas wiring (`DiagramCanvas`):

- `onNodeContextMenu` filtered to `node.type === 'table'` calls
  `preventDefault()` and opens the same `ContextMenu` with a single
  `Open in model.yml` item for `node.id`.

### 4. Reveal in the canvas (`webview-ui/App.tsx`, `DiagramCanvas`)

- `revealModel(name)` (only reachable for visible models):
  1. Set `selectedTable` to `name` and clear `selectedColumn`; call
     `setDetailsVisible(true)`.
  2. Bump a `revealTarget` state `{ name, tick }`. `DiagramCanvas` watches it in
     an effect, looks the node up with `getNode(name)`, and calls
     `setCenter(node.position.x + width / 2, node.position.y + height / 2,
     { zoom: Math.max(currentZoom, 0.8), duration: 300 })`.
  3. If the node has not been measured yet, the effect retries on the next node
     array change, keyed on `revealTarget.tick`, and gives up once the node
     array settles without it.
- The `tick` counter makes "reveal the same model twice in a row" work.
- Selection highlight is the existing selected-node styling from spec 06; no new
  visual state is introduced.

### 5. Opening the source (`src/webview/panel.ts` + `src/vscode/project.ts`)

- `panel.ts` handles `model:openSource`:
  1. Find the `ModelFileRecord` whose `file.models` contains the name. If none,
     post `diagram:error` (`Model "x" is no longer defined in any model.yml`)
     and stop.
  2. `const text = await readFileText(uri)` and
     `const pos = findModelDeclaration(text, name)`.
  3. Delegate to a new wrapper `revealInEditor(uri, pos)` in
     `src/vscode/project.ts`, which does `showTextDocument(doc, { viewColumn:
     ViewColumn.Beside, preserveFocus: false, preview: true })`, sets
     `editor.selection` to the model-name range (or `0,0` when `pos` is null),
     and calls `editor.revealRange(..., InCenterIfOutsideViewport)`.
  4. When `pos` is null, also
     `window.showWarningMessage('Could not locate "x" in <file>; opened the file
     at the top.')`.
- Reading from disk (rather than from the in-memory store) guarantees the line
  numbers match what the editor will show.

### 6. Tests

- `test/unit/dbt/locate.test.ts`: finds the first model, a middle model, and the
  last model in a multi-model file with the correct zero-based line/column and
  length; handles single-quoted, double-quoted, and plain scalars; handles
  `models:` entries with keys before `name:`; returns `null` for an unknown
  model, for a file with no `models` key, for a non-mapping root, and for
  malformed YAML; column points at the name, not at the `-` or the `name:` key;
  works with CRLF line endings.
- `test/unit/fixture.test.ts`: every model in `fixtures/sample-dbt/` is locatable
  by `findModelDeclaration` in the file that declares it.
- The webview pieces (menu, reveal) have no unit-test harness in this repo and
  are verified manually, matching spec 11 §7.

## Scenarios

### Revealing a visible model

```
Given the dbt Diagram is open with many tables and the viewport panned away
When the user right-clicks "order_items" in the sidebar's Models list
Then a context menu appears with "Reveal in diagram" and "Open in model.yml"
When the user chooses "Reveal in diagram"
Then the canvas animates to center the order_items table
And the order_items card is selected
And the details sidebar is visible showing order_items properties
```

### Reveal is disabled for a hidden model

```
Given "order_items" is unchecked in the Models list and not on the canvas
When the user right-clicks it
Then the "Reveal in diagram" item is shown disabled
And its tooltip explains that the model is hidden by the filter
And choosing it does nothing and changes no filter state
And "Open in model.yml" is still enabled
```

### Opening the model source from a table node

```
Given the dbt Diagram is open
When the user right-clicks the "orders" table card on the canvas
Then a context menu appears with "Open in model.yml"
When the user chooses it
Then the defining model.yml opens with the orders declaration line revealed
```

### Opening the model source

```
Given the dbt Diagram is open
When the user right-clicks "orders" in the Models list
And chooses "Open in model.yml"
Then models/marts/schema.yml opens in an editor beside the diagram
And the cursor is on the line declaring "- name: orders"
And that model name is selected and scrolled into view
```

### Two models with the same name in different files

```
Given two model.yml files each declare a model named "orders"
When the user chooses "Open in model.yml" for orders
Then the file that the diagram's model list attributes the model to is opened
And its declaration line is revealed
```

### The declaration cannot be located

```
Given a model.yml that the parser accepts but whose declaration line cannot be
  resolved
When the user chooses "Open in model.yml"
Then the file still opens
And the cursor sits at the top of the file
And a warning names the model and the file
```

### The model no longer exists

```
Given a model was deleted from disk after the diagram was rendered
When the user chooses "Open in model.yml" for it
Then no editor is opened
And the diagram reports that the model is no longer defined in any model.yml
```

### The menu is dismissible and keyboard reachable

```
Given the model context menu is open
When the user presses Escape, clicks elsewhere, or scrolls the list
Then the menu closes without performing any action
And the same menu can be opened from the row's "⋯" button via the keyboard
```

## Acceptance Criteria

- [ ] Right-clicking a row in the sidebar's Models list opens a context menu with
      exactly "Reveal in diagram" and "Open in model.yml"; the menu is also
      reachable from a per-row button for keyboard users, and closes on Escape,
      outside click, and scroll.
- [ ] "Reveal in diagram" is disabled (with an explanatory tooltip) for a model
      hidden by the filter, and never alters filter state or the active layout
      file.
- [ ] "Reveal in diagram" centers the viewport on the table, selects it, and
      reveals the details sidebar.
- [ ] Right-clicking a table node on the canvas offers "Open in model.yml" with
      the same behavior.
- [ ] A reusable `ContextMenu` component supports disabled and checkable items so
      feature 16 can reuse it.
- [ ] "Open in model.yml" opens the defining file beside the diagram with the
      cursor on and the model name selected at its declaration line.
- [ ] A model that cannot be located still opens its file at line 0 with a
      warning; a model that no longer exists reports a readable error and opens
      nothing.
- [ ] `src/dbt/locate.ts` is pure (no `vscode` import), handles quoted scalars
      and CRLF, returns `null` instead of throwing, and is covered by sub-second
      Vitest unit tests.
- [ ] All VS Code editor access lives in `src/vscode/project.ts`.
- [ ] `npm test` and `npm run typecheck` pass; existing behavior is unchanged.

## Confirm at Approval

- **(a) Hidden models.** *(Confirmed.)* "Reveal in diagram" is greyed out for a
  model that the filter hides; it never auto-checks a model and never triggers a
  layout-file write.
- **(b) Editor column.** The `model.yml` opens in `ViewColumn.Beside` as a
  preview tab with focus moved to it. Say if you prefer the same column, a
  non-preview tab, or `preserveFocus: true`.
- **(c) Diagram-node context menu.** *(Confirmed.)* Right-clicking a table node
  offers "Open in model.yml". The reusable `ContextMenu` component lives in this
  feature and feature 16 reuses it, so 15 lands before 16.
- **(d) Reveal zoom.** Reveal centers at `max(current zoom, 0.8)` and never zooms
  out. Confirm, or give a fixed zoom.
- **(e) Menu labels.** "Reveal in diagram" / "Open in model.yml". Say if you
  prefer "Locate in diagram" / "Locate in model.yml".
