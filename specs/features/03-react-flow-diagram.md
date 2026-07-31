---
id: 03
title: React Flow diagram with automatic layout
status: done
priority: high
created: 2026-07-31
owner: unassigned
depends_on: [02]
---

# React Flow diagram with automatic layout

## Summary

As a dbt developer, I want the diagram rendered by React Flow with tables
arranged automatically by a layout library, and with each foreign key drawn as
per-column edges attached to the exact columns, so that tables never overlap,
FK edges no longer run under unrelated tables, and the canvas gains pan, zoom,
and drag without custom code.

## Background

The webview currently renders hand-rolled SVG. `layoutDiagram` in
`src/diagram/layout.ts` places nodes on a static 4-per-row grid that ignores
graph structure, so long FK edges cross unrelated tables ("lines under tables"),
and it computes custom bundle geometry (fan-in/trunk/fan-out, the
`EdgeBundle`/`BundleSegment` types) — roughly two hundred lines of hand-written
routing logic.

React Flow (`@xyflow/react`, v12) is a rendering and interaction library:
nodes, edges, handles, pan/zoom/drag, and viewport management. It deliberately
ships **no layout engine**; automatic arrangement comes from a companion
library. This spec pairs React Flow with `@dagrejs/dagre` (v3, pure JS, ships
its own TypeScript types) for hierarchical left-to-right arrangement. Per the
decision confirmed with the user, the custom trunked-bundle routing is replaced
by React Flow's built-in `smoothstep` edges, one per FK column pair, so the
library does the routing instead of hand-written geometry.

This spec **supersedes the rendering and routing parts of spec 02**: the
`EdgeBundle`/`BundleSegment` geometry in `src/diagram/layout.ts` and the SVG
renderer in `webview-ui/App.tsx` are removed. Spec 02's parsing/serialization
work (`src/dbt/*`, `src/diagram/graph.ts`) and its hover semantics (edge hover
highlights the involved columns; reverse column hover) are preserved. The
integration smoke tests are unaffected: they only assert panel creation and
command registration, never SVG internals.

## Scope

- Adding `@xyflow/react` and `@dagrejs/dagre` as devDependencies (esbuild
  bundles them into `dist/webview/app.js`).
- Rewriting `src/diagram/layout.ts` to compute node dimensions and
  dagre-based positions only (pure, no `vscode` import); removing all bundle
  geometry.
- New pure module `src/diagram/flow.ts` that maps the graph + layout onto React
  Flow nodes (custom `table` type with per-column handles) and edges (one per
  FK column pair, `smoothstep`).
- Migrating `webview-ui/App.tsx` from SVG to `<ReactFlow>`, with a custom
  `TableNode` component, hover highlighting (spec 02 semantics preserved),
  a floating edge tooltip, and an "Auto-layout" panel button.
- Replacing `.node__*` / `.edge-bundle*` CSS with React Flow themed styles.
- Rewriting `test/unit/diagram/layout.test.ts` and adding
  `test/unit/diagram/flow.test.ts`.
- Keeping the message protocol (`src/shared/protocol.ts`), `src/webview/panel.ts`,
  `src/diagram/graph.ts`, dbt parsing/serialization, fixtures, and the
  integration suite unchanged.

### Out of scope

- ELK / elkjs, d3-hierarchy, force layouts (dagre is the engine; swapping is a
  follow-up).
- Arrowheads on edges (carried over from spec 02).
- Persisting manual node positions across sessions; only the in-session
  "Auto-layout" reset is provided.
- Editing FK constraints through the webview UI (no new edit kinds).
- Minimap, sub-flows, grouping, always-visible edge labels (tooltip on hover
  only).
- Running layout in the extension host (layout stays in the webview, computed
  from the unchanged `diagram:update` payload).

## Implementation Notes

### 1. Dependencies (`package.json` devDependencies)

- `@xyflow/react` `^12.11.2` — peer-requires React >= 17; the repo already
  ships React 18.
- `@dagrejs/dagre` `^3.0.0` — ships its own types (`dist/types/index.d.ts`);
  no `@types/dagre` needed. Classic API is preserved in v3:
  `new dagre.Graph()`, `graph.setGraph({...})`, `graph.setNode`, `graph.setEdge`,
  `dagre.layout(graph)`.

Both go in **devDependencies**, matching the existing `react`/`react-dom`
precedent: esbuild inlines them into the webview bundle, and `vsce package`
must not copy `node_modules` for them into the `.vsix`. No new runtime
dependencies for the extension host.

### 2. Layout (rewrite `src/diagram/layout.ts`) — pure, no `vscode`

Constants (exported so the webview can position handles):

```
NODE_WIDTH     = 240
HEADER_HEIGHT  = 44   // title bar; first column row starts at 44
ROW_HEIGHT     = 24
node height    = HEADER_HEIGHT + columnCount * ROW_HEIGHT   // no columns -> 44
column handle Y (relative to node top) = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2
table handle Y (relative to node top) = node height / 2
```

`layoutDiagram(graph: DiagramGraph): DiagramLayout` where
`DiagramLayout = { nodes: NodePlacement[] }` and
`NodePlacement = { id, x, y, width, height }` (top-left x/y).

Algorithm: build a dagre `Graph`; `setGraph({ rankdir: 'LR', nodesep: 60,
ranksep: 80, marginx: 20, marginy: 20 })`; `setDefaultEdgeLabel(() => ({}))`;
per node `setNode(id, { width, height })`; per relation edge
`setEdge(source, target)`; `dagre.layout(g)`; read each node's center and
convert to top-left (`x - width / 2`, `y - height / 2`). Exact dagre options
(`nodesep`/`ranksep`) are implementation detail; they must guarantee no node
overlap for the fixture graph.

Removed from this module: `EdgeBundle`, `BundleSegment`, `NodeLayout.columnY`,
the bundle routing helpers (`resolveOrientation`, `columnPoints`, `directBezier`,
`trunkSegments`, `separateTrunkYs`, ...), and the old grid constants.

### 3. Flow elements (new `src/diagram/flow.ts`) — pure, no `vscode`

`buildFlowElements(graph: DiagramGraph, layout: DiagramLayout)` returns
`{ nodes: FlowNode[]; edges: FlowEdge[] }`.

**Handle id scheme** (per node):

- Per column `c`: source handle `` `${c}:source` `` on the RIGHT edge (edges
  leave right), target handle `` `${c}:target` `` on the LEFT edge (edges
  arrive left). Column handles sit at their row center.
- Table-level: `table:source` (right) and `table:target` (left) at the node's
  vertical center.

**FlowNode**: `{ id, type: 'table', position: { x, y }, width, height,
data: { label, description, columns } }` where `columns` is the
`TableNodeColumn[]` from the graph.

**FlowEdge** per `RelationEdge`:

- Equal, non-empty column arrays: one edge per index pair —
  `sourceHandle: '${srcCol}:source'`, `targetHandle: '${tgtCol}:target'`,
  id `` `${source}.${srcCol}->${target}.${tgtCol}` ``. A composite FK
  `columns: [a, b]` / `to_columns: [x, y]` therefore yields two parallel edges.
- Otherwise (empty arrays, or mismatched lengths): a single table-level edge
  using `table:source`/`table:target`, id `` `${source}->${target}[${k}]` ``
  with `k` = index among table-level edges for that ordered pair. Mismatched
  column arrays degrade to a table-level edge rather than inventing pairings
  (`graph.ts` already dedupes identical `RelationEdge`s, so ids stay unique).
- `type: 'smoothstep'`; `data: { sourceColumn?, targetColumn?, title }` where
  `title` matches spec 02's format (column edges: `order_items.order_id ->
  orders.order_id`; table-level: `order_items -> orders`). The column names
  feed the hover-highlight logic.

### 4. Custom node (`webview-ui/TableNode.tsx`)

Custom node type `'table'` renders the card as HTML: a frame (width 240, height
from the layout), the title, and one row per column (name left, dataType right,
description as a native `title` tooltip). Each row renders two `<Handle>`
elements at the row's Y: left `type="target" id="${c}:target"` and right
`type="source" id="${c}:source"`. Rows render a highlight background when the
column is in `data.highlightedColumns`. Node types are registered once via a
memoized `nodeTypes` object passed to `<ReactFlow>`.

### 5. App wiring (`webview-ui/App.tsx`, `webview-ui/index.tsx`, `webview-ui/styles.css`)

- Import `@xyflow/react/dist/style.css` in the webview entry (esbuild bundles
  it into `dist/webview/app.css`, which `panel.ts` already links — `panel.ts`
  is unchanged).
- Message handling, the Add-column form, and the `diagram:edit` protocol are
  unchanged.
- `useMemo` on `[graph, layoutTick]`: `graph -> layoutDiagram -> buildFlowElements`.
  Hover state (`hoveredEdgeId`, `hoveredColumn`) derives an active-edge set and
  a `highlightedColumns` set, then annotates `data.highlightedColumns` on the
  flow nodes.
- Render `<ReactFlowProvider>` wrapping `<ReactFlow nodes edges nodeTypes fitView
  nodesConnectable={false} onEdgeMouseEnter onEdgeMouseLeave proOptions={{
  hideAttribution: false }}>` with `<Background />`, `<Controls />`, and a
  `<Panel position="top-right">` "Auto-layout" button. The `<ReactFlow>`
  container must be a sized div (reuse the `.canvas` flex area).
- After each diagram update, re-fit the view
  (`useReactFlow().fitView({ padding: 0.15 })`) so a newly arranged graph fits
  without manual scrolling.
- Hover semantics preserved from spec 02:
  - Edge hover highlights the edge and the columns it touches (source column on
    the source model, target column on the target model).
  - Column hover highlights every edge touching that column plus the counterpart
    columns (reverse hover). Table-level edges are highlighted by edge hover
    only, matching spec 02.
  - A floating tooltip (React Flow `<EdgeLabelRenderer>`) shows the hovered
    edge's `data.title`.
- React Flow's free-license attribution badge stays visible
  (`hideAttribution: false`).
- Nodes are draggable (React Flow default); the "Auto-layout" button re-runs
  the dagre arrangement and resets manual drags. Manual positions are not
  persisted (out of scope).

### 6. Styles (`webview-ui/styles.css`)

Replace `.node__*` and `.edge-bundle*` rules with HTML equivalents: `.table-node`
card (background `var(--card)`, border `var(--border)`, rounded), `.table-node__row`
(hover cursor; accent-tinted highlight class), `.react-flow__edge path`
(stroke `var(--accent)`, width 1.5; hovered width 3.5, `var(--accent-hover)`),
and background/attribution colors following the existing light/dark theme
variables.

### 7. Tests (`test/unit/`)

- Rewrite `diagram/layout.test.ts`:
  - Node dimensions: width 240; height `44 + n * 24`; height 44 with no columns.
  - LR ordering: for a chain `a -> b -> c`, `a.x < b.x < c.x` with no overlap.
  - Pairwise non-overlap for a multi-pair graph; every node id appears exactly
    once; positions are finite non-negative numbers.
  - Empty graph -> empty layout.
- New `diagram/flow.test.ts`:
  - Equal-length FK -> one edge per column pair with the exact
    `sourceHandle`/`targetHandle` ids and `type: 'smoothstep'`.
  - Empty-columns FK -> a single table-level edge (`table:source`/`table:target`).
  - Mismatched-length FK -> a single table-level edge.
  - Edge ids unique across multiple FKs; table-level edge ids carry `[k]`.
  - Flow nodes carry position/width/height from the layout and label/columns
    from the graph.
- `dbt/*`, `diagram/graph.test.ts`, `fixture.test.ts`, and the integration
  suite: unchanged (they do not reference layout internals).

## Scenarios

### The diagram renders through React Flow

```
Given the workspace fixture has four models and three foreign keys
When the dbt Diagram opens
Then a React Flow canvas renders one card per model
And each foreign key is drawn as smoothstep edges attached to the specific
  source and target column handles
```

### Tables are arranged automatically with no overlap

```
Given the fixture models connect as order_items -> orders -> customers and
  order_items -> products
When the dbt Diagram opens
Then the tables are arranged left-to-right along the dependency direction
  (sources left of targets) with no two tables overlapping
And every table is visible in the viewport without manual scrolling
```

### A composite FK draws one edge per column pair

```
Given order_items declares a foreign_key with columns [order_id, customer_id],
  to: ref('orders'), and to_columns: [order_id, customer_id]
When the dbt Diagram opens
Then two smoothstep edges connect order_items to orders
And one edge attaches order_items.order_id to orders.order_id
And the other attaches order_items.customer_id to orders.customer_id
```

### FKs with empty or mismatched column arrays draw one table-level edge

```
Given a foreign_key constraint whose columns and to_columns are both empty
And another whose column arrays have different lengths
When the dbt Diagram opens
Then each of those constraints draws a single table-level edge between the
  two models attached at the table-level handles
```

### Hovering an edge highlights it and its columns

```
Given the dbt Diagram is open and shows the order_items -> orders edges
When the user hovers the edge from order_items.order_id to orders.order_id
Then that edge is highlighted
And the rows for order_items.order_id and orders.order_id are highlighted on
  their cards
And a tooltip appears with the edge title (for example
  "order_items.order_id -> orders.order_id")
```

### Hovering a column highlights its connected edges

```
Given the dbt Diagram is open and shows the order_items -> orders edges
When the user hovers the order_items.customer_id row
Then the edges touching order_items.customer_id are highlighted
And the counterpart column rows (orders.customer_id) are highlighted
```

### The canvas supports pan, zoom, and drag with a re-layout button

```
Given the dbt Diagram is open
When the user drags the canvas
Then the viewport pans
When the user drags a table card
Then the card moves to the new position
When the user clicks the "Auto-layout" button
Then all cards are re-arranged by the layout algorithm
```

### Editing through the webview still works

```
Given the dbt Diagram is open
When the user adds a column through the Add-column form
Then the model.yml file on disk is updated
And the diagram re-renders with the new column and the dagre arrangement
```

## Acceptance Criteria

- [ ] The diagram renders inside a React Flow canvas: one custom `table` node
      per model, per-column handles, and `smoothstep` FK edges.
- [ ] Tables are arranged automatically by dagre (left-to-right), with no
      overlapping tables, and the view auto-fits after each update.
- [ ] A composite FK renders one edge per column pair, each attached to the
      correct source/target column handles.
- [ ] FKs with empty or mismatched column arrays render as a single table-level
      edge.
- [ ] Edge hover highlights the edge and its columns with a floating title
      tooltip; column hover highlights connected edges and counterpart columns
      (spec 02 semantics preserved).
- [ ] Pan, zoom, and node drag work out of the box; the "Auto-layout" button
      restores the dagre arrangement.
- [ ] `src/diagram/layout.ts` and `src/diagram/flow.ts` are pure (no `vscode`
      import) and covered by Vitest unit tests that pass in under a second.
- [ ] `npm test` and `npm run typecheck` pass; protocol, `panel.ts`, dbt
      parsing/serialization, fixtures, and the integration suite are unchanged.

## Confirm at Approval

These decisions are encoded above as defaults but are explicitly flagged for
confirmation at approval time:

- **(a) Layout engine.** dagre (rankdir LR) is the automatic arrangement
  engine; ELK/elkjs is deliberately deferred.
- **(b) Edge model.** Per-column `smoothstep` edges replace spec 02's trunked
  bundles; FKs with empty or mismatched column arrays degrade to a single
  table-level edge.
- **(c) Where layout runs.** In the webview, from the unchanged `diagram:update`
  payload; `src/shared/protocol.ts` and `src/webview/panel.ts` are untouched.
- **(d) Drag + re-layout.** Nodes stay draggable and an "Auto-layout" panel
  button restores the dagre arrangement; manual positions are not persisted.
- **(e) Dependency placement.** `@xyflow/react` and `@dagrejs/dagre` are
  devDependencies so `vsce package` does not ship their `node_modules`.
