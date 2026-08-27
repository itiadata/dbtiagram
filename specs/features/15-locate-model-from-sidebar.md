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

As a dbt developer working with a large diagram, I want to right-click a model in
the left sidebar's model list and get two actions — **Reveal in diagram**, which
pans and zooms the canvas to that table and selects it, and **Open in model.yml**,
which opens the file that declares the model with the cursor on its declaration
line — so that I can navigate between a big diagram, its models, and their YAML
without hunting.

## Background

Spec 05 added the left filter sidebar with a "Models" list; spec 11 made it
collapsible and resizable; spec 06 added the details sidebar and the
selection model that a "reveal" action can reuse. Today the model list offers
only a visibility checkbox — there is no way to jump from a name in the list to
the node on the canvas, and no way at all to jump to the YAML that defines it.

The webview already knows, per model file, which models it defines
(`DiagramModelFile.models` in `src/shared/protocol.ts`), so no new data is needed
to identify the owning file. What is missing is the declaration **line**:
`parseModelYml` returns structure only and discards positions.

## Scope

**In scope**

- A context menu on each row of the sidebar's "Models" list, opened by
  right-click and by a keyboard-reachable per-row "⋯" button, containing exactly
  `Reveal in diagram` (disabled when the model is hidden by the filter) and
  `Open in model.yml`.
- A context menu on each table node in the diagram containing `Open in model.yml`.
- **Reveal in diagram**: centers the viewport on the table's node at a readable
  zoom, selects it, and reveals the details sidebar. Never changes filter state
  and therefore never writes to an active layout file.
- **Open in model.yml**: the host resolves the model to its defining file,
  reuses the editor tab already showing that file when there is one (focusing
  its group) and otherwise opens it beside the diagram, then selects the model
  name at its declaration and scrolls it into view.
- A pure declaration locator (`src/dbt/locate.ts`) mapping (file text, model
  name) to a zero-based line/column/length using the `yaml` package's node
  ranges rather than a regex.
- A reusable `ContextMenu` component (with disabled and checkable item support)
  that feature 16 also uses.
- Graceful degradation when the declaration cannot be located, and a readable
  error when the model no longer exists.

**Out of scope**

- A context menu on the "Model yml files" list rows.
- Locating a **column** (as opposed to a model) in the YAML.
- Search/filter-as-you-type changes in the model list.
- Any change to how the diagram is filtered, laid out, or persisted.
- Reveal animation tuning beyond React Flow's built-in `setCenter` duration.

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

### Opening the model source from the sidebar

```
Given the dbt Diagram is open
When the user right-clicks "orders" in the Models list
And chooses "Open in model.yml"
Then the defining model.yml opens in an editor beside the diagram
And the cursor is on the line declaring "- name: orders"
And that model name is selected and scrolled into view
```

### The model.yml is already open in a tab

```
Given the model.yml declaring "orders" is already open in an editor tab
When the user chooses "Open in model.yml" for orders
Then no second tab is opened for that file
And the existing tab is focused in the group it already lives in
And the cursor moves to the orders declaration line, scrolled into view
```

### Two models with the same name in different files

```
Given two model.yml files each declare a model named "orders"
When the user chooses "Open in model.yml" for orders
Then the first file in store order that declares it is opened
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

### The menu is dismissible, keyboard reachable, and stays on screen

```
Given the model context menu is open
When the user presses Escape, clicks elsewhere, or scrolls the list
Then the menu closes without performing any action
And the same menu can be opened from the row's "⋯" button via the keyboard
And a menu opened near the right or bottom edge flips so it stays fully visible
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/locate.ts` | create | Pure locator mapping (model.yml text, model name) → zero-based declaration position. |
| `src/webview/openSource.ts` | create | Pure orchestration of "Open in model.yml" against a small host port: resolve file → read → locate → reveal / warn / error. |
| `src/shared/protocol.ts` | modify | Add the `model:openSource` message to `MessageToExtension`. |
| `src/vscode/project.ts` | modify | Add `revealInEditor` — the only VS Code editor touch point. |
| `src/webview/panel.ts` | modify | Handle `model:openSource` by delegating to `openModelSource` with a host adapter. |
| `webview-ui/context-menu-position.ts` | create | Pure viewport-flip/clamp geometry for the context menu. |
| `webview-ui/ContextMenu.tsx` | create | Reusable portal-rendered context menu with disabled and checkable items. |
| `webview-ui/hooks/useContextMenu.ts` | create | Open/close state for the context menu (point + items), shared by sidebar and canvas. |
| `webview-ui/hooks/useRevealModel.ts` | create | `revealTarget` state and the `revealModel` callback, keeping `App.tsx` under the size cap. |
| `webview-ui/FilterSidebar.tsx` | modify | Per-row `onContextMenu` and "⋯" button in the Models list. |
| `webview-ui/DiagramCanvas.tsx` | modify | `onNodeContextMenu` prop for table nodes; `revealTarget` prop and the `setCenter` effect. |
| `webview-ui/App.tsx` | modify | Wire the menu, reveal, and `model:openSource` post. |
| `webview-ui/styles.css` | modify | `.context-menu` rules and the per-row "⋯" affordance. |
| `test/unit/dbt/locate.test.ts` | create | Unit tests for `findModelDeclaration`. |
| `test/unit/webview/openSource.test.ts` | create | Unit tests for `openModelSource` against a fake host. |
| `test/unit/webview/contextMenuPosition.test.ts` | create | Unit tests for `placeMenu`. |
| `test/unit/fixture.test.ts` | modify | Assert every fixture model is locatable in its own file. |
| `specs/ARCHITECTURE.md` | modify | Add rows for the new modules. |

### Signatures

```ts
// src/dbt/locate.ts  (pure — must not import `vscode`)
export interface DeclarationPosition {
  /** Zero-based line of the model's `name:` entry. */
  line: number;
  /** Zero-based column where the model name token starts. */
  column: number;
  /** Length of the model name token as written, including any quotes. */
  length: number;
}

export function findModelDeclaration(
  text: string,
  modelName: string,
): DeclarationPosition | null;
```

```ts
// src/webview/openSource.ts  (pure — must not import `vscode`)
import type { DeclarationPosition } from '../dbt/locate';

export interface OpenSourceHost {
  /** fsPath of the first stored file declaring `model`, or undefined. */
  findModelFile(model: string): string | undefined;
  readFileText(fsPath: string): Promise<string>;
  reveal(fsPath: string, position: DeclarationPosition | null): Promise<void>;
  showWarning(message: string): void;
  postError(message: string): void;
}

export async function openModelSource(host: OpenSourceHost, model: string): Promise<void>;
```

```ts
// src/shared/protocol.ts  (shared)
// added to the MessageToExtension union:
//   | { type: 'model:openSource'; model: string }
```

```ts
// src/vscode/project.ts  (vscode-facing)
import type { DeclarationPosition } from '../dbt/locate';

export async function revealInEditor(
  uri: vscode.Uri,
  position: DeclarationPosition | null,
): Promise<void>;
```

```ts
// webview-ui/context-menu-position.ts  (webview — pure, no React)
export interface MenuBox { width: number; height: number }
export interface MenuPoint { x: number; y: number }
export interface MenuPlacement { left: number; top: number }

export function placeMenu(
  point: MenuPoint,
  menu: MenuBox,
  viewport: MenuBox,
  margin?: number, // default 4
): MenuPlacement;
```

```ts
// webview-ui/ContextMenu.tsx  (webview)
export interface ContextMenuItem {
  label: string;
  disabled?: boolean;
  checked?: boolean;
  title?: string;
  onSelect: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps): JSX.Element | null;
```

```ts
// webview-ui/hooks/useContextMenu.ts  (webview)
import type { ContextMenuItem } from '../ContextMenu';

export interface ContextMenuState {
  menu: { x: number; y: number; items: ContextMenuItem[] } | null;
  openMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}

export function useContextMenu(): ContextMenuState;
```

```ts
// webview-ui/hooks/useRevealModel.ts  (webview)
export interface RevealTarget { name: string; tick: number }

export interface RevealModelState {
  revealTarget: RevealTarget | null;
  revealModel: (name: string) => void;
}

/** `onRevealed` selects the table and shows the details sidebar. */
export function useRevealModel(onRevealed: (name: string) => void): RevealModelState;
```

```ts
// webview-ui/DiagramCanvas.tsx  (webview) — added props
//   onNodeContextMenu: (event: ReactMouseEvent, node: Node) => void;
//   revealTarget: RevealTarget | null;
```

### Behavior notes

- **Locator.** Use `parseDocument(text, { lineCounter })` with a `LineCounter`
  from the `yaml` package. Walk root mapping → `models` → sequence items → the
  `name` scalar; compare `String(scalar.value)` to `modelName`. Convert
  `scalar.range[0]` with `lineCounter.linePos(offset)`, which is **one**-based,
  to zero-based by subtracting 1 from both `line` and `col`. `length` is
  `scalar.range[1] - scalar.range[0]`, so a quoted name selects its quotes too.
  Return the **first** match in file order.
- The locator returns `null` — never throws — when: the document has errors, the
  root is not a mapping, `models` is missing or not a sequence, an item is not a
  mapping, no item has a matching `name`, or the scalar has no range. Wrap the
  whole body in `try/catch` returning `null`. (Scenario: *The declaration cannot
  be located*.)
- CRLF text yields the same line/column as LF text, because `LineCounter` counts
  `\n` line breaks and the column is measured from the line start.
- **`openModelSource` ordering** (each step short-circuits):
  1. `findModelFile(model)` → `undefined` ⇒ `postError('Model "<model>" is no
     longer defined in any model.yml')` and return, with **no** `reveal` call.
  2. `readFileText` throws ⇒ `postError('Could not read <fsPath>')` and return,
     with no `reveal` call.
  3. `findModelDeclaration(text, model)` → position or `null`; call
     `reveal(fsPath, position)` in both cases.
  4. When the position is `null`, additionally
     `showWarning('Could not locate "<model>" in <fsPath>; opened the file at the
     top.')` **after** `reveal` resolves.
- Reading from **disk** (not from the in-memory store) guarantees the line
  numbers match what the editor will show.
- The panel's `findModelFile` scans `this.store.records` in store order and
  returns the first record whose `file.models` contains the name — this is the
  documented resolution for duplicate model names. (Scenario: *Two models with
  the same name*.)
- **`revealInEditor`** does `openTextDocument(uri)` then `showTextDocument`. It
  first looks for a tab already showing that file, so the action never spawns a
  duplicate tab:
  - a matching entry in `vscode.window.visibleTextEditors`, or failing that a
    matching `TabInputText` tab in `vscode.window.tabGroups.all`, supplies the
    `viewColumn` to reuse, and the document opens there with `preview: false`
    (an already-open tab must not be demoted to a preview tab);
  - with no such tab it falls back to `{ viewColumn: ViewColumn.Beside,
    preview: true }` as before.
  Both paths use `preserveFocus: false`. With a position it sets
  `editor.selection` to `new Selection(line, column, line, column + length)`;
  with `null` it sets `new Selection(0, 0, 0, 0)`. It then calls
  `editor.revealRange(selection, TextEditorRevealType.InCenterIfOutsideViewport)`.
  (Scenario: *The model.yml is already open in a tab*.)
- **`placeMenu`** prefers `left = point.x`, `top = point.y`. If
  `point.x + menu.width > viewport.width - margin` it flips to
  `point.x - menu.width`; likewise vertically. Both results are finally clamped
  to `>= margin`. Default `margin` is `4`.
- **`ContextMenu`** renders `createPortal(<ul role="menu">, document.body)` with
  `position: fixed` at the placement from `placeMenu`, measuring itself with a
  ref after the first paint. It closes on `Escape` (keydown on `window`), on
  `pointerdown` outside the menu, and on `scroll` (capture phase, `window`).
  Disabled items render `aria-disabled="true"`, have no `onClick`, and carry
  their `title`. Checkable items render a leading `✓` when `checked` is true.
  Selecting an enabled item calls `onSelect()` then `onClose()`.
- **Sidebar rows.** Each Models `<li>` gets `onContextMenu` (calling
  `preventDefault()`) and a `<button className="sidebar__more" aria-label="Actions
  for <name>">⋯</button>` that opens the same menu from its bounding rect's
  bottom-left. New `FilterSidebar` props: `onRevealModel: (name: string) => void`,
  `onOpenModelSource: (name: string) => void`. The `Reveal in diagram` item is
  built with `disabled: !selectedModels.has(name)` and
  `title: 'Model is hidden by the filter'`. (Scenario: *Reveal is disabled*.)
- **Menu labels are exactly** `Reveal in diagram` and `Open in model.yml`.
- **Canvas menu.** `onNodeContextMenu` calls `event.preventDefault()` and, only
  when `node.type === 'table'`, opens the menu with the single
  `Open in model.yml` item for `node.id`.
- **Reveal.** `revealModel(name)` calls `onRevealed(name)` (which sets the table
  selection and `setDetailsVisible(true)`) and bumps
  `revealTarget = { name, tick: tick + 1 }`. The `tick` makes revealing the same
  model twice in a row work. `DiagramCanvas` watches `revealTarget` in an effect
  keyed on `[revealTarget, rfNodes]`: it looks the node up in `rfNodes`, and when
  found calls `setCenter(node.position.x + (node.width ?? NODE_WIDTH) / 2,
  node.position.y + (node.height ?? HEADER_HEIGHT) / 2,
  { zoom: Math.max(getZoom(), 0.8), duration: 300 })`. When the node is absent
  the effect does nothing and re-runs on the next `rfNodes` change.
- Reveal never mutates filter selection, never posts a message, and therefore
  never triggers a layout-file write.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/locate.test.ts` | `finds the first model` | `"version: 2\nmodels:\n  - name: orders\n    description: Orders\n  - name: order_items\n    columns:\n      - name: id\n"`, `'orders'` | `{ line: 2, column: 10, length: 6 }` |
| `test/unit/dbt/locate.test.ts` | `finds a later model, not its columns` | same text, `'order_items'` | `{ line: 4, column: 10, length: 11 }` |
| `test/unit/dbt/locate.test.ts` | `includes single quotes in the token` | `"models:\n  - name: 'orders'\n"`, `'orders'` | `{ line: 1, column: 10, length: 8 }` |
| `test/unit/dbt/locate.test.ts` | `includes double quotes in the token` | `"models:\n  - name: \"orders\"\n"`, `'orders'` | `{ line: 1, column: 10, length: 8 }` |
| `test/unit/dbt/locate.test.ts` | `handles keys written before name` | `"models:\n  - description: Orders table\n    name: orders\n"`, `'orders'` | `{ line: 2, column: 10, length: 6 }` |
| `test/unit/dbt/locate.test.ts` | `handles CRLF line endings` | `"version: 2\r\nmodels:\r\n  - name: orders\r\n"`, `'orders'` | `{ line: 2, column: 10, length: 6 }` |
| `test/unit/dbt/locate.test.ts` | `returns null for an unknown model` | first text, `'ghost'` | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null when there is no models key` | `"version: 2\nsources: []\n"`, `'orders'` | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null when models is not a sequence` | `"models: orders\n"`, `'orders'` | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null for a non-mapping root` | `"- a\n- b\n"`, `'orders'` | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null for malformed YAML instead of throwing` | `"models:\n  - name: [unclosed\n"`, `'orders'` | `null` |
| `test/unit/webview/openSource.test.ts` | `reveals the located declaration` | host with `findModelFile → '/w/models/orders.yml'` and text `"models:\n  - name: orders\n"`, model `'orders'` | `reveal` called once with `('/w/models/orders.yml', { line: 1, column: 10, length: 6 })`; no warning; no error |
| `test/unit/webview/openSource.test.ts` | `opens at the top and warns when the declaration is not found` | same host, text `"version: 2\n"`, model `'orders'` | `reveal` called with `('/w/models/orders.yml', null)`; warning `Could not locate "orders" in /w/models/orders.yml; opened the file at the top.` |
| `test/unit/webview/openSource.test.ts` | `reports a model that no longer exists` | `findModelFile → undefined`, model `'ghost'` | `reveal` not called; error `Model "ghost" is no longer defined in any model.yml` |
| `test/unit/webview/openSource.test.ts` | `reports an unreadable file` | `readFileText` rejects, model `'orders'` | `reveal` not called; error `Could not read /w/models/orders.yml` |
| `test/unit/webview/openSource.test.ts` | `resolves duplicates to the first file in store order` | `findModelFile` returns `/w/a.yml` for two files declaring `orders` | `reveal` called with `/w/a.yml` |
| `test/unit/webview/contextMenuPosition.test.ts` | `places the menu at the point when it fits` | `({x:10,y:10},{width:200,height:120},{width:800,height:600})` | `{ left: 10, top: 10 }` |
| `test/unit/webview/contextMenuPosition.test.ts` | `flips horizontally near the right edge` | `({x:700,y:10},{width:200,height:120},{width:800,height:600})` | `{ left: 500, top: 10 }` |
| `test/unit/webview/contextMenuPosition.test.ts` | `flips vertically near the bottom edge` | `({x:10,y:550},{width:200,height:120},{width:800,height:600})` | `{ left: 10, top: 430 }` |
| `test/unit/webview/contextMenuPosition.test.ts` | `clamps to the margin when the menu cannot fit` | `({x:5,y:5},{width:200,height:120},{width:100,height:100})` | `{ left: 4, top: 4 }` |
| `test/unit/fixture.test.ts` | `every fixture model is locatable in its own file` | each `models/**/*.yml` in `fixtures/sample-dbt` | `findModelDeclaration(text, name)` is non-null for every model, and the text of that line contains the model name |

Scenario coverage: *Revealing a visible model*, *Reveal is disabled*, *Opening
from a table node*, and the keyboard/dismiss half of *The menu is dismissible*
have no unit-test harness in this repo (React webview, matching spec 11) and are
verified in the Manual Verify step; the flip half of that scenario is covered by
`contextMenuPosition.test.ts`. All remaining scenarios map to the rows above.

### Verification

1. `npm run verify` — typecheck + unit suites, must be green.
2. `npm test` — before the commit, must be green.
3. Manual (F5 on `fixtures/sample-dbt`): right-click a model row and a table
   card, exercise both actions and both failure paths.

### Do not touch

- `src/dbt/parse.ts`, `src/dbt/serialize.ts`, `src/dbt/edit/*` — this feature
  never mutates a model.yml; the locator is read-only and separate.
- `src/diagram/layoutFile.ts` and `src/webview/layoutMessages.ts` — reveal must
  not touch layout persistence.
- `src/shared/filter.ts` and `webview-ui/hooks/useDiagramFilter.ts` — reveal
  never alters filter state.
- Existing `DiagramCanvas` behavior: the adopt/fit effect, `routeEdges`, and the
  positions-report effect stay as they are; the reveal effect is additive.
- The existing `MessageToWebview` union — this feature adds to
  `MessageToExtension` only.

## Acceptance Criteria

- [ ] Right-clicking a row in the sidebar's Models list opens a context menu with
      exactly "Reveal in diagram" and "Open in model.yml"; the menu is also
      reachable from a per-row "⋯" button, and closes on Escape, outside
      pointerdown, and scroll.
- [ ] "Reveal in diagram" is disabled with the tooltip "Model is hidden by the
      filter" for a filtered-out model, and never alters filter state or the
      active layout file.
- [ ] "Reveal in diagram" centers the viewport on the table, selects it, and
      reveals the details sidebar.
- [ ] Right-clicking a table node on the canvas offers "Open in model.yml" with
      the same behavior.
- [ ] `ContextMenu` supports disabled and checkable items so feature 16 can reuse
      it, and stays fully on screen near the viewport edges.
- [ ] "Open in model.yml" opens the defining file with the model name selected
      at its declaration line, reusing the tab already showing that file when
      one exists and otherwise opening beside the diagram.
- [ ] A model that cannot be located still opens its file at line 0 with the
      specified warning; a model that no longer exists produces the specified
      error and opens nothing.
- [ ] `src/dbt/locate.ts` and `src/webview/openSource.ts` are pure (no `vscode`
      import) and covered by sub-second Vitest unit tests.
- [ ] All VS Code editor access lives in `src/vscode/project.ts`.
- [ ] `specs/ARCHITECTURE.md` lists every new module.
- [ ] `npm run verify` is green.

## Confirm at Approval

- **(a) Editor column.** A file already open in a tab is reused and focused
  where it is; only a file with no tab opens in `ViewColumn.Beside` as a preview
  tab. Focus moves to the editor in both cases. Say if you prefer the same
  column, a non-preview tab, or `preserveFocus: true`.
- **(b) Reveal zoom.** Reveal centers at `max(current zoom, 0.8)` and never zooms
  out. Confirm, or give a fixed zoom.
- **(c) Menu labels.** "Reveal in diagram" / "Open in model.yml". Say if you
  prefer "Locate in diagram" / "Locate in model.yml".
- **(d) Duplicate model names.** Resolved to the first declaring file in store
  order. Confirm, or ask for a picker.
