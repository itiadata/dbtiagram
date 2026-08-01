---
id: 12
title: Obstacle-aware FK edge routing with free side choice
status: done
priority: high
created: 2026-08-01
owner: unassigned
depends_on: [09]
---

# Obstacle-aware FK edge routing with free side choice

## Summary

As a dbt developer arranging the diagram, I want every FK line to run from its
source column to its target column along the **best available path**, attaching
on whichever side of each card suits that path — left or right, chosen
**independently per endpoint** — and **never crossing over or under another
table card**. The choice is live: it is re-derived while I drag a card, so the
picture stays clean at every position.

Everything else about FK edges stays exactly as feature 09 shipped it: dots are
mounted only at real edge endpoints, virtual FKs stay dashed, hover
highlighting/animation and edge double-click keep working, zero-pair FKs stay
invisible drafts.

## Background

Feature 09 introduced a dynamic side choice, but it is too coarse and it is the
source of the reported bugs:

1. **The two endpoints are coupled by one boolean.** `chooseEdgeSides` compares
   the two cards' horizontal **centers** and derives both sides from that single
   comparison (`forward` → source-right/target-left, else the mirror). When two
   cards **overlap horizontally** (stacked, or partially offset — very common
   after a drag), the "winning" side points *into* the other card and the line
   is forced to travel back across one or both cards. The same-side combination
   (e.g. both endpoints on the right), which is the only clean answer for
   vertically stacked cards, is not representable at all.
2. **There is no obstacle awareness.** Edges are plain `smoothstep`: React Flow
   routes them geometrically with no knowledge of the other cards, so a line
   between two distant tables runs straight through every card in between.

The fix is to stop deriving the sides from a single center comparison, and to
give the edge a real (but small) router: enumerate a handful of candidate
orthogonal routes, score them, keep the best. The whole decision — sides and
path — then falls out of one scoring function, which is simpler than the
current split between `chooseEdgeSides` (sides) and React Flow (path), and is
fully unit-testable as pure logic.

## Scope

- `src/diagram/routing.ts` (new, pure) — the router: candidate route
  enumeration, obstacle scoring, the chosen side pair and the polyline for
  every edge.
- `src/diagram/flow.ts` — `chooseEdgeSides` is replaced by a call into the
  router; `recomputeEdgeSides` becomes `routeEdges`, returning both the
  per-node `handles` map (unchanged semantics) and each edge's routed
  polyline; `HandleSide`, `columnSourceHandle`, `columnTargetHandle`,
  `sharesSideWithOppositeHandle` and `HANDLE_SHARED_SIDE_OFFSET_PX` are
  unchanged.
- `webview-ui/FkEdge.tsx` (new) — a custom React Flow edge component that draws
  the routed polyline (rounded corners) instead of `smoothstep`, keeping the
  existing interaction band, hover classes, animation and dashed-virtual
  styling.
- `webview-ui/App.tsx` — `DiagramCanvas` calls `routeEdges` with the live node
  rects and passes each edge its route through `data`.
- `webview-ui/TableNode.tsx` — handles are **always mounted** (all four per
  column); only their visibility is derived from `data.handles` (Manual Verify
  iteration, section 8).
- `webview-ui/styles.css` — a hidden-handle rule for unused handles; edge
  stroke styling is unchanged.
- `test/unit/diagram/routing.test.ts` (new), `test/unit/diagram/flow.test.ts`.

### Out of scope

- Edge-to-edge avoidance (two FK lines may still overlap or cross each other).
  Only **table cards** are obstacles.
- Top/bottom attachment: handles stay on the **left/right** card edges only,
  per the user's requirement ("no matter left or right").
- Bundling / merged routing of parallel edges, edge labels, manual waypoint editing.
- Any change to FK persistence, the sidebar, drafts, or the graph layer.

## Implementation Notes

### 1. Anchor points

Each candidate endpoint has an exact anchor point derived from the node rect and
the column's row index (already known: `HEADER_HEIGHT + index * ROW_HEIGHT +
ROW_HEIGHT / 2`), at the row's exact vertical center (section 9 removes
feature 09's shared-side offset):

- left anchor: `(rect.x, rect.y + rowCenterY)`
- right anchor: `(rect.x + rect.width, rect.y + rowCenterY)`

### 2. Candidate routes

For an edge, the router evaluates the **four** side combinations
(source ∈ {left,right} × target ∈ {left,right}). Each combination produces
orthogonal candidate polylines built from a fixed template:

```
anchor -> stub (STUB_PX outward from the card) -> [vertical channel at x = cx]
       -> [horizontal lane at y = ly] -> stub -> anchor
```

Candidate `cx` values (vertical channel): the midpoint between the two stub
ends, plus, for every obstacle rect, `left - MARGIN` and `right + MARGIN`.
Candidate `ly` values (horizontal lane, used when the route must go around a
card vertically): the two anchors' y, plus, for every obstacle, `top - MARGIN`
and `bottom + MARGIN`. Candidates are clamped to a small set (deduped, sorted)
so the enumeration stays bounded: at most a few dozen polylines per edge.

### 3. Scoring

Each candidate polyline is scored, lowest wins:

```
score = OBSTACLE_PENALTY * (number of segment/obstacle-rect intersections)
      + total length
      + BEND_PENALTY * (number of corners)
```

Obstacles are **all node rects except the edge's own two endpoints**, inflated
by `MARGIN`. A segment intersects a rect when it overlaps its inflated area.
The two **endpoint cards** are scored too, but with **zero margin and only on
interior segments** (the first and last segments are the stubs, which touch
their own card by construction) — otherwise a route could cut back through the
card it just left to reach the far side.
`OBSTACLE_PENALTY` is large enough (e.g. 10000) that any crossing-free route
beats any crossing route; among crossing-free routes the shortest, then the
straightest, wins. When no crossing-free route exists (cards overlapping each
other, no gap), the least-bad route is still drawn — the diagram never loses a
line.

The **side pair** of the winning candidate is the edge's side pair; the dot is
mounted there. This is the whole "dynamic side" logic — the old
`chooseEdgeSides` center comparison disappears.

### 4. Pure API (`src/diagram/routing.ts`)

```ts
export interface Point { x: number; y: number }

export interface RouteRequest {
  source: { rect: NodeRect; rowCenterY: number };
  target: { rect: NodeRect; rowCenterY: number };
  obstacles: readonly NodeRect[];
}

export interface Route {
  sourceSide: HandleSide;
  targetSide: HandleSide;
  /** Orthogonal polyline from the source anchor to the target anchor. */
  points: Point[];
}

export function routeEdge(request: RouteRequest): Route;
```

`routeEdge` is deterministic and side-effect free; ties break in a fixed order
(source-right/target-left first) so the picture never flickers between two
equal-cost routes.

### 5. Flow integration (`src/diagram/flow.ts`)

`routeEdges(edges, nodeRects, columnIndexOf)` replaces `recomputeEdgeSides`. It
returns `{ edges, nodeHandles }` exactly as before, but each edge now carries
`data.points` (its routed polyline) in addition to its existing payload, and
the sides come from `routeEdge`. The missing-rect fallback is unchanged: an
edge whose endpoint rect is absent for one render is passed through untouched.

`buildFlowElements` calls the same function once on the initial dagre layout,
so build-time and drag-time geometry can never drift apart.

### 6. Custom edge (`webview-ui/FkEdge.tsx`)

The edge type becomes `fk` instead of `smoothstep`. `FkEdge` renders the
polyline from `data.points` as an SVG path with rounded corners
(`CORNER_RADIUS` = 8px, clamped to half the shorter adjacent segment), plus the
existing invisible `interactionWidth` band so hover stays forgiving (spec 07).
Hover class, `animated`, and the dashed virtual stroke are applied exactly as
today. When `data.points` is absent (the transient missing-rect case) the edge
falls back to a straight bezier so nothing disappears.

### 7. Performance

Routing runs in the same `useMemo` that recomputed the sides, i.e. on every
drag frame. With N tables and E edges the cost is `O(E * C * N)` where C is the
bounded candidate count; for the target scale (tens of tables) this is
microseconds. If a workspace ever exceeds `ROUTING_NODE_LIMIT` (200 nodes) the
router degrades gracefully: obstacle scoring is skipped and the plain
side-comparison route is used.

### 8. Handles are always mounted (Manual Verify iteration)

Manual Verify showed the reported bug is **not** in the router: for the
shared-side case (a column that is both an FK target and an FK source, both
edges leaving on the same side) `routeEdges` produces two distinct paths and a
`handles` map holding both ids — yet only one line is painted.

The cause is React Flow's handle resolution. React Flow resolves an edge's
endpoint from the node's **cached handle bounds**, measured when the node is
measured. Feature 09 mounts a column's `<Handle>` elements **conditionally**
(only the ids present in `data.handles`), so whenever a node's handle set
changes — exactly what happens when a second FK starts sharing a column's side
— the newly mounted handle is missing from the cached bounds and React Flow
**silently drops the edge that references it**. Conditional handles are a
documented React Flow hazard; they require an explicit node-internals refresh.

The fix removes the hazard instead of patching around it:

- **Every column always mounts all four handles** (`source`/`target` ×
  `left`/`right`). The handle set of a node therefore never changes, so the
  cached bounds can never go stale and an edge can never fail to resolve.
- **`data.handles` now only drives visibility**, not mounting: a handle whose
  id is absent gets the `table-node__handle--unused` class
  (`opacity: 0; pointer-events: none`), so the visual rule of feature 09 —
  a dot appears exactly where an edge attaches and nowhere else — is unchanged.
- The shared-side ±`HANDLE_SHARED_SIDE_OFFSET_PX` dot offset of feature 09 is
  **removed** (Manual Verify iteration, section 9): edges leaving or arriving
  on the same side of the same column now **share one dot**.
  `useUpdateNodeInternals` is still called when a node's `handles` map changes
  so the cached bounds catch up on the next frame.

This supersedes feature 09's Confirm at Approval (b) ("unused handles are not
mounted at all"): the conditional mounting it chose is the direct cause of
dropped edges. The user-visible rule it stated (dots only where an edge
attaches) is preserved exactly.

### 9. One dot per column side (Manual Verify iteration)

Feature 09 separated the two dots of a column that is both an FK source and an
FK target on the same side by 5px, so that neither edge would hide the other.
Now that both edges are reliably drawn, that separation is unwanted: the user
wants **one blue dot per (column, side)** that all edges on that side share,
whatever their number or direction.

So:

- `HANDLE_SHARED_SIDE_OFFSET_PX` and `sharesSideWithOppositeHandle` are
  **removed** from `src/diagram/flow.ts` (with their unit tests). Nothing
  replaces them — this is a pure deletion.
- `TableNode` mounts every handle at the row's exact vertical center. The
  `source` and `target` handles for the same (column, side) therefore sit at
  the same point and read as a single dot, which is what all edges on that side
  converge on.
- Nothing else changes: the routes themselves are already computed per edge and
  stay distinct.

## Scenarios

### A line between horizontally separated tables takes the direct path

```
Given the dbt Diagram is open and orders is laid out left of customers with no card between them
When the user looks at the FK edge orders.customer_id -> customers.customer_id
Then the line departs orders on the right and arrives customers on the left
And the line does not cross any other table card
```

### Dragging a table to the other side flips both endpoints live

```
Given the dbt Diagram is open and customers is right of orders
When the user drags customers to the left of orders
Then while dragging, the line departs orders on the left and arrives customers on the right
And the handle dots move to those sides
```

### Vertically stacked tables attach on the same side

```
Given the dbt Diagram is open and customers is dragged directly below orders with the same horizontal position
When the user looks at the FK edge between them
Then both endpoints attach on the side that yields the clean path (e.g. both on the right)
And the line does not cross either card
```

### A line routes around an intervening table

```
Given the dbt Diagram is open and a third table sits directly between orders and customers
When the user looks at the FK edge orders.customer_id -> customers.customer_id
Then the line goes around the intervening card (above, below, or through the free gap)
And no segment of the line passes over or under that card
```

### Dragging a card into a line makes the line move out of the way

```
Given the dbt Diagram is open and an FK line runs between two cards
When the user drags a third card onto that line
Then the line re-routes around the dragged card while it is being dragged
```

### Both FKs of a shared column are drawn when they leave on the same side

```
Given the dbt Diagram is open and products.product_id is the target of order_items.product_id and the source of an FK to customers.customer_id
And both counterparts sit on the same side of products, so both lines leave product_id on that side
Then both lines are drawn (neither is dropped)
And both lines converge on the SAME single blue dot on that side of the row
And this still holds while any of the three cards is dragged
```

### Hover, virtual and interaction behavior are unchanged

```
Given the dbt Diagram is open
When the user hovers an FK line
Then the line highlights and animates exactly as before
And virtual FK lines stay dashed
And double-clicking a line still opens its FK in the sidebar
```

### No clean route exists

```
Given two tables overlap each other so that every path crosses a card
When the user looks at the FK edge between them
Then a line is still drawn along the least-crossing path
And no error is shown
```

## Acceptance Criteria

- [ ] `routeEdge` is pure, deterministic, `vscode`-free, and chooses the side
      pair **and** the polyline from one scoring function over the four side
      combinations and the bounded candidate set.
- [ ] Obstacles are all node rects except the edge's own endpoints, inflated by
      `MARGIN`; any crossing-free candidate beats any crossing candidate; ties
      break deterministically.
- [ ] The two endpoints' sides are chosen **independently** — the same-side
      combination is reachable for vertically stacked cards.
- [ ] `chooseEdgeSides` (center comparison) is removed; `recomputeEdgeSides` is
      replaced by `routeEdges`, which keeps the per-node `handles` semantics,
      preserves edge ids/`data`, and passes an edge through untouched when an
      endpoint rect is missing.
- [ ] `buildFlowElements` and the live drag pass use the same router.
- [ ] `FkEdge` draws the routed polyline with rounded corners, keeps the
      `interactionWidth` hover band, the hover class, `animated`, and the
      dashed virtual stroke; it falls back to a straight path when no route is
      present.
- [ ] Every column always mounts all four handles; `data.handles` drives only
      their **visibility** (`table-node__handle--unused`), so React Flow can
      never fail to resolve an edge endpoint and an edge is never dropped —
      in particular both FKs of a column that is source **and** target on the
      same side are drawn.
- [ ] All edges attaching to the same (column, side) share ONE dot: the
      shared-side vertical dot separation of feature 09
      (`HANDLE_SHARED_SIDE_OFFSET_PX`, `sharesSideWithOppositeHandle`) is removed.
- [ ] Feature 09 behavior that must not regress: dots only at real endpoints,
      no table-level handles, zero-pair FK drafts, hover highlighting, edge
      double-click.
- [ ] New `routing` unit tests cover: direct path, back-edge flip, stacked
      same-side, routing around one obstacle, routing around a wall of
      obstacles, no-clean-route fallback, determinism, and the node-limit
      degradation; `flow` tests are updated; `npm test` and `npm run typecheck`
      pass.

## Confirm at Approval

- **(a) One scoring function decides everything.** Sides and path are not two
  separate rules any more: the router enumerates the four side combinations ×
  a bounded candidate set of orthogonal routes and picks the lowest score
  (crossings ≫ length > bends). This is the "simplify the logic" request.
- **(b) Candidate enumeration, not A\*.** A full grid/visibility-graph
  pathfinder would be exact but heavy and hard to keep stable frame-to-frame.
  The candidate template (stub → vertical channel → optional horizontal lane →
  stub) covers every practical case in an ER diagram and is stable under
  dragging. **Say so if you want true pathfinding instead.**
- **(c) Left/right only.** Handles stay on the left and right card edges;
  vertically stacked cards are handled by the same-side combination plus a
  lane, not by top/bottom handles.
- **(d) Tables only are obstacles.** Lines may still overlap each other. Edge
  bundling/separation is a possible later feature.
- **(e) Custom edge component.** `smoothstep` cannot follow a computed
  polyline, so the edge type becomes a local `fk` component. The visible
  styling is byte-for-byte the current one.
- **(f) Router runs every drag frame** (no debounce), with a 200-node
  degradation guard.
