---
id: 31
title: Group tables inside a named box on the diagram
status: approved
priority: high
created: 2026-08-31
owner: unassigned
depends_on: [13, 16, 22, 26, 28]
---

# Group tables inside a named box on the diagram

## Summary

As a data modeller, I want to draw a named box around a set of tables on the
diagram, so that related models read as one visual unit (a domain, a source
system, a layer) without changing anything in the `model.yml` files.

## Background

Diagrams of a real dbt project quickly reach a size where the eye needs
structure. Sticky notes (spec 16) annotate, but they do not enclose. A group is
purely visual: it lives in the saved `.dbtiagram.yml` layout file next to
`tables` and `notes`, and it never touches dbt sources.

The layout file already has an established shape for this kind of data — the
`DiagramNote` record with its `parseNotes` validation, `buildLayout`
normalization and `applyLayout` pass-through — and the two-step FK gesture
(spec 26) established the pattern of *pure state machine + thin React hook +
hint banner*. Groups follow both precedents.

`src/diagram/layoutFile.ts` is at 392 lines against a 400-line soft cap, so the
group data model lands in a new sibling module rather than growing it.

## Scope

**In scope**

- A `groups` section in the saved layout file: id, name, rectangle, member models.
- A toolbar button (Lucide `Group`) next to "Add note" that starts a
  click-and-drag marquee; releasing creates a group containing the tables under
  the rectangle, then leaves the mode.
- Rendering the group as a labelled rectangle painted **behind** notes and tables.
- A label that stays visible while any part of the box is on screen.
- Membership by geometry: dragging a table into the box adds it, dragging it out
  removes it.
- Moving and resizing the box.
- Renaming a group and removing a group (models are never removed) via its
  right-click menu.
- Groups participating in the dirty flag and the manual save (spec 22).

**Out of scope**

- Nesting groups inside groups.
- Collapsing a group into a single placeholder node.
- Any effect on dbt files, edges, routing, filtering or auto-layout — auto-layout
  ignores groups and may move tables out of their boxes; membership simply
  follows.
- Per-group colours or styling options.
- Splitting `webview-ui/App.tsx` or `webview-ui/DiagramCanvas.tsx`, both already
  over the soft size cap. This spec adds the minimum to each and extracts its own
  logic into new modules.

## Scenarios

### Create a group by dragging a rectangle

```
Given a diagram with tables "orders" and "customers" side by side
When I click the "Add group" toolbar button
Then a hint banner reads "Drag a rectangle to group tables (Esc to cancel)"
When I press the pointer on empty canvas and drag a rectangle over both tables and release
Then a group box is created around that rectangle
And it contains "orders" and "customers"
And its label reads "Group 1" and is focused for renaming
And the mode exits, the hint banner disappears
```

### A too-small rectangle creates nothing

```
Given the "Add group" mode is active
When I press and release the pointer with almost no movement
Then no group is created
And the mode exits
```

### Escape cancels the mode

```
Given the "Add group" mode is active
When I press Escape
Then the marquee disappears and no group is created
And the mode exits
```

### The label follows the visible part of the box

```
Given a group box larger than the viewport
When I pan so that only the bottom-right corner of the box is on screen
Then the group's label is drawn inside that visible corner
And it is never drawn outside the box
```

### Dragging a table into a group adds it

```
Given a group "Sales" that contains "orders"
When I drag "customers" so that its header centre lands inside the box
Then the group's member list becomes ["customers", "orders"]
And the diagram is marked as having unsaved layout changes
```

### Dragging a table out of a group removes it

```
Given a group "Sales" that contains "orders" and "customers"
When I drag "customers" so that its header centre lands outside the box
Then the group's member list becomes ["orders"]
And no model.yml file is modified
```

### Removing a group keeps its models

```
Given a group "Sales" that contains "orders"
When I right-click the group's label and choose "Remove group"
Then the box disappears
And "orders" is still on the diagram, unmoved
```

### Groups round-trip through the layout file

```
Given a diagram with a group "Sales" containing "orders"
When I save the diagram and reopen the layout file
Then the group "Sales" is drawn at the same rectangle
And it still contains "orders"
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/layoutGroups.ts` | create | The `DiagramGroup` record, its constants, id/name minting, parse/normalize validation, and the pure geometry that decides membership. |
| `src/diagram/layoutFile.ts` | modify | Add `groups` to `DiagramLayout` and `AppliedLayout`; parse it via `parseGroups`; serialize it; accept it in `buildLayout`; pass it through `applyLayout`; re-export the group symbols so the module path stays the single import site. |
| `webview-ui/group-create-state.ts` | create | Pure marquee state machine for the "Add group" gesture. |
| `webview-ui/group-label.ts` | create | Pure label placement: keep the label inside the on-screen part of the box. |
| `webview-ui/hooks/useGroupCreateMode.ts` | create | React wrapper over `group-create-state.ts`: Escape cancellation, hint text, pointer handlers. |
| `webview-ui/hooks/useGroups.ts` | create | Group state: persisted groups, node projection, membership sync, add/rename/remove/move/resize. |
| `webview-ui/GroupNode.tsx` | create | The React Flow node rendering the box, its label chip and its resize grip. |
| `webview-ui/GroupMarquee.tsx` | create | The in-viewport rectangle drawn while the create gesture is dragging. |
| `webview-ui/DiagramCanvas.tsx` | modify | Register the `group` node type, render group nodes first, add the toolbar button, wire the marquee pointer handlers, partition group node changes. |
| `webview-ui/App.tsx` | modify | Instantiate `useGroups`/`useGroupCreateMode`, feed table positions in, render the hint banner, add the group right-click menu, thread props to the canvas and to layout persistence. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Include groups in every `buildLayout` call, in the saved snapshot and in the pending sync. |
| `webview-ui/layout-dirty.ts` | modify | Add `groups` to `LayoutSnapshot` and to the comparison. |
| `webview-ui/icons.ts` | modify | Re-export `Group` from `lucide-react`. |
| `webview-ui/styles.css` | modify | `.group`, `.group__label`, `.group__grip`, `.group-marquee` styling. |
| `specs/ARCHITECTURE.md` | modify | Rows for the six new modules; updated responsibilities for the five modified ones. |
| `test/unit/diagram/layoutGroups.test.ts` | create | Unit tests for parsing, normalization, membership and name minting. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Round-trip and pass-through tests for the `groups` key. |
| `test/unit/webview/groupCreateState.test.ts` | create | Unit tests for the marquee state machine. |
| `test/unit/webview/groupLabel.test.ts` | create | Unit tests for label placement. |
| `test/unit/webview/layout-dirty.test.ts` | modify | Groups affect the dirty flag. |

### Signatures

```ts
// src/diagram/layoutGroups.ts  (pure — must not import `vscode`)
import type { DiagramLayoutTable } from './layoutFile';

/** A named rectangle enclosing tables. Purely visual; never touches dbt files. */
export interface DiagramGroup {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Member model names, ascending. Derived from geometry, persisted for filtered-out models. */
  models: string[];
}

export const GROUP_MIN_WIDTH = 160;
export const GROUP_MIN_HEIGHT = 120;

export interface GroupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `g-` plus six lowercase hex characters, mirroring note ids. */
export function newGroupId(random: () => number): string;

/** `Group N` with the smallest N >= 1 not already used as a name. */
export function nextGroupName(existing: readonly DiagramGroup[]): string;

/** A new group over `rect`, with `models` taken from `tables` by geometry. */
export function createGroup(
  id: string,
  name: string,
  rect: GroupRect,
  tables: readonly DiagramLayoutTable[],
): DiagramGroup;

/**
 * The visible tables whose header centre — `(x + NODE_WIDTH / 2, y + HEADER_HEIGHT / 2)` —
 * falls inside `rect`, ascending by name.
 */
export function groupMembers(
  rect: GroupRect,
  tables: readonly DiagramLayoutTable[],
): string[];

/**
 * Membership after a move: the geometry hits from `tables`, unioned with the
 * group's previous members that are absent from `tables` (filtered out of the
 * diagram, therefore not up for reassignment), ascending, de-duplicated.
 */
export function syncGroupModels(
  group: DiagramGroup,
  tables: readonly DiagramLayoutTable[],
): string[];

/** Rounded coordinates, clamped sizes, ascending by id — the persisted form. */
export function normalizeGroups(groups: readonly DiagramGroup[]): DiagramGroup[];

/** Validates the layout file's `groups` key. Throws the caller's error factory. */
export function parseGroups(
  raw: unknown,
  fail: (message: string) => never,
): DiagramGroup[];
```

```ts
// src/diagram/layoutFile.ts  (pure)
export type { DiagramGroup, GroupRect } from './layoutGroups';
export {
  createGroup, groupMembers, syncGroupModels, newGroupId, nextGroupName,
  GROUP_MIN_WIDTH, GROUP_MIN_HEIGHT,
} from './layoutGroups';

export interface DiagramLayout {
  version: typeof LAYOUT_VERSION;
  name: string;
  tables: DiagramLayoutTable[];
  notes: DiagramNote[];
  /** Always present in memory; `[]` when the file has no groups (spec 31). */
  groups: DiagramGroup[];
  defaultColumnDisplay?: ColumnDisplayMode;
}

export interface AppliedLayout {
  visible: Set<string>;
  positions: Map<string, NodePosition>;
  missing: string[];
  notes: DiagramNote[];
  /** Passed through untouched, like notes (spec 31). */
  groups: DiagramGroup[];
  defaultColumnDisplay: ColumnDisplayMode;
  columnDisplay: Map<string, ColumnDisplayMode>;
}

export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
  notes?: readonly DiagramNote[],
  columnDisplay?: { default: ColumnDisplayMode; overrides: ReadonlyMap<string, ColumnDisplayMode> },
  groups?: readonly DiagramGroup[],
): DiagramLayout;
```

```ts
// webview-ui/group-create-state.ts  (webview — pure, no DOM)
import type { GroupRect } from '../src/diagram/layoutFile';

export interface GroupPoint { x: number; y: number }

/** idle | armed (waiting for pointer-down) | dragging the marquee. */
export type GroupCreateState =
  | { active: false }
  | { active: true; anchor: null }
  | { active: true; anchor: GroupPoint; current: GroupPoint };

export const GROUP_CREATE_IDLE: GroupCreateState;
export function startGroupCreate(): GroupCreateState;
export function cancelGroupCreate(): GroupCreateState;
export function beginRect(state: GroupCreateState, point: GroupPoint): GroupCreateState;
export function dragRect(state: GroupCreateState, point: GroupPoint): GroupCreateState;

export interface GroupCreateOutcome {
  state: GroupCreateState;
  /** Present only when the released rectangle met the minimum size. */
  rect?: GroupRect;
}

export function endRect(state: GroupCreateState, point: GroupPoint): GroupCreateOutcome;

/** The positive-extent rectangle spanned by two points, in any drag direction. */
export function normalizeRect(a: GroupPoint, b: GroupPoint): GroupRect;

/** The marquee to draw right now, or null. */
export function marqueeRect(state: GroupCreateState): GroupRect | null;
```

```ts
// webview-ui/group-label.ts  (webview — pure)
import type { GroupRect } from '../src/diagram/layoutFile';

/**
 * The label's offset from the box's top-left, in flow units, so the label sits
 * inside the on-screen part of the box and never leaves the box.
 * `viewport` and `label` are in flow units. Returns `{ x: 0, y: 0 }` when the
 * box and the viewport do not intersect.
 */
export function groupLabelOffset(
  box: GroupRect,
  viewport: GroupRect,
  label: { width: number; height: number },
): { x: number; y: number };
```

```ts
// webview-ui/hooks/useGroupCreateMode.ts  (webview)
import type { GroupCreateState, GroupPoint, GroupRect } from '../group-create-state';

export interface GroupCreateModeState {
  state: GroupCreateState;
  active: boolean;
  /** Hint banner text, or null while idle. */
  hint: string | null;
  start: () => void;
  cancel: () => void;
  /** Marquee rectangle in flow coordinates, or null. */
  marquee: GroupRect | null;
  onPointerDown: (point: GroupPoint) => void;
  onPointerMove: (point: GroupPoint) => void;
  /** Returns the finished rectangle when one was completed. */
  onPointerUp: (point: GroupPoint) => GroupRect | null;
}

export function useGroupCreateMode(): GroupCreateModeState;
```

```ts
// webview-ui/hooks/useGroups.ts  (webview)
import type { Node, NodeChange } from '@xyflow/react';
import type { DiagramGroup, DiagramLayoutTable, GroupRect } from '../../src/diagram/layoutFile';

export interface GroupsState {
  groups: DiagramGroup[];
  groupNodes: Node[];
  groupIds: ReadonlySet<string>;
  applyGroupNodeChanges: (changes: NodeChange[]) => void;
  /** Creates a group over `rect` and returns its new id. */
  addGroup: (rect: GroupRect) => string;
  renameGroup: (id: string, name: string) => void;
  removeGroup: (id: string) => void;
  resizeGroup: (id: string, width: number, height: number) => void;
  /** Recomputes every group's members from the current table positions. */
  syncMembers: (tables: readonly DiagramLayoutTable[]) => void;
  /** Seeds from an opened layout. */
  applyLayoutGroups: (groups: DiagramGroup[]) => void;
  /** The group whose label is in inline-rename mode, or null. */
  renameTarget: string | null;
  beginRename: (id: string) => void;
  endRename: () => void;
}

export function useGroups(): GroupsState;
```

```ts
// webview-ui/GroupNode.tsx  (webview)
export interface GroupNodeData extends Record<string, unknown> {
  group: DiagramGroup;
  renaming: boolean;
  onRename: (id: string, name: string) => void;
  onBeginRename: (id: string) => void;
  onEndRename: () => void;
  onResize: (id: string, width: number, height: number) => void;
}

export function GroupNode(props: NodeProps): JSX.Element;
```

```ts
// webview-ui/GroupMarquee.tsx  (webview)
export interface GroupMarqueeProps { rect: GroupRect }
export function GroupMarquee({ rect }: GroupMarqueeProps): JSX.Element;
```

```ts
// webview-ui/layout-dirty.ts  (webview — pure)
export interface LayoutSnapshot {
  tables: DiagramLayoutTable[];
  notes: DiagramNote[];
  /** Spec 31; undefined means a pre-feature snapshot. */
  groups?: DiagramGroup[];
  defaultColumnDisplay?: ColumnDisplayMode;
}
```

### Behavior notes

1. **Layout file compatibility.** A missing or `null` `groups` key parses to `[]`,
   exactly like `notes`. A non-array raises
   `Diagram file "groups" must be an array`. `LAYOUT_VERSION` stays `1` — the key
   is additive and older readers ignore it.
2. **Per-entry validation** mirrors `parseNotes` message-for-message:
   - non-mapping entry → `Every entry in "groups" must be a mapping`
   - missing/empty `id` → `Every group entry needs an "id"`
   - non-string `name` → `Group "<id>" needs a string "name"`
   - non-numeric `x`/`y` → `Group "<id>" needs numeric "x" and "y"`
   - non-numeric `width`/`height` → `Group "<id>" needs numeric "width" and "height"`
   - `models` present but not an array → `Group "<id>" needs a "models" array`
   Non-string entries inside `models` are dropped silently (they cannot name a
   model). A duplicate `id` keeps the first entry and skips the rest, like notes.
   A missing `name` becomes `''`; missing `width`/`height` fall back to the
   minimums; sizes are clamped to `GROUP_MIN_WIDTH`/`GROUP_MIN_HEIGHT` rather
   than rejected.
3. **Serialization.** The `groups` key is omitted entirely when the list is empty,
   like `notes`. Key order per entry is `id, name, x, y, width, height, models`.
   Entries are sorted by `id` and coordinates rounded by `normalizeGroups`, so a
   save is byte-stable and the dirty comparison (a `JSON.stringify` equality) does
   not flap.
4. **Membership rule.** A table is in a group when its **header centre** —
   `(x + NODE_WIDTH / 2, y + HEADER_HEIGHT / 2)`, using the constants exported by
   `src/diagram/layout.ts` — lies inside the rectangle, boundaries inclusive on
   the left/top and exclusive on the right/bottom. Using the header centre avoids
   depending on measured card heights, which vary with the column-display mode
   (spec 24). A table may belong to several overlapping groups; each lists it.
5. **Filtered-out models.** `syncGroupModels` is only ever handed the *currently
   visible* tables. Members that are not in that list are retained untouched, so
   filtering a model out of the diagram (spec 05) never silently drops it from a
   group.
6. **Membership is recomputed, never edited by hand.** `App` calls
   `groups.syncMembers(tables)` from the same `onPositionsChange` flow that feeds
   layout persistence, so a table drag, a group drag, a group resize and an
   auto-layout all converge on the same code path. There is no "add to group"
   command.
7. **Z-order and hit-testing.** Group nodes carry `zIndex: -1` and are spread
   **first** into `renderedNodes`, before note nodes (`0`/`5`) and table nodes
   (forced `1`). The box body is `pointer-events: none` so clicks, pans and
   rubber-band selection inside a group reach the pane and the tables exactly as
   before; only `.group__label` and `.group__grip` re-enable pointer events. The
   group node is therefore dragged **by its label** and resized **by its grip**.
   Group nodes are `selectable: false`; the Delete key must not delete a group
   (removal is menu-only, so it can never be confused with deleting a model).
8. **Moving a group moves only the box**, not its members. Membership is then
   recomputed, so sliding a box off its tables empties it. This is the least
   surprising rule given that membership is defined by geometry, and it is
   symmetric with dragging a table out.
9. **Label placement** uses `groupLabelOffset` against the current viewport
   rectangle in flow coordinates, derived from `useViewport()` and the canvas
   container size, with the label's pixel size divided by the zoom. The clamp
   order is: intersect first, then clamp into the box; when the box is entirely
   off-screen the offset is `{ x: 0, y: 0 }` (the box is invisible anyway, so the
   value only matters for determinism). A box narrower or shorter than the label
   clamps to `0` on that axis rather than producing a negative offset.
10. **Create gesture.** Clicking the toolbar button enters `armed`. The hint reads
    exactly `Drag a rectangle to group tables (Esc to cancel)`. While armed, the
    canvas surface shows the crosshair cursor via a `canvas__surface--group-create`
    modifier, mirroring `--fk-create`. Pointer-down on the pane anchors the
    marquee, pointer-move updates it, pointer-up ends the mode. Panning is
    suppressed while armed (`panOnDrag={false}` on `<ReactFlow>` when
    `groupCreateActive`), otherwise the drag would pan instead of drawing.
11. **Minimum size.** `endRect` returns no rectangle when the released width is
    below `GROUP_MIN_WIDTH` or the height below `GROUP_MIN_HEIGHT`; the state
    still returns to idle. This makes a stray click a harmless cancel rather than
    a one-pixel group.
12. **Naming.** `nextGroupName` returns `Group 1`, `Group 2`, … picking the
    smallest positive integer whose `Group N` name is unused, so deleting
    `Group 1` frees the name. After creation the new group's label enters inline
    rename with its text selected, mirroring how a new note focuses its textarea.
    An empty name committed by the user is kept as an empty string; the label chip
    still renders (as an empty chip) so the group remains renameable.
13. **Removal** deletes only the `DiagramGroup` record. No `ModelEdit` is posted,
    no table node is touched, no `model.yml` is written. The right-click menu on a
    group's label has exactly two items: `Rename` and `Remove group`.
14. **Dirty flag.** `isLayoutDirty` compares `JSON.stringify(current.groups ?? [])`
    against `JSON.stringify(saved.groups ?? [])`, so a pre-feature saved snapshot
    (`groups === undefined`) does not report dirty against a diagram with no
    groups.
15. **`buildLayout`'s new parameter is fifth and optional**, so every existing
    call site and unit test keeps compiling unchanged.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/layoutGroups.test.ts` | `normalizeRect handles a bottom-left drag` | `normalizeRect({x:100,y:100},{x:0,y:300})` | `{ x: 0, y: 100, width: 100, height: 200 }` |
| `test/unit/diagram/layoutGroups.test.ts` | `groupMembers includes a table whose header centre is inside` | rect `{x:0,y:0,width:600,height:400}`, tables `[{name:'orders',x:10,y:10}]` | `['orders']` |
| `test/unit/diagram/layoutGroups.test.ts` | `groupMembers excludes a table outside` | same rect, tables `[{name:'orders',x:1000,y:1000}]` | `[]` |
| `test/unit/diagram/layoutGroups.test.ts` | `groupMembers sorts ascending` | rect covering both, tables `[{name:'orders',…},{name:'customers',…}]` | `['customers','orders']` |
| `test/unit/diagram/layoutGroups.test.ts` | `syncGroupModels keeps filtered-out members` | group `models: ['hidden','orders']`, tables `[{name:'orders', inside}]` | `['hidden','orders']` |
| `test/unit/diagram/layoutGroups.test.ts` | `syncGroupModels drops a table dragged out` | group `models: ['orders']`, tables `[{name:'orders', outside}]` | `[]` |
| `test/unit/diagram/layoutGroups.test.ts` | `nextGroupName picks the first free integer` | `[{name:'Group 1'},{name:'Group 3'}]` | `'Group 2'` |
| `test/unit/diagram/layoutGroups.test.ts` | `parseGroups accepts a missing key` | `parseGroups(undefined, fail)` | `[]` |
| `test/unit/diagram/layoutGroups.test.ts` | `parseGroups rejects a non-array` | `parseGroups('x', fail)` | throws `Diagram file "groups" must be an array` |
| `test/unit/diagram/layoutGroups.test.ts` | `parseGroups clamps a tiny size` | one entry `width: 4, height: 4` | `width: 160, height: 120` |
| `test/unit/diagram/layoutGroups.test.ts` | `parseGroups keeps the first duplicate id` | two entries with `id: 'g-1'`, names `A` and `B` | one group named `'A'` |
| `test/unit/diagram/layoutGroups.test.ts` | `normalizeGroups rounds and sorts` | `[{id:'g-2',x:1.4,…},{id:'g-1',…}]` | ids `['g-1','g-2']`, `x: 1` |
| `test/unit/diagram/layoutFile.test.ts` | `round-trips groups` | layout with one group, serialize then parse | deep-equals the original group |
| `test/unit/diagram/layoutFile.test.ts` | `omits an empty groups key` | layout with `groups: []` | serialized text contains no `groups:` |
| `test/unit/diagram/layoutFile.test.ts` | `parses a pre-feature file` | text with `tables` only | `layout.groups` is `[]` |
| `test/unit/diagram/layoutFile.test.ts` | `applyLayout passes groups through` | layout with one group, `knownModels` empty | `applied.groups` deep-equals the layout's groups |
| `test/unit/webview/groupCreateState.test.ts` | `start arms the gesture` | `startGroupCreate()` | `{ active: true, anchor: null }` |
| `test/unit/webview/groupCreateState.test.ts` | `beginRect anchors the marquee` | `beginRect({active:true,anchor:null},{x:5,y:5})` | `{ active: true, anchor: {x:5,y:5}, current: {x:5,y:5} }` |
| `test/unit/webview/groupCreateState.test.ts` | `endRect returns the rectangle` | anchor `{0,0}`, up at `{400,300}` | `rect` `{x:0,y:0,width:400,height:300}`, `state` `{active:false}` |
| `test/unit/webview/groupCreateState.test.ts` | `endRect rejects a too-small rectangle` | anchor `{0,0}`, up at `{5,5}` | `rect` `undefined`, `state` `{active:false}` |
| `test/unit/webview/groupCreateState.test.ts` | `beginRect is a no-op while idle` | `beginRect({active:false},{x:1,y:1})` | `{ active: false }` |
| `test/unit/webview/groupLabel.test.ts` | `keeps the label at the top-left when fully visible` | box `{0,0,400,300}`, viewport `{-100,-100,1000,1000}`, label `{80,20}` | `{ x: 0, y: 0 }` |
| `test/unit/webview/groupLabel.test.ts` | `pushes the label into the visible corner` | box `{0,0,400,300}`, viewport `{200,150,1000,1000}`, label `{80,20}` | `{ x: 200, y: 150 }` |
| `test/unit/webview/groupLabel.test.ts` | `never leaves the box` | box `{0,0,400,300}`, viewport `{380,290,1000,1000}`, label `{80,20}` | `{ x: 320, y: 280 }` |
| `test/unit/webview/groupLabel.test.ts` | `returns the origin when off-screen` | box `{0,0,400,300}`, viewport `{5000,5000,100,100}` | `{ x: 0, y: 0 }` |
| `test/unit/webview/groupLabel.test.ts` | `clamps to zero for a box narrower than the label` | box `{0,0,40,300}`, viewport `{20,0,1000,1000}`, label `{80,20}` | `{ x: 0, y: 0 }` |
| `test/unit/webview/layout-dirty.test.ts` | `a new group makes the layout dirty` | current with one group, saved with `groups: []` | `true` |
| `test/unit/webview/layout-dirty.test.ts` | `a pre-feature snapshot is not dirty` | current `groups: []`, saved `groups: undefined` | `false` |

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.
- Manual: with `fixtures/sample-dbt/` open, draw a group around two models, rename
  it, drag a third model in and out, pan until only a corner shows and confirm the
  label follows, save, close and reopen the layout file.

### Do not touch

- `src/dbt/**` — a group is layout-only; no dbt file may be read or written by
  this feature.
- `src/diagram/graph.ts`, `flow.ts`, `routing.ts`, `layout.ts` — nodes, edges,
  routing and auto-layout are unaware of groups. `layout.ts` is imported only for
  the `NODE_WIDTH` / `HEADER_HEIGHT` constants.
- `LAYOUT_VERSION` — stays `1`.
- Note behavior: `useNotes`, `NoteNode`, note z-indices and the note context menu
  must be byte-identical apart from the `renderedNodes` spread order.
- The FK-draw gesture and its Escape handling.
- `src/shared/protocol.ts` — groups travel inside the existing `DiagramLayout`
  payload of `layout:save` / `layout:pending`; no new message type.

## Acceptance Criteria

- [ ] A `Group` toolbar button sits next to "Add note" and starts the marquee mode.
- [ ] Dragging a rectangle creates a named group containing the tables under it,
      then exits the mode.
- [ ] Escape, and a below-minimum rectangle, both cancel without creating a group.
- [ ] The group label stays inside the on-screen part of the box.
- [ ] Dragging a table in or out of the box updates the member list; no
      `model.yml` is written.
- [ ] The group's right-click menu offers `Rename` and `Remove group`, and
      removing a group leaves every model in place.
- [ ] Groups survive save → close → reopen of the layout file, and a layout file
      written before this feature still opens.
- [ ] `npm run verify` is green.
