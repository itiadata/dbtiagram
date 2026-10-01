---
id: 52
title: Add SQL-derived model lineage to diagrams
status: implemented
priority: high
created: 2026-09-30
owner: unassigned
depends_on: [03, 24, 32, 36, 37, 38, 51]
---

# Add SQL-derived model lineage to diagrams

## Summary

As a dbt developer, I want to add complete upstream or downstream model lineage
from table context menus, derived directly from model SQL `ref()` calls without
dbt artifacts, so that I can explore dependencies selectively. Lineage edges
are thicker parent-to-child arrows attached to table headers, and layout prefers
parents on the left and children on the right.

## Background

The diagram currently knows only YAML foreign keys. Upstream lineage can be
found by reading the displayed child's SQL and recursively reading local parent
SQL. Complete downstream lineage requires an on-demand project scan. Large
projects must not have every SQL file parsed or watched during normal use.

## Scope

**In scope**

- A table-menu submenu `Add lineage` with `Add upstream lineage` and
  `Add downstream lineage`, available from headers and column rows.
- Complete transitive expansion in the selected direction.
- One- and two-argument literal `ref()` calls parsed by spec 51's SQL lexer.
- Local refs resolved by dbt project package and model name.
- Unknown one-argument refs represented internally as belonging to the current
  package; explicit foreign-package refs represented by package and model.
- Read-only name-only cards for refs with no model YAML in the current project.
  Their visible label is only the model name; package-qualified internal IDs
  prevent collisions. They appear only on the canvas, never in the sidebar.
- Initial/background lineage parsing only for local model SQL files currently
  displayed. This may add/remove edges among displayed cards but never cards.
- On-demand complete downstream scanning with visible file-count progress and a
  Cancel action. Cancellation adds nothing.
- Exact-file watchers only for displayed local model SQL files. A SQL change
  never automatically adds a newly related table.
- If an updated ref breaks lineage, remove the obsolete lineage arrow but keep
  every displayed table. This is identical for ordinary sessions and diagrams
  opened from a saved layout.
- Saved layout files persist their ordinary visible-table entries and positions,
  including lineage-added tables, but never persist lineage arrows. Arrows are
  recalculated from current SQL when the layout opens.
- Preserve all current table positions when lineage adds cards; place new
  upstream generations to the left and downstream generations to the right.
- Auto-layout always rearranges every card and ranks lineage parent → child from
  left to right.
- Show FK and lineage edges simultaneously, including between the same pair.
- Render lineage lines and arrowheads with an even blend of the primary accent
  and VS Code's secondary button colour.
- Fixture SQL with multi-level, unknown and external refs.

**Out of scope**

- dbt manifest/catalog/run-results artifacts, SQL compilation or macro
  evaluation.
- `source()` lineage; feature 53 owns combined model/source behavior.
- Automatically adding cards because a watched SQL file gained a ref.
- Listing external/unknown nodes in the sidebar or persisting them as editable
  model YAML.
- Discovering transitive ancestors inside an unavailable external package.

## Scenarios

### Add complete upstream lineage

```
Given order_summary.sql refs order_items and order_items.sql refs orders
And only order_summary is displayed
When the user chooses Add lineage > Add upstream lineage
Then order_items and orders are added
And arrows point orders -> order_items -> order_summary
And existing card positions do not move
```

### Add complete downstream lineage with progress

```
Given orders has transitive descendants order_items and order_summary
When the user chooses Add lineage > Add downstream lineage on orders
Then a progress overlay says "Calculating downstream lineage"
And reports "<scanned> of <total> SQL files scanned" while scanning
And order_items and order_summary are added only after the complete scan
```

### Cancel downstream calculation atomically

```
Given a downstream scan is in progress and has found at least one descendant
When the user clicks Cancel
Then the scan stops
And no table or lineage edge from that request is added
```

### Show external and unknown refs read-only

```
Given a displayed model contains ref('finance_pkg', 'dim_currency') and ref('missing_parent')
When the user adds upstream lineage
Then cards labelled "dim_currency" and "missing_parent" appear
And both use name-only display and are read-only
And neither appears in the sidebar
```

### Preserve both relationship kinds

```
Given orders has an FK to customers
And orders.sql refs customers
When both cards are displayed
Then the FK line remains attached to its columns
And a thicker arrow also runs from the customers header to the orders header
```

### SQL changes do not add cards automatically

```
Given orders is displayed and its watched SQL gains ref('new_parent')
When lineage refreshes
Then no new_parent card is added
And Add upstream lineage is enabled for orders
```

### Broken lineage removes only the arrow

```
Given order_items was added by upstream expansion from order_summary
And order_summary.sql stops referencing order_items
When its watched SQL refreshes
Then the order_items -> order_summary lineage arrow is removed
And the order_items and order_summary cards both remain displayed
```

### A saved layout stores tables but not lineage arrows

```
Given a saved layout contains order_items and order_summary
And order_summary.sql no longer references order_items
When the user opens the saved layout
Then both tables are displayed at their saved positions
And no order_items -> order_summary lineage arrow is displayed
```

### Auto-layout follows lineage direction

```
Given parent, child and grandchild are connected by lineage
When the user chooses Auto-layout
Then every card is rearranged
And parent is left of child and child is left of grandchild
```

### Distinguish lineage arrows with a blended colour

```
Given lineage is displayed between two tables
When the diagram renders the lineage edge
Then the line uses an even blend of the primary accent and VS Code secondary button background colours
And the arrowhead uses the same blended colour
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/lineage.ts` | create | Pure lineage identities, edge deduplication and transitive closure. |
| `src/diagram/graph.ts` | modify | Add read-only/external node metadata and a separate lineage-edge collection. |
| `src/diagram/layout.ts` | modify | Rank lineage parent-to-child and avoid opposing FK rank constraints for the same pair. |
| `src/diagram/positions.ts` | modify | Place newly added lineage generations around retained manual positions without moving existing cards. |
| `src/diagram/flow.ts` | modify | Build header-anchored lineage Flow edges alongside FK edges and theme their arrow markers with the blended lineage colour. |
| `src/shared/protocol.ts` | modify | Add visible-model sync, lineage requests/results/progress/cancel and lineage graph payloads. |
| `src/shared/filter.ts` | modify | Preserve lineage edges when filtering a diagram graph. |
| `src/vscode/lineageFiles.ts` | create | Read model SQL on demand, enumerate project model SQL, and manage exact-file watchers for displayed local models. |
| `src/webview/lineage.ts` | create | Upstream traversal, cancellable project-wide downstream traversal and displayed-only refresh orchestration behind a host port. |
| `src/webview/panel.ts` | modify | Hold panel lineage cache, synchronize displayed IDs, publish progress/results, and dispose exact-file watchers. |
| `webview-ui/hooks/useLineage.ts` | create | Own request/progress/cancel state, retained lineage-added cards and host result application. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Add resolved local lineage tables to ordinary visible-table selection without tracking transient ownership. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch lineage state, progress and result messages. |
| `webview-ui/App.tsx` | modify | Compose lineage graph/state and add the table submenu while guarding read-only cards. |
| `webview-ui/DiagramCanvas.tsx` | modify | Register lineage edge rendering and preserve positions during lineage additions. |
| `webview-ui/TableNode.tsx` | modify | Enforce per-node read-only/name-only external cards and header lineage handles. |
| `webview-ui/DetailsSidebar.tsx` | modify | Render external/unknown selections read-only without YAML/SQL mutation actions. |
| `webview-ui/LineageEdge.tsx` | create | Render the thicker themed parent-to-child arrow. |
| `webview-ui/LineageProgress.tsx` | create | Modal progress UI and Cancel action for downstream scans. |
| `webview-ui/icons.ts` | modify | Export lineage submenu icons. |
| `webview-ui/styles.css` | modify | Lineage arrow, header handle, read-only card and progress styles, using an even primary/secondary colour blend for lineage strokes. |
| `test/unit/diagram/lineage.test.ts` | create | Identity, closure, cycle and dedupe tests. |
| `test/unit/diagram/layout.test.ts` | modify | Parent-left-child ordering tests. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Verify lineage-added table IDs persist through ordinary table entries without edge data. |
| `test/unit/diagram/positions.test.ts` | modify | New lineage placement with retained positions. |
| `test/unit/diagram/flow.test.ts` | modify | Header edge and simultaneous FK/lineage tests. |
| `test/unit/shared/filter.test.ts` | modify | Cover lineage-edge filtering and update graph fixtures for the required collection. |
| `test/unit/shared/relations.test.ts` | modify | Update graph fixtures for the required lineage-edge collection. |
| `test/unit/shared/staticSite.test.ts` | modify | Update graph fixtures for the required lineage-edge collection. |
| `test/unit/webview/lineage.test.ts` | create | Upstream, downstream progress/cancel and refresh-no-auto-add tests. |
| `test/integration/suite/extension.test.ts` | modify | Exact-file watcher and cancellable downstream scan integration coverage. |
| `fixtures/sample-dbt/models/order_summary.yml` | create | Local multi-level lineage model metadata. |
| `fixtures/sample-dbt/models/order_summary.sql` | create | Multi-level refs plus external and unknown refs. |
| `specs/ARCHITECTURE.md` | modify | Register new modules and update changed responsibilities. |

### Signatures

```ts
// src/diagram/lineage.ts (pure — must not import `vscode`)
export type LineageNodeKind = 'local' | 'unknown' | 'external';
export interface LineageNodeId { package: string; name: string }
export interface LineageEdge { parent: string; child: string }
export function lineageId(target: LineageNodeId): string;
export function lineageAncestors(edges: readonly LineageEdge[], start: string): string[];
export function lineageDescendants(edges: readonly LineageEdge[], start: string): string[];

// additions in src/diagram/graph.ts (pure)
export interface TableNode {
  // existing fields unchanged
  readOnly?: boolean;
  lineageKind?: LineageNodeKind;
  packageName?: string;
}
export interface DiagramGraph {
  nodes: TableNode[];
  edges: RelationEdge[];
  lineageEdges: LineageEdge[];
}

// additions in src/diagram/flow.ts (pure)
export const LINEAGE_EDGE_TYPE = 'lineage';
export const LINEAGE_HEADER_ANCHOR = '\u0000lineage-header';
export type FlowEdgeData = {
  // existing fields unchanged
  kind?: 'foreignKey' | 'lineage';
};

// src/vscode/lineageFiles.ts (vscode-facing)
export interface LineageSqlFile { modelId: string; uri: vscode.Uri }
export function findProjectModelSql(project: WorkspaceDbtProject): Promise<LineageSqlFile[]>;
export function watchLineageSqlFiles(
  files: readonly vscode.Uri[],
  onChanged: (uri: vscode.Uri) => void,
): vscode.Disposable;

// src/webview/lineage.ts (pure orchestration — must not import `vscode`)
export interface LineageProgress { scanned: number; total: number }
export interface LineageExpansionResult {
  requestId: string;
  root: string;
  direction: 'upstream' | 'downstream';
  nodes: TableNode[];
  edges: LineageEdge[];
}
export interface LineageHost {
  readModelSql(modelId: string): Promise<string | null>;
  allProjectModelIds(): Promise<string[]>;
  resolveNode(packageName: string, modelName: string): Promise<TableNode>;
  progress(value: LineageProgress): void;
  isCancelled(): boolean;
}
export function expandUpstream(host: LineageHost, requestId: string, root: string): Promise<LineageExpansionResult>;
export function expandDownstream(host: LineageHost, requestId: string, root: string): Promise<LineageExpansionResult | null>;
export function refreshDisplayedLineage(
  host: LineageHost,
  displayed: ReadonlySet<string>,
  previous: readonly LineageEdge[],
): Promise<LineageEdge[]>;

// webview-ui/hooks/useLineage.ts (webview pure helper)
export function canvasOnlyLineageNodes(nodes: readonly TableNode[]): TableNode[];

// additions in src/shared/protocol.ts (shared)
// MessageToExtension:
| { type: 'lineage:setDisplayed'; models: string[] }
| { type: 'lineage:expand'; requestId: string; root: string; direction: 'upstream' | 'downstream' }
| { type: 'lineage:cancel'; requestId: string }
// MessageToWebview:
| { type: 'lineage:state'; nodes: TableNode[]; edges: LineageEdge[] }
| { type: 'lineage:progress'; requestId: string; scanned: number; total: number }
| { type: 'lineage:result'; result: LineageExpansionResult | null }
```

### Behavior notes

- Internal IDs are `model:<package>:<name>` for resolvable local YAML models and
  `external:<package>:<name>` for unavailable/unknown models. Labels are always
  only `<name>`. Unknown one-argument refs use the current package.
- Existing model-name IDs remain accepted at protocol/layout boundaries until
  feature 53 performs the full namespaced-ID migration.
- The webview sends its displayed local IDs after filter/layout changes. The
  host reads and watches only their exact SQL paths. Discovery may enumerate
  filenames, but normal refresh does not read every project SQL file.
- Initial/displayed refresh publishes only edges whose endpoints are already
  displayed. It never sends expansion nodes.
- Upstream traversal reads the root SQL, resolves each ref, then recursively
  reads a resolved local/unknown parent's SQL when a file exists. External
  package nodes are terminal.
- Downstream first enumerates model SQL paths to establish `total`, then reads
  each file once, publishing monotonically increasing progress. It builds the
  full index and transitive closure in request-local memory. A cancel returns
  `null`; no partial state message is published.
- Cycles terminate through visited IDs; nodes and edges are deduplicated in
  first-discovery order.
- A successful expansion adds resolved local models to the same ordinary
  visible-table selection used by the sidebar, and retains external/unknown
  nodes in the webview's displayed-node set. No provenance or ownership is
  tracked after addition: every displayed card remains until the user removes
  or filters it out.
- Refresh replaces the current lineage-edge set among displayed cards. A ref
  that disappeared therefore removes its arrow only. A newly discovered ref to
  a hidden card cannot add that card; a new edge may appear only when both
  endpoints are already displayed.
- Layout persistence remains table-only. Saving writes every displayed table's
  existing layout entry and position but no lineage edge data. Opening a layout
  restores those tables first (including read-only external IDs, whose label
  and package are recoverable from the ID), then current SQL parsing derives
  whichever arrows still exist. Consequently an obsolete relationship produces
  two retained cards and no arrow, with no warning or stale-edge state. This
  uses the existing layout table entries and adds no lineage field or layout
  schema version change.
- Read-only cards always have zero displayed columns, no inline editing, no
  details/matrix/FK actions, and no Reveal/Open SQL actions. They retain Remove
  from diagram and Add lineage actions.
- Lineage edges attach at header-centre left/right handles, carry an arrow marker
  at the child, use a 2.5px `color-mix(in srgb, var(--accent) 50%,
  var(--vscode-button-secondaryBackground))` stroke, and coexist with FK edges. Their
  source and target sides are recalculated from the current table positions:
  the parent uses the side facing the child and the child uses the side facing
  the parent. The arrowhead uses exactly the same themed colour as the line.
- During addition, existing positions remain exact. New upstream generations
  are placed left of their nearest retained children; downstream generations
  right of parents; collisions nudge vertically. Auto-layout ignores retained
  positions and gives lineage edges parent→child rank precedence. An FK between
  the same pair does not add an opposing rank constraint.
- Local lineage-added tables participate only in the ordinary model filter.
  Unchecking one or choosing `Remove from diagram` removes its card immediately;
  the separate canvas-only lineage-node state contains read-only external and
  unknown cards only and therefore cannot re-add a removed local table.

### Lineage handles follow table positions

```
Given a lineage parent is positioned to the right of its child
When lineage edge geometry is calculated
Then the arrow starts at the parent's left header handle
And arrives at the child's right header handle
And the arrowhead colour matches the lineage line colour
```

### Remove a lineage-added local table

```
Given downstream expansion added a local model table
When the user chooses Remove from diagram on that table
Then its model filter checkbox is unchecked
And its card disappears from the canvas
And lineage state does not add the card back
```

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/lineage.test.ts` | `returns complete ancestors once` | `a->b, b->c, a->c`, start `c` | `['a','b']` in stable discovery order |
| `test/unit/diagram/lineage.test.ts` | `terminates a cycle` | `a->b, b->a` | each non-root node returned once |
| `test/unit/webview/lineage.test.ts` | `expands upstream transitively` | report refs items; items refs orders | nodes `items,orders`; edges `orders->items,items->report` |
| `test/unit/webview/lineage.test.ts` | `represents external and unknown refs` | `ref('finance_pkg','currency')`, `ref('missing')` in package sample | read-only IDs `external:finance_pkg:currency`, `external:sample:missing`, labels `currency`, `missing` |
| `test/unit/webview/lineage.test.ts` | `reports downstream file progress` | three model SQL files | progress ends exactly `{scanned:3,total:3}` before result |
| `test/unit/webview/lineage.test.ts` | `cancels downstream atomically` | cancellation after first of three reads | result `null`; no expansion nodes/edges published |
| `test/unit/webview/lineage.test.ts` | `refresh never adds a referenced hidden node` | displayed child gains hidden parent ref | returned displayed edge set excludes it; expansion availability includes it |
| `test/unit/webview/lineage.test.ts` | `refresh removes an obsolete edge but keeps displayed nodes` | displayed `items` and `report`; previous `items->report`; refreshed report SQL has no ref | edges `[]`; displayed IDs remain `['items','report']` |
| `test/unit/webview/lineage.test.ts` | `retains only canvas-only lineage nodes` | one local and one external expansion node | only the external node remains in lineage-owned canvas state |
| `test/unit/diagram/layoutFile.test.ts` | `round-trips lineage-added table IDs without edge data` | layout tables `model:sample:report`, `external:finance_pkg:currency` with positions | same two table entries and positions; serialized YAML has no lineage key |
| `test/unit/diagram/flow.test.ts` | `builds header lineage and column FK together` | same node pair has one lineage and one FK | two edges; lineage uses header anchors and arrow; FK retains column handles |
| `test/unit/diagram/flow.test.ts` | `lineage handles face the opposite table after movement` | parent positioned right of child | parent uses left header handle; child uses right header handle; marker colour is `color-mix(in srgb, var(--accent) 50%, var(--vscode-button-secondaryBackground))` and matches the CSS line colour |
| `test/unit/diagram/layout.test.ts` | `ranks lineage left to right` | parent→child→grandchild | `parent.x < child.x < grandchild.x` |
| `test/unit/diagram/positions.test.ts` | `adds upstream without moving retained cards` | retained child at `{x:500,y:100}`, new parent | child unchanged; parent right edge is left of child x |
| `test/integration/suite/extension.test.ts` | `watches only displayed model SQL files` | two displayed and 100 hidden model SQL paths | exact watchers registered for two paths only |

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.

### Do not touch

- FK parsing, FK edit semantics and column-level FK rendering.
- `source()` handling and source-diagram mode.
- dbt compilation or artifact loading.
- Existing table positions during lineage expansion.
- Hidden files during ordinary lineage refresh; project-wide reads occur only
  for an explicit downstream request.

## Acceptance Criteria

- [ ] Both complete lineage directions are available under `Add lineage`.
- [ ] Downstream work reports file progress, is cancellable, and cancellation adds nothing.
- [ ] Ordinary parsing/watching is limited to displayed local model SQL files.
- [ ] Refresh never adds or removes cards automatically; it only adds/removes current arrows between already displayed cards.
- [ ] Saved layouts store displayed tables and positions, never lineage arrows; arrows are recalculated from current SQL.
- [ ] Unknown/external cards are name-only, read-only and canvas-only.
- [ ] Header arrows coexist with column FK lines.
- [ ] Lineage lines and arrowheads use an even blend of the primary accent and VS Code secondary button background colours.
- [ ] Addition preserves positions; Auto-layout puts parents left of children.
- [ ] The fixture supports manual upstream/downstream/external testing.
- [ ] `npm run verify` is green.
