---
id: 24
title: Per-table column visibility in the diagram
status: done
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [13, 20]
---

# Per-table column visibility in the diagram

## Summary

As a diagram user, I want to control how many columns each table card shows —
just its name, only its primary key, primary+foreign keys, or every column —
so that large schemas stay readable. I want to set this per table (from the
table's right-click menu or its properties pane) and also set one display mode
for every table at once, including tables added to the diagram later. This is
a diagram-layout concern, not a `model.yml` concern: it is stored per table in
the saved `.dbtiagram.yml` layout file (and held in webview memory before the
diagram is first saved), so it works identically whether the diagram was
opened straight from `model.yml` files or from a saved layout file.

## Background

Spec 13 introduced saved diagram layout files (`DiagramLayout` /
`DiagramLayoutTable`: which tables are visible and where they sit); spec 20
introduced a card-level fallback anchor (`CARD_ANCHOR`) for FK ends that name a
column absent from the model. This feature reuses both mechanisms: the display
mode is a new per-table layout property, and a hidden FK column reuses the
"anchor to the card instead of a row" idea spec 20 already built — but anchored
at the header specifically, and styled as a normal (not broken) connection.

## Scope

**In scope**

- Four per-table display modes: `nameOnly` (header only), `pkOnly` (header +
  primary key columns), `pkAndFk` (header + primary key + foreign key columns),
  `all` (every column — current/default behavior).
- Setting the mode for one table from its diagram right-click menu (a
  submenu) and from its properties pane (a new section between Description
  and Primary key).
- A toolbar control that sets one mode for every table currently in the
  diagram AND for every table added to it later (the diagram's default mode),
  grouped visually with the existing Auto-layout button.
- Persisting both the per-table mode and the diagram-wide default in the
  `.dbtiagram.yml` layout file; holding them in webview memory (same lifecycle
  as unsaved positions) before the diagram is first saved.
- Re-routing an FK edge to the table header, instead of dropping the edge or
  pointing at a hidden row, when the mode hides one of its endpoint columns.
- Restyling the Auto-layout button so it no longer uses the accent/primary
  color, since it is a layout tool, not the primary action.

**Out of scope**

- Any change to `model.yml` files. Display mode is a pure diagram/view
  setting; hiding a column never touches its data.
- Per-column visibility toggles (only the four fixed table-level modes).
- Changing which tables are visible in the diagram (that is the existing file
  filter, spec 05) — this feature only changes how a visible table renders.

## Design decisions (confirmed)

1. **`pkAndFk` column set** includes **both directions**: a table's primary
   key columns, its own FK columns, and any column another table's FK points
   at — because otherwise a child table's own FK column (e.g.
   `orders.customer_id`) would be hidden in `pkAndFk` mode even though it is
   exactly the kind of column that mode is meant to surface.
2. **Toolbar "set all" behavior**: choosing a mode from the toolbar control
   sets the diagram's default AND **clears every table's individual
   override**, so the whole diagram (current and future tables) uses the new
   default uniformly until a table is overridden again individually.

## Scenarios

### Table name only hides every column

```
Given a table "orders" showing all its columns
When the user picks "Table name only" for "orders" from its right-click menu
Then the "orders" card shows only its header, no column rows
And the card's height shrinks to just the header height
```

### Primary keys only

```
Given a table "customers" with primary key column "id" and other columns
When the user sets its display mode to "Primary keys only"
Then the "customers" card shows its header and only the "id" row
```

### Primary + foreign keys

```
Given a table "order_items" whose primary key is "id" and which has an FK
  column "order_id" referencing "orders.id"
When the user sets its display mode to "Primary + foreign keys"
Then the "order_items" card shows "id" and "order_id" but no other column
```

### Hidden FK column reroutes to the header

```
Given "order_items.order_id" is hidden by the table's display mode
And an FK edge connects "order_items.order_id" to "orders.id"
When the diagram renders
Then the edge's "order_items" end attaches to the "order_items" header
And the edge is drawn as a normal (non-broken) connection
```

### Set the display mode for the whole diagram

```
Given a diagram with several tables, some with individual overrides
When the user picks "All columns" from the toolbar's display selector
Then every currently visible table shows all its columns
And every individual table override is cleared
And a table added to the diagram afterwards also shows all its columns
```

### Persisted across save/reopen

```
Given "orders" is set to "Primary keys only" and the diagram default is "All columns"
When the user saves the diagram and reopens the same .dbtiagram.yml file
Then "orders" still shows only its primary key
And every other table still shows all its columns
```

### Table properties pane

```
Given the user selects the "orders" table
When they open its properties pane
Then a "Columns shown" section appears between Description and Primary key
And it shows the four options with the table's current effective mode selected
```

### Auto-layout button is not the primary action

```
Given the diagram canvas
When the user looks at the top-right toolbar
Then the Auto-layout button and the column-display selector are visually
  grouped together
And the Auto-layout button uses a neutral (not accent) color
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/columnDisplay.ts` | create | Pure: `ColumnDisplayMode` type, default, UI option list, `displayedColumns`, mode validation. |
| `src/diagram/graph.ts` | modify | `TableNode` gains `foreignKeyColumns: string[]` (this table's own FK columns ∪ columns any FK points at), computed in `buildDiagram`. |
| `src/diagram/layout.ts` | modify | `layoutDiagram` accepts an optional per-node column-count override so auto-layout sizes cards by their *displayed* column count. |
| `src/diagram/flow.ts` | modify | `buildFlowElements` takes a display-mode lookup, filters `data.columns` per node, and anchors a hidden FK endpoint at a new `HEADER_ANCHOR` pseudo-column (header position, non-broken) instead of the real (missing-from-view) column. `routeEdges` gets the same anchor selection so live dragging keeps it correct. `CARD_ANCHOR`'s existing spec-20 broken-column behavior is unchanged. |
| `src/diagram/layoutFile.ts` | modify | `DiagramLayoutTable.columnDisplay?: ColumnDisplayMode` (per-table override); `DiagramLayout.defaultColumnDisplay?: ColumnDisplayMode` (diagram-wide default); `buildLayout`, `serializeDiagramLayout`, `parseDiagramLayout`, `applyLayout`/`AppliedLayout` updated to carry both, omitted from YAML when at their defaults. |
| `webview-ui/column-display-state.ts` | create | Pure reducer-style helpers: seed from an applied layout, set one table's override, set the diagram default (clearing overrides), resolve a table's effective mode. |
| `webview-ui/hooks/useColumnDisplay.ts` | create | Wraps `column-display-state.ts` as webview state; exposes `effectiveMode(table)`, `setTableMode`, `setDefaultMode`, `applySeed`. |
| `webview-ui/layout-dirty.ts` | modify | `LayoutSnapshot` and `isLayoutDirty` also compare `defaultColumnDisplay` and each table's `columnDisplay`, so a display-only change marks the diagram dirty. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Threads the column-display state into every `buildLayout` call (save, pending-sync, dirty comparison). |
| `webview-ui/ColumnDisplaySection.tsx` | create | The details-pane section: a `<select>` dropdown (matching the toolbar selector) rendered between Description and Primary key. |
| `webview-ui/DetailsSidebar.tsx` | modify | Renders `ColumnDisplaySection` for the table entity; new props for effective mode + change handler. |
| `webview-ui/ContextMenu.tsx` | modify | `ContextMenuItem` gains optional `items?: ContextMenuItem[]` (submenu); a parent item with children opens a flyout on HOVER instead of a click, and the outside-click detector recognizes clicks inside a submenu portal (not just the root menu's own DOM subtree). |
| `webview-ui/context-menu-position.ts` | modify | Reuses/extends `placeMenu` so a submenu flyout is placed relative to its parent item and flips off-screen the same way the root menu does. |
| `webview-ui/DiagramCanvas.tsx` | modify | Top-right `Panel` becomes a grouped toolbar: the Auto-layout button (now a neutral/secondary style) plus a new column-display `<select>` bound to the diagram default. |
| `webview-ui/TableNode.tsx` | modify | Renders the filtered `data.columns` (unchanged rendering code, smaller input array); adds the `HEADER_ANCHOR` handle (header-positioned, default styling, distinct from the red `--broken` one). |
| `webview-ui/App.tsx` | modify | Wires `useColumnDisplay`; passes the per-table mode lookup into `buildFlowElements`/`layoutDiagram`; adds the "Show columns" submenu to the table right-click menu; passes toolbar props to `DiagramCanvas` and section props to `DetailsSidebar`; seeds column-display state from `layout:apply`. |
| `webview-ui/styles.css` | modify | Styles for: the grouped toolbar, the secondary Auto-layout button, the header-anchor handle, and the context-menu submenu flyout. |
| `test/unit/diagram/columnDisplay.test.ts` | create | Unit tests for `displayedColumns` per mode and mode validation. |
| `test/unit/diagram/graph.test.ts` | modify | Adds cases asserting `foreignKeyColumns` on both the referencing and the referenced table. |
| `test/unit/diagram/layout.test.ts` | modify | Adds a case asserting `layoutDiagram` sizes a card by its displayed (not full) column count when a mode lookup is passed. |
| `test/unit/diagram/flow.test.ts` | modify | Adds cases: a hidden (not missing) FK column anchors at `HEADER_ANCHOR` and is not marked `unresolved`; the existing missing-column/`CARD_ANCHOR`/`unresolved` case is asserted unchanged. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Round-trips `columnDisplay`/`defaultColumnDisplay`; asserts both are omitted from serialized YAML at their defaults. |
| `test/unit/webview/columnDisplayState.test.ts` | create | Tests `column-display-state.ts`: seeding, per-table override, and "set default clears overrides". |
| `test/unit/webview/layout-dirty.test.ts` | modify | Adds a case: a display-mode-only change marks the snapshot dirty. |

### Signatures

```ts
// src/diagram/columnDisplay.ts (pure — must not import `vscode`)
export type ColumnDisplayMode = 'nameOnly' | 'pkOnly' | 'pkAndFk' | 'all';
export const DEFAULT_COLUMN_DISPLAY: ColumnDisplayMode;
export interface ColumnDisplayOption { value: ColumnDisplayMode; label: string; }
export const COLUMN_DISPLAY_OPTIONS: readonly ColumnDisplayOption[];
export function isColumnDisplayMode(value: unknown): value is ColumnDisplayMode;
export function displayedColumns(node: TableNode, mode: ColumnDisplayMode): TableNodeColumn[];

// src/diagram/graph.ts (pure)
export interface TableNode {
  // …existing fields…
  /** This table's own FK columns, plus any column another table's FK targets. */
  foreignKeyColumns: string[];
}

// src/diagram/layout.ts (pure)
export function layoutDiagram(
  graph: DiagramGraph,
  displayedColumnCount?: (nodeId: string) => number,
): DiagramLayout;

// src/diagram/flow.ts (pure)
export const HEADER_ANCHOR: string; // '\u0000header', sibling of CARD_ANCHOR
export function buildFlowElements(
  graph: DiagramGraph,
  layout: DiagramLayout,
  columnDisplayMode: (nodeId: string) => ColumnDisplayMode,
): FlowElements;
export function routeEdges(
  edges: readonly FlowEdge[],
  nodeRects: readonly NodeRect[],
  columnIndexOf: ColumnRowIndexLookup,
  columnExists: ColumnRowIndexLookup, // reused shape; non-undefined means "exists in the model, even if hidden"
): RoutedEdgeGeometry;

// src/diagram/layoutFile.ts (pure)
export interface DiagramLayoutTable {
  name: string; x: number; y: number;
  columnDisplay?: ColumnDisplayMode;
}
export interface DiagramLayout {
  version: typeof LAYOUT_VERSION; name: string;
  tables: DiagramLayoutTable[]; notes: DiagramNote[];
  defaultColumnDisplay?: ColumnDisplayMode;
}
export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
  notes?: readonly DiagramNote[],
  columnDisplay?: { default: ColumnDisplayMode; overrides: ReadonlyMap<string, ColumnDisplayMode> },
): DiagramLayout;
export interface AppliedLayout {
  visible: Set<string>; positions: Map<string, NodePosition>; missing: string[]; notes: DiagramNote[];
  defaultColumnDisplay: ColumnDisplayMode;
  columnDisplay: Map<string, ColumnDisplayMode>;
}

// webview-ui/column-display-state.ts (webview, pure)
export interface ColumnDisplayState {
  defaultMode: ColumnDisplayMode;
  overrides: Map<string, ColumnDisplayMode>;
}
export function seedColumnDisplay(defaultMode: ColumnDisplayMode, overrides: Map<string, ColumnDisplayMode>): ColumnDisplayState;
export function setTableOverride(state: ColumnDisplayState, table: string, mode: ColumnDisplayMode): ColumnDisplayState;
export function setDefaultMode(state: ColumnDisplayState, mode: ColumnDisplayMode): ColumnDisplayState; // clears overrides
export function effectiveMode(state: ColumnDisplayState, table: string): ColumnDisplayMode;

// webview-ui/hooks/useColumnDisplay.ts (webview)
export interface ColumnDisplayHookState {
  defaultMode: ColumnDisplayMode;
  effectiveMode: (table: string) => ColumnDisplayMode;
  setTableMode: (table: string, mode: ColumnDisplayMode) => void;
  setDefaultMode: (mode: ColumnDisplayMode) => void;
  applySeed: (defaultMode: ColumnDisplayMode, overrides: Map<string, ColumnDisplayMode>) => void;
  overrides: Map<string, ColumnDisplayMode>;
}
export function useColumnDisplay(): ColumnDisplayHookState;

// webview-ui/ColumnDisplaySection.tsx (webview)
export interface ColumnDisplaySectionProps {
  mode: ColumnDisplayMode;
  onChange: (mode: ColumnDisplayMode) => void;
}
export function ColumnDisplaySection(props: ColumnDisplaySectionProps): JSX.Element;

// webview-ui/ContextMenu.tsx (webview)
export interface ContextMenuItem {
  label: string; disabled?: boolean; checked?: boolean; title?: string;
  onSelect?: () => void; // omitted/ignored when `items` is present
  items?: ContextMenuItem[];
}
```

### Behavior notes

1. **`displayedColumns` per mode** (scenario "Table name only" / "Primary keys
   only" / "Primary + foreign keys"): `nameOnly` → `[]`; `pkOnly` → columns
   whose name is in `node.primaryKey.columns`; `pkAndFk` → columns whose name
   is in `node.primaryKey.columns` OR `node.foreignKeyColumns`, in the node's
   original column order (never re-sorted); `all` → `node.columns` unchanged.
2. **`foreignKeyColumns` computation** (graph.ts): after building every node's
   `foreignKeys`, a second pass over `graph.edges` adds `edge.sourceColumns` to
   the source node's set and `edge.targetColumns` to the target node's set —
   i.e. exactly the columns spec 09's edges attach to. Order: first the
   columns from the node's own declared FKs in declaration order, then any
   additional incoming ones in the order their edges were built; duplicates
   collapse.
3. **Card sizing follows the *displayed* set** (scenario "Table name only"):
   `layoutDiagram`'s per-node height uses `displayedColumnCount(node.id) ??
   node.columns.length` so dagre never reserves row-height for hidden columns.
   `buildFlowElements` must derive each node's `height` in the `FlowNode`
   result from the same displayed count (via the `layout.nodes` placement it
   already receives — no separate computation needed there, since layout was
   already run with the correct height).
4. **Anchor selection is two-tier, not one** (scenario "Hidden FK column
   reroutes to the header" vs. the existing spec-20 "missing column" case):
   for each FK endpoint, first check existence in `node.columns` (unchanged
   spec-20 check) — if absent, anchor is `CARD_ANCHOR` and the edge is
   `unresolved` exactly as before (do not touch this path). Only when the
   column *exists* but `columnIndexOf` (built from the *displayed* columns)
   returns `undefined` does the endpoint anchor at `HEADER_ANCHOR` — and the
   edge is NOT marked `unresolved` and gets no "(missing column: …)" title
   suffix; it keeps its normal title.
5. **`HEADER_ANCHOR` rendering** (TableNode.tsx): mounted the same way as
   `CARD_ANCHOR` (always mounted, all four handle kinds, visibility driven by
   `data.handles`), but with an explicit `style={{ top: HEADER_HEIGHT / 2 }}`
   and no `--broken` class — it looks like an ordinary connection dot, just
   positioned on the header instead of a row.
6. **Toolbar "set all" clears overrides** (scenario "Set the display mode for
   the whole diagram", pending confirmation of open decision 2): `setDefaultMode`
   replaces `overrides` with an empty map. `effectiveMode(table)` is
   `overrides.get(table) ?? defaultMode`, so a table added afterward — never
   present in `overrides` — always reads the current `defaultMode`.
7. **Persistence shape** (scenario "Persisted across save/reopen"):
   `defaultColumnDisplay` is omitted from the serialized YAML when it equals
   `DEFAULT_COLUMN_DISPLAY` ('all'); a table's `columnDisplay` is omitted when
   it equals `undefined` in the `buildLayout` input (i.e., no override — the
   table reads the diagram default). This mirrors the existing `notes: []`
   omission convention in `layoutFile.ts`.
8. **Dirty tracking** (webview): `layout-dirty.ts`'s comparison must include
   `defaultColumnDisplay` and per-table `columnDisplay`, or toggling a display
   mode would silently not offer to save.
9. **Context menu submenu** (scenario n/a — UI mechanics for "table right-click
   menu"): a `ContextMenuItem` with `items` opens an inline flyout `<ul>` on
   HOVER (mouseenter of the row, with a short close delay on mouseleave so the
   pointer can cross the visual gap into the flyout), anchored to that item's
   rect via `placeSubmenu` — the same flip/clamp idea `placeMenu` uses for the
   root menu — instead of invoking `onSelect`. Because a submenu flyout is a
   separate `createPortal` tree (a sibling of the root `<ul>` in
   `document.body`, not a DOM descendant of it), the root menu's
   outside-pointerdown-closes-the-menu detector checks
   `target.closest('.context-menu')` rather than the root `<ul>`'s own `ref`,
   so a click inside an open submenu is recognized as "inside" and does not
   close the menu before the click handler runs. Clicking a leaf item inside
   the submenu behaves exactly like today (`onSelect` then `onClose` of the
   WHOLE menu, submenu included).
10. **Auto-layout button restyle**: a new `.panel-button--secondary` class
    (neutral background using `--card`/`--border`, no `--accent`) replaces the
    default `.panel-button` accent look specifically on the Auto-layout
    button; the Save/Settings buttons elsewhere are untouched.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/columnDisplay.test.ts` | `displayedColumns returns no rows for nameOnly` | node with 3 columns, mode `'nameOnly'` | `[]` |
| `test/unit/diagram/columnDisplay.test.ts` | `displayedColumns returns only PK columns for pkOnly` | node with pk `['id']`, columns `id,name,email` | `[{name:'id',…}]` |
| `test/unit/diagram/columnDisplay.test.ts` | `displayedColumns unions PK and FK columns for pkAndFk` | node pk `['id']`, `foreignKeyColumns: ['customer_id']`, columns `id,customer_id,total` | columns `id`, `customer_id` in original order |
| `test/unit/diagram/columnDisplay.test.ts` | `displayedColumns returns all columns for all` | node with 3 columns, mode `'all'` | all 3, unchanged |
| `test/unit/diagram/graph.test.ts` | `foreignKeyColumns includes own FK columns and incoming target columns` | `orders.customer_id -> customers.id` FK | `orders.foreignKeyColumns` = `['customer_id']`; `customers.foreignKeyColumns` = `['id']` |
| `test/unit/diagram/layout.test.ts` | `layoutDiagram sizes a card by its displayed column count` | 3-column node, `displayedColumnCount` returns 1 | node height equals `nodeHeight(1)`, not `nodeHeight(3)` |
| `test/unit/diagram/flow.test.ts` | `a hidden (existing) FK column anchors at HEADER_ANCHOR and is not unresolved` | edge to a column filtered out by `pkOnly` mode | `sourceHandle` uses `HEADER_ANCHOR`; `edge.data.unresolved` is `undefined` |
| `test/unit/diagram/flow.test.ts` | `a genuinely missing FK column still anchors at CARD_ANCHOR and stays unresolved` | edge naming a column absent from `node.columns` (unchanged spec 20 fixture) | `sourceHandle` uses `CARD_ANCHOR`; `edge.data.unresolved.source === true` (regression guard) |
| `test/unit/diagram/layoutFile.test.ts` | `columnDisplay round-trips through serialize/parse` | table override `pkOnly`, diagram default `pkAndFk` | parsed layout matches input |
| `test/unit/diagram/layoutFile.test.ts` | `defaults are omitted from serialized YAML` | table with no override, diagram default `'all'` | serialized text contains no `columnDisplay` or `defaultColumnDisplay` keys |
| `test/unit/webview/columnDisplayState.test.ts` | `setDefaultMode clears every table override` | overrides `{orders: 'pkOnly'}`, then `setDefaultMode('nameOnly')` | `overrides` is empty; `effectiveMode('orders') === 'nameOnly'` |
| `test/unit/webview/columnDisplayState.test.ts` | `setTableOverride only changes the named table` | default `'all'`, override `orders -> 'pkOnly'` | `effectiveMode('customers') === 'all'`; `effectiveMode('orders') === 'pkOnly'` |
| `test/unit/webview/layout-dirty.test.ts` | `a display-mode-only change is dirty` | saved snapshot with `defaultColumnDisplay: 'all'`, current with `'pkOnly'` | `isLayoutDirty` returns `true` |

### Verification

- `npm run verify` — typecheck + unit suites, must be green after each
  implementation step.
- `npm test` — must be green before the implementing commit.

### Do not touch

- The existing spec-20 "missing column" behavior: `CARD_ANCHOR`, its red
  `--broken` styling, and the `unresolved`/"(missing column: …)" title suffix
  stay byte-identical for a column that is genuinely absent from
  `node.columns` — only the *hidden-but-existing* case is new (`HEADER_ANCHOR`).
- `src/dbt/**` — this feature never reads or writes `model.yml`.
- The file filter (spec 05) and the saved-layout position/notes mechanics
  (spec 13/16/22) beyond the additive fields listed above.
- The Save/Settings header buttons' existing accent styling.

## Acceptance Criteria

- [ ] Each of the four display modes renders the right columns on a table card.
- [ ] The table right-click menu has a "Show columns" submenu with all four
      options and a checkmark on the current one.
- [ ] The properties pane shows a "Columns shown" section between Description
      and Primary key, with the same four options.
- [ ] A toolbar control next to Auto-layout sets the mode for every current
      and future table in the diagram.
- [ ] The Auto-layout button no longer uses the accent/primary color.
- [ ] An FK edge whose endpoint column is hidden by the mode attaches to the
      table header, drawn as a normal (non-broken) connection.
- [ ] Both the per-table mode and the diagram default persist through save and
      reopen of a `.dbtiagram.yml` file, and default silently to "All columns"
      for diagrams saved before this feature.
- [ ] `npm run verify` is green.
