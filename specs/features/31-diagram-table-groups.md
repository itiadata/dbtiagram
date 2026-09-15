---
id: 31
title: Group selected tables inside a named, coloured box
status: approved
priority: high
created: 2026-08-31
owner: unassigned
depends_on: [13, 16, 22, 28, 40, 41]
---

# Group selected tables inside a named, coloured box

## Summary

As a data modeller, I want to select tables into a named, coloured group whose
box follows those tables, so that related models remain a clear visual unit as I
rearrange the diagram without changing dbt YAML.

## Background

Sticky notes annotate a diagram but do not identify a set of related tables.
Groups are layout-only records saved in `.dbtiagram.yml`. Creation and membership
editing reuse the native searchable, multi-select VS Code Quick Pick interaction
used when selecting source tables for import. Unlike the former geometry-driven
proposal, membership is explicit and the rectangle is always derived from the
current positions and measured sizes of its member tables.

## Scope

**In scope**

- Create a group by selecting one or more currently displayed tables, then
  entering a non-blank group name.
- Create and edit groups before the diagram has ever been saved; saving is not a
  prerequisite for any group action.
- One group per table; grouped tables cannot be offered to another group.
- Derive each group rectangle from its members, with padding for its label.
- Keep the group name visible inside the on-screen portion of its rectangle.
- Adapt the rectangle whenever a member table moves or changes measured size.
- Edit membership, rename, recolour, or remove a group from its context menu.
- Add or remove a table through its context menu.
- Delete a group when membership editing is confirmed with no selected tables.
- Persist only group identity, name, palette colour, and member table IDs.
- Support model and source diagrams, preserving qualified source-table IDs.
- Include groups in layout dirty-state, explicit save, and pending close-time save.

**Out of scope**

- Persisting, moving, or resizing a group rectangle.
- Membership inferred from rectangle overlap or table coordinates.
- A table belonging to more than one group.
- Nesting or collapsing groups.
- Moving all members by dragging a group.
- Any change to dbt model/source YAML, graph edges, routing, filtering, or
  auto-layout.
- Arbitrary colour input outside the fixed palette.

## Scenarios

### Create a named group from selected tables

```
Given ungrouped tables "orders" and "customers" are present in the diagram
When I click the "Create group" toolbar button
Then a searchable multi-select picker lists the ungrouped tables present in the diagram
When I select "orders" and "customers" and confirm
Then I am prompted for a group name
When I enter "Sales" and confirm
Then a group named "Sales" contains those two tables
And its box encloses their current rectangles
And it receives the next colour from the default palette cycle
```

### Create a group in an unsaved diagram

```
Given a diagram opened from a dbt YAML file or the command palette
And it has not yet been saved as a `.dbtiagram.yml` file
When I create a named group from one or more displayed tables
Then the group is created and rendered immediately
And clicking "Save as new diagram" later persists that group
```

### Cancel creation without changing the layout

```
Given I started creating a group
When I cancel either the table picker or name prompt
Then no group is created
And the diagram dirty state is unchanged
```

### Require a selection and a name

```
Given the create-group table picker is open
When I confirm with no selected table
Then the picker remains open
Given the name prompt is open
When I enter only whitespace and confirm
Then validation says "Enter a group name"
```

### Keep the box around moved members

```
Given group "Sales" contains "orders" and "customers"
When I move either member table
Then the group rectangle immediately becomes the padded bounding rectangle of both tables
And unrelated tables may remain visually inside that rectangle
```

### Keep the name visible

```
Given part of a group rectangle is visible in the viewport
When its natural top-left label position is off screen
Then the name is drawn inside the visible portion of the group rectangle
```

### Edit a group's tables

```
Given group "Sales" contains "orders"
And ungrouped table "customers" is present in the diagram
When I right-click the group and choose "Edit group tables"
Then a searchable multi-select picker shows "orders" selected and "customers" unselected
When I select both and confirm
Then "Sales" contains both tables
And its rectangle adapts to enclose both
```

### Emptying a group deletes it

```
Given group "Sales" contains "orders"
When I choose "Edit group tables", deselect every table, and confirm
Then group "Sales" is deleted
And "orders" remains present and unmoved
```

### Add an ungrouped table from its menu

```
Given table "orders" belongs to no group
And groups "Sales" and "Finance" exist
When I right-click "orders" and choose "Add to group" then "Sales"
Then "orders" becomes a member of "Sales"
And the group rectangle adapts to enclose it
```

### Remove a grouped table from its menu

```
Given table "orders" belongs to group "Sales"
When I right-click "orders" and choose "Remove from group"
Then "orders" no longer belongs to a group
And because "Sales" has no remaining members, "Sales" is deleted
```

### Rename and recolour a group

```
Given group "Sales" uses the blue palette colour
When I right-click its rectangle and choose "Rename group"
And I enter "Commercial" and confirm
Then its displayed and persisted name is "Commercial"
When I choose "Change color" and then "Purple"
Then the rectangle uses the theme-compatible purple palette colour
```

### Remove a group without removing tables

```
Given group "Sales" contains "orders"
When I right-click its rectangle and choose "Remove group"
Then the group disappears
And "orders" remains present and unmoved
```

### Groups round-trip without rectangle coordinates

```
Given a blue group "Sales" contains "orders"
When I save and reopen the diagram
Then "Sales", blue, and member "orders" are restored
And its member IDs are stored under the key `tables`
And the saved group entry has no x, y, width, or height keys
And its rectangle is derived from the restored table position
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/diagram/layoutGroups.ts` | modify | Pure group model, palette, validation, normalization, membership mutations, default colour selection, derived bounding rectangles, and `tables` persistence parsing. |
| `src/diagram/layoutFileNames.ts` | create | Extract layout suffix/name helpers to keep `layoutFile.ts` within the size cap. |
| `src/diagram/layoutFile.ts` | modify | Parse, serialize, build, apply, and re-export layout groups. |
| `src/shared/protocol.ts` | modify | Typed requests/results for create, membership edit, and rename native pickers. |
| `src/vscode/groupPicker.ts` | create | Native searchable multi-select table picker and group-name input prompt. |
| `src/webview/panel.ts` | modify | Handle group picker requests and return cancelled or confirmed results. |
| `webview-ui/group-label.ts` | create | Pure visible-viewport label placement. |
| `webview-ui/group-state.ts` | create | Pure transitions for picker results and direct table/group menu mutations. |
| `webview-ui/hooks/useGroups.ts` | modify | Own group state, picker requests/results, membership rules, colour, derived nodes, layout seeding, and unsaved-diagram creation. |
| `webview-ui/GroupNode.tsx` | create | Render the non-movable group rectangle and visible name label. |
| `webview-ui/DiagramCanvas.tsx` | modify | Register and render group nodes behind notes/tables and expose Create group. |
| `webview-ui/App.tsx` | modify | Compose groups, handle picker results, and add group/table context-menu actions. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch group picker result messages. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Include groups in save, dirty snapshots, pending sync, and opened-layout seeding. |
| `webview-ui/layout-dirty.ts` | modify | Compare groups as part of layout dirty state. |
| `webview-ui/icons.ts` | modify | Re-export icons used by group actions. |
| `webview-ui/styles.css` | modify | Theme-compatible group fills, borders, labels, and palette swatches. |
| `specs/ARCHITECTURE.md` | modify | Record new modules and revised responsibilities. |
| `test/unit/diagram/layoutGroups.test.ts` | modify | Pure group persistence, membership, palette, and rectangle tests. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Group `tables` key compatibility and round-trip tests. |
| `test/unit/webview/groupLabel.test.ts` | create | Visible label placement tests. |
| `test/unit/webview/groupState.test.ts` | modify | Creation cancellation, unsaved creation, picker result, rename, membership, colour, and deletion transitions. |
| `test/unit/webview/layout-dirty.test.ts` | modify | Group dirty-state tests. |
| `test/unit/webview/layoutMessages.test.ts` | modify | Group pass-through in model/source layout messages. |

### Signatures

```ts
// src/diagram/layoutGroups.ts (pure — must not import `vscode`)
export type GroupColor = 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'cyan';
export const GROUP_COLORS: readonly GroupColor[];
export const GROUP_PADDING = 32;
export const GROUP_LABEL_HEIGHT = 28;

export interface DiagramGroup {
  id: string;
  name: string;
  color: GroupColor;
  models: string[];
}
export interface GroupRect { x: number; y: number; width: number; height: number }
export interface GroupTableRect extends GroupRect { name: string }

export function isGroupColor(value: unknown): value is GroupColor;
export function normalizeGroupName(value: string): string | undefined;
export function newGroupId(random: () => number): string;
export function nextGroupColor(groups: readonly DiagramGroup[]): GroupColor;
export function normalizeGroups(groups: readonly DiagramGroup[]): DiagramGroup[];
export function parseGroups(raw: unknown, fail: (message: string) => never): DiagramGroup[];
export function groupForModel(groups: readonly DiagramGroup[], model: string): DiagramGroup | undefined;
export function replaceGroupModels(groups: readonly DiagramGroup[], id: string, models: readonly string[]): DiagramGroup[];
export function addModelToGroup(groups: readonly DiagramGroup[], id: string, model: string): DiagramGroup[];
export function removeModelFromGroup(groups: readonly DiagramGroup[], model: string): DiagramGroup[];
export function groupRect(group: DiagramGroup, tables: readonly GroupTableRect[]): GroupRect | null;
```

```ts
// src/diagram/layoutFileNames.ts (pure — must not import `vscode`)
export const LAYOUT_FILE_SUFFIX = '.dbtiagram.yml';
export function isLayoutFilePath(fsPath: string | undefined): boolean;
export function defaultLayoutName(fsPath: string): string;
export function stripLayoutSuffix(name: string): string;
```

```ts
// src/diagram/layoutFile.ts (pure — must not import `vscode`)
export type { DiagramGroup, GroupColor, GroupRect, GroupTableRect } from './layoutGroups';
export { GROUP_COLORS, GROUP_PADDING, GROUP_LABEL_HEIGHT, groupRect } from './layoutGroups';

// Add `groups: DiagramGroup[]` to DiagramLayout and AppliedLayout.
export function buildLayout(
  name: string,
  mode: DiagramMode,
  visible: readonly { name: string; x: number; y: number }[],
  notes?: readonly DiagramNote[],
  columnDisplay?: { default: ColumnDisplayMode; overrides: ReadonlyMap<string, ColumnDisplayMode> },
  groups?: readonly DiagramGroup[],
): DiagramLayout;
```

```ts
// src/shared/protocol.ts (shared — must not import `vscode`)
export interface GroupPickerCandidate { id: string; label: string }
// Add to MessageToExtension:
// { type: 'group:create'; candidates: GroupPickerCandidate[] }
// { type: 'group:editTables'; groupId: string; candidates: GroupPickerCandidate[]; selected: string[] }
// { type: 'group:rename'; groupId: string; currentName: string }
// Add to MessageToWebview:
// { type: 'group:createResult'; result: { name: string; models: string[] } | null }
// { type: 'group:editTablesResult'; groupId: string; models: string[] | null }
// { type: 'group:renameResult'; groupId: string; name: string | null }
```

```ts
// src/vscode/groupPicker.ts (vscode-facing)
export function pickGroupTables(
  candidates: readonly GroupPickerCandidate[],
  selected?: ReadonlySet<string>,
): Promise<string[] | undefined>;
export function promptGroupName(currentName?: string): Promise<string | undefined>;
```

```ts
// webview-ui/group-label.ts (webview — pure)
export function groupLabelOffset(
  box: GroupRect,
  viewport: GroupRect,
  label: { width: number; height: number },
): { x: number; y: number };
```

```ts
// webview-ui/group-state.ts (webview — pure)
export function createGroupFromPicker(
  groups: readonly DiagramGroup[],
  id: string,
  result: { name: string; models: string[] } | null,
): DiagramGroup[];
export function applyGroupTablePicker(
  groups: readonly DiagramGroup[],
  id: string,
  models: readonly string[] | null,
): DiagramGroup[];
export function applyGroupRename(
  groups: readonly DiagramGroup[],
  id: string,
  name: string | null,
): DiagramGroup[];
export function changeGroupColor(
  groups: readonly DiagramGroup[],
  id: string,
  color: GroupColor,
): DiagramGroup[];
```

```ts
// webview-ui/hooks/useGroups.ts (webview)
export interface GroupNodeData extends Record<string, unknown> {
  group: DiagramGroup;
  viewport: GroupRect;
  zoom: number;
}
export interface GroupsState {
  groups: DiagramGroup[];
  groupNodes: Node<GroupNodeData, 'group'>[];
  groupIds: ReadonlySet<string>;
  mutationRevision: number;
  startCreate: (candidates: readonly GroupPickerCandidate[]) => void;
  startEditTables: (id: string, candidates: readonly GroupPickerCandidate[]) => void;
  startRename: (id: string) => void;
  applyCreateResult: (result: { name: string; models: string[] } | null) => void;
  applyEditTablesResult: (id: string, models: string[] | null) => void;
  applyRenameResult: (id: string, name: string | null) => void;
  addModel: (id: string, model: string) => void;
  removeModel: (model: string) => void;
  setColor: (id: string, color: GroupColor) => void;
  removeGroup: (id: string) => void;
  applyLayoutGroups: (groups: readonly DiagramGroup[]) => void;
  setTableRects: (tables: readonly GroupTableRect[]) => void;
}
export function useGroups(): GroupsState;
```

```ts
// webview-ui/GroupNode.tsx (webview)
export function GroupNode(props: NodeProps<Node<GroupNodeData, 'group'>>): JSX.Element;
```

```ts
// webview-ui/hooks/useLayoutPersistence.ts (webview)
export interface PersistedGroupsState {
  groups: readonly DiagramGroup[];
  mutationRevision: number;
}
export function useLayoutPersistence(
  mode: DiagramMode,
  notes?: readonly DiagramNote[],
  groups?: PersistedGroupsState,
  columnDisplay?: { defaultMode: ColumnDisplayMode; overrides: Map<string, ColumnDisplayMode> },
): LayoutPersistenceState;
```

```ts
// webview-ui/layout-dirty.ts (webview — pure)
// Add `groups?: DiagramGroup[]` to LayoutSnapshot.
```

### Behavior notes

1. Layout schema version stays `2`. Missing or `null` `groups` parses as `[]`;
   malformed groups produce the same strict, contextual errors used for notes.
   Entries persist in key order `id, name, color, tables`; no geometry key is
   accepted into the in-memory record or emitted. Duplicate IDs keep the first.
   The internal `DiagramGroup.models` property remains an implementation detail;
   the YAML representation uses only `tables`.
2. Group names are trimmed, must be non-empty, and need not be unique. The input
   validation message is exactly `Enter a group name`. Cancelling a picker or
   name input produces a `null` result and changes nothing.
3. `pickGroupTables` uses `createQuickPick`, `canSelectMany = true`, and labels
   matching the diagram's displayed table labels. Create keeps the picker open
   on empty acceptance. Edit allows empty acceptance because it deletes the group.
4. Create candidates are all currently displayed, ungrouped tables. Edit
   candidates are the group's current members plus currently displayed,
   ungrouped tables. A table cannot belong to multiple groups.
5. A table menu shows `Add to group` only when ungrouped; its submenu lists every
   group. It shows `Remove from group` only when grouped. Removing the final
   member deletes the group. If there are no groups, `Add to group` is disabled
   with title `No groups available`.
6. The group menu has exactly `Edit group tables`, `Rename group`, `Change color`
   (palette submenu), and `Remove group`. Right-clicking any visible part of the
   rectangle, including the label, opens it.
7. Palette order is blue, green, amber, purple, rose, cyan. Creation chooses the
   least-used colour, breaking ties by this order, so each newly proposed colour
   differs until the palette is exhausted. Light-theme borders are respectively
   `#2563eb`, `#16a34a`, `#d97706`, `#9333ea`, `#e11d48`, `#0891b2`; dark-theme
   borders are `#60a5fa`, `#4ade80`, `#fbbf24`, `#c084fc`, `#fb7185`, `#22d3ee`.
   Fills use the matching border at 10% opacity and labels at 18% opacity.
   `color` is persisted as the palette name, not raw CSS.
8. A rectangle is the union of current measured member-table rectangles, expanded
   left/right/bottom by `GROUP_PADDING`, and expanded on top by
   `GROUP_PADDING + GROUP_LABEL_HEIGHT`. Non-member tables may overlap or sit
   inside it. Moving/removing a member or changing its measured card size
   re-derives the rectangle; moving unrelated tables does not change membership.
9. A group with members hidden by filters remains persisted. It renders around
   its currently visible members; if none are visible, it has no React Flow node.
10. Group nodes render before notes and tables with `zIndex: -1`, are not draggable,
    resizable, selectable, or keyboard-deletable, and do not participate in edge
    routing. Their body accepts context-menu pointer events but ordinary primary
    clicks and drags pass through to normal pane/table behavior.
11. The label uses `groupLabelOffset` and remains within the intersection of the
    group rectangle and viewport whenever that intersection can contain it.
12. Auto-layout moves tables normally, then groups re-derive around them. Fit View
    and post-auto-layout fit include rendered groups. No group action posts
    `diagram:edit` or writes dbt YAML.
13. Groups are normalized by ID; member IDs are de-duplicated and sorted. Group
    changes increment `mutationRevision`, arming pending-layout sync even when no
    table is visible. Applying an opened layout does not increment it.
14. Both model and source modes behave identically. Source IDs remain qualified.
15. Group creation and every local group mutation are independent of
    `activeLayout`. An unsaved diagram keeps groups in webview state and includes
    them when the existing Save-as-new action builds its first layout payload.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/layoutGroups.test.ts` | `cycles through least-used palette colours` | six colours used once, blue used twice | `'green'` |
| `test/unit/diagram/layoutGroups.test.ts` | `trims and validates a group name` | `'  Sales  '` and `'   '` | `'Sales'` and `undefined` |
| `test/unit/diagram/layoutGroups.test.ts` | `finds a table's only group` | Sales contains orders | Sales |
| `test/unit/diagram/layoutGroups.test.ts` | `adding a model removes it from any former group` | orders in A; add orders to B | A deleted; B contains orders |
| `test/unit/diagram/layoutGroups.test.ts` | `removing the last model deletes its group` | Sales contains only orders | `[]` |
| `test/unit/diagram/layoutGroups.test.ts` | `replacing membership with empty deletes the group` | Sales plus `[]` | `[]` |
| `test/unit/diagram/layoutGroups.test.ts` | `derives a padded bounding rectangle` | two member rects plus one non-member rect | exact union expanded by 32 and top label height 28 |
| `test/unit/diagram/layoutGroups.test.ts` | `ignores non-members when deriving a rectangle` | central non-member extends outside member bounds | same rectangle as members alone |
| `test/unit/diagram/layoutGroups.test.ts` | `returns null with no visible members` | members absent from table rects | `null` |
| `test/unit/diagram/layoutGroups.test.ts` | `normalizes ids and qualified source members` | duplicates and `finance.orders` | sorted unique strings preserved |
| `test/unit/diagram/layoutGroups.test.ts` | `rejects an unknown colour` | `color: 'orange'` | throws `Group "g-1" has an invalid "color"` |
| `test/unit/diagram/layoutGroups.test.ts` | `rejects persisted geometry by ignoring it` | valid group plus x/y/width/height | normalized group has only id/name/color/models |
| `test/unit/diagram/layoutFile.test.ts` | `round-trips groups without geometry` | one blue Sales group | YAML group is `{id,name,color,tables}` and parses to the internal group |
| `test/unit/diagram/layoutFile.test.ts` | `does not write the internal models key` | one group | serialized YAML contains `tables:` and no group-level `models:` |
| `test/unit/diagram/layoutFile.test.ts` | `parses a pre-group file` | tables with no groups key | `groups: []` |
| `test/unit/diagram/layoutFile.test.ts` | `omits empty groups` | `groups: []` | no `groups:` key |
| `test/unit/diagram/layoutFile.test.ts` | `passes source groups through applyLayout` | member `finance.orders` | qualified member unchanged |
| `test/unit/webview/groupLabel.test.ts` | `keeps a fully visible label at group top-left` | fully visible box | `{x:0,y:0}` |
| `test/unit/webview/groupLabel.test.ts` | `moves the label into the visible intersection` | only bottom-right visible | offset clamped inside box |
| `test/unit/webview/groupState.test.ts` | `creates from a confirmed picker result` | empty groups, id `g-1`, Sales with orders/customers | one normalized group using blue |
| `test/unit/webview/groupState.test.ts` | `creates without an active saved layout` | empty groups and confirmed picker result, with no layout path | one group; no layout path dependency |
| `test/unit/webview/groupState.test.ts` | `cancelled creation changes nothing` | one existing group and `null` | same array reference |
| `test/unit/webview/groupState.test.ts` | `edits membership and deletes on empty confirmation` | Sales with orders; then customers; then `[]` | Sales contains customers; then `[]` |
| `test/unit/webview/groupState.test.ts` | `cancelled membership edit changes nothing` | Sales and `null` | same array reference |
| `test/unit/webview/groupState.test.ts` | `renames only on a confirmed nonblank name` | Sales with `Commercial`, `null`, and whitespace | Commercial; then unchanged; then unchanged |
| `test/unit/webview/groupState.test.ts` | `changes a group's colour` | blue Sales changed to purple | colour `'purple'` |
| `test/unit/webview/layout-dirty.test.ts` | `a membership change is dirty` | saved orders, current customers | `true` |
| `test/unit/webview/layout-dirty.test.ts` | `a colour change is dirty` | saved blue, current purple | `true` |
| `test/unit/webview/layout-dirty.test.ts` | `pre-group empty layouts are not dirty` | saved groups undefined, current `[]` | `false` |
| `test/unit/webview/layoutMessages.test.ts` | `passes model and source groups through layout messages` | both modes | names, colours, and exact IDs unchanged |

Native Quick Pick and input-box behavior is covered by manual verification; the
pure membership, validation, geometry, persistence, and message payload behavior
carry automated coverage without a VS Code Electron launch.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- `npm run typecheck` — must be green immediately before commit.
- Manual: in model and source modes, create/cancel/edit/empty-delete a group;
  add/remove a table from its menu; rename, recolour, and remove a group; move and
  resize member cards through ordinary diagram changes; filter all members;
  overlap an unrelated table; pan the label off its natural position; auto-layout;
  save, close, and reopen; inspect YAML to confirm no group geometry is stored.

### Do not touch

- `src/dbt/**` — groups cannot alter dbt YAML.
- `src/diagram/graph.ts`, `routing.ts`, `flow.ts`, or `layout.ts` — graph, edge,
  routing, and automatic table placement remain group-unaware.
- `LAYOUT_VERSION` — remains `2`.
- Sticky-note behavior and FK-create behavior.
- Existing source-import picker behavior; the group picker may mirror its UX but
  does not modify `src/vscode/sourceImportPicker.ts`.

## Acceptance Criteria

- [ ] Create group uses a searchable multi-select table picker followed by a name prompt.
- [ ] A table belongs to at most one group.
- [ ] Group and table context menus provide all specified membership, rename, colour, and removal actions.
- [ ] Emptying a group deletes it without deleting or moving tables.
- [ ] The derived box always encloses visible member tables and may overlap non-members.
- [ ] The group name remains visible inside the on-screen part of its rectangle.
- [ ] The six-colour theme-compatible palette cycles by least use and persists by name.
- [ ] Saved groups contain no rectangle coordinates and reopen correctly in both modes.
- [ ] Saved group members use the YAML key `tables`, never `models`.
- [ ] Group creation works before the diagram has been saved.
- [ ] No group action writes dbt YAML.
- [ ] `npm test` and `npm run typecheck` are green.
