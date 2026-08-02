---
id: 11
title: Sidebar visibility and resizable widths
status: approved
priority: medium
created: 2026-08-01
owner: unassigned
depends_on: [05, 06]
---

# Sidebar visibility and resizable widths

## Summary

As a user of the dbt Diagram, I want the left filter sidebar and the right
details (properties) sidebar to be **independently hideable and showable**, and
their **widths adjustable by dragging**, so I can give the canvas more room
while keeping quick access to filtering and properties. Selecting a table or a
column automatically reveals the details sidebar, so properties never seem to
have "disappeared".

## Background

Spec 05 and spec 06 added a fixed 260px left filter sidebar and a fixed 260px
right details sidebar. Both are always visible and none of their layout
attributes are user-adjustable. The diagram webview state policy (spec 05/06)
is plain webview state: it survives panel hide/reveal via
`retainContextWhenHidden` and resets on panel reopen — this feature follows the
same policy.

## Scope

- `webview-ui/App.tsx` — visibility and width state; auto-reveal of the
  details sidebar on selection; the collapsed rails and the drag-resize
  handlers.
- `webview-ui/FilterSidebar.tsx` — collapse control in its header;
  `onCollapse` prop.
- `webview-ui/DetailsSidebar.tsx` — collapse control in its header;
  `onCollapse` prop.
- `webview-ui/styles.css` — rail and resizer styling; width-driven layout.

### Out of scope

- Persisting visibility/width across panel reopen (plain webview state,
  matching spec 05/06).
- Vertical sidebar sections' collapse toggles (already exist in the filter
  sidebar; unchanged).
- Any change to the extension host or the pure `src/dbt` / `src/diagram`
  layers — this feature is webview-only.

## Implementation Notes

### 1. State (`webview-ui/App.tsx`)

```ts
const [filterVisible, setFilterVisible] = useState(true);
const [detailsVisible, setDetailsVisible] = useState(true);
const [filterWidth, setFilterWidth] = useState(SIDEBAR_DEFAULT_WIDTH);   // 260
const [detailsWidth, setDetailsWidth] = useState(SIDEBAR_DEFAULT_WIDTH); // 260
```

Constants: `SIDEBAR_DEFAULT_WIDTH = 260`, `SIDEBAR_MIN_WIDTH = 160`,
`SIDEBAR_MAX_WIDTH = 480` (module-level in `App.tsx`).

### 2. Layout

`.app__body` (flex row) renders, in order:

1. `filterVisible ? <FilterSidebar … onCollapse={() => setFilterVisible(false)} /> : <SidebarRail side="left" onExpand={() => setFilterVisible(true)} />`
2. `filterVisible && <SidebarResizer … />` (left sidebar's inner edge)
3. `.app__main` (canvas)
4. `detailsVisible && <SidebarResizer … />` (details sidebar's inner edge)
5. `detailsVisible ? <DetailsSidebar … onCollapse={() => setDetailsVisible(false)} /> : <SidebarRail side="right" onExpand={() => setDetailsVisible(true)} />`

- The visible sidebars receive `style={{ width: filterWidth }}` /
  `style={{ width: detailsWidth }}`; their CSS drops the fixed `width` in favor
  of `flex: 0 0 auto` so the inline width wins. Their existing
  `flex-shrink: 0` behavior is preserved.
- `SidebarRail` is a small presentational component in `App.tsx`: a fixed
  ~28px strip with a chevron button (tooltip "Show filter sidebar" /
  "Show properties sidebar") that calls `onExpand`. The rail mirrors the
  sidebar's visual language (border on the main side, same background).
- `SidebarResizer` is a presentational strip (~6px wide) on the sidebar's
  inner edge with `cursor: col-resize`, wired via pointer events.

### 3. Collapse / expand controls

- Each visible sidebar gets a collapse button in its header: the filter
  sidebar shows a chevron at the top-right of the Filter section row; the
  details sidebar shows a chevron at the top-right of the aside. Clicking it
  hides the sidebar (leaving its rail).
- The rails re-open the sidebars. There is no other expand trigger.

### 4. Auto-reveal on selection

`onTableSelect` and `onColumnSelect` call `setDetailsVisible(true)` in
addition to their existing behavior — so clicking a table header, a column
row, or double-clicking an FK edge (which selects the child table) reveals the
properties sidebar. The filter sidebar has no auto-reveal trigger.

### 5. Drag resize

`SidebarResizer` uses pointer events:

```
onPointerDown: record the pointer id, the drag axis, the app body's bounding
  rect, and the starting width; setPointerCapture on the element; add window
  pointermove/pointerup listeners.
onPointerMove: left sidebar  -> width = clamp(pointer.x - body.left)
               details sidebar -> width = clamp(body.right - pointer.x)
  clamped to [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH].
onPointerUp: release capture, remove listeners.
```

The width is set through the `setFilterWidth` / `setDetailsWidth` state so the
sidebar re-renders live during the drag. Dragging the resizer must not start a
canvas pan (the resizer sits outside `.app__main`).

### 6. Styles (`webview-ui/styles.css`)

- `.sidebar`, `.details`: remove the fixed `width`, keep `flex-shrink: 0`
  plus `box-sizing: border-box` (width now inline).
- `.rail`: `width: 28px; flex-shrink: 0; display: flex; align-items: center;
  justify-content: center;` with `border-right` (left rail) / `border-left`
  (right rail) and the sidebar background; a `rail__button` chevron.
- `.sidebar-resizer`: `width: 6px; flex-shrink: 0; cursor: col-resize;`
  with a transparent background and an accent hover tint; `touch-action:
  none` so pointer drags work on touch devices.
- The chevron reuses the existing `.sidebar__chevron` look (rotated to point
  toward the main area).

### 7. Tests

No changes under `src/dbt/` or `src/diagram/` (webview-only feature; the repo
has no webview unit-test harness). The existing unit + integration suites and
`npm run typecheck` must stay green; behavior is verified manually.

## Scenarios

### Collapsing the filter sidebar shows a rail

```
Given the dbt Diagram is open with both sidebars visible
When the user clicks the collapse control on the filter sidebar
Then the filter sidebar hides and a narrow rail appears on the left
And the canvas grows to fill the freed space
When the user clicks the rail's expand button
Then the filter sidebar reappears with its previous width and state
```

### The details sidebar collapses independently

```
Given the dbt Diagram is open with both sidebars visible
When the user collapses the details sidebar
Then the filter sidebar is unaffected
And a narrow rail appears on the right
```

### Selecting a table or column re-opens the details sidebar

```
Given the dbt Diagram is open and the details sidebar is collapsed to its rail
When the user clicks the orders table header
Then the details sidebar becomes visible showing the orders properties
And the orders card is selected
When the user collapses it again and clicks the order_id row
Then the details sidebar becomes visible showing the order_id column properties
```

### Dragging the details sidebar edge resizes it

```
Given the dbt Diagram is open
When the user drags the details sidebar's left edge to the right
Then the details sidebar widens up to the maximum of 480px
When the user drags it past the minimum
Then it clamps at 160px and never collapses into nothing
```

### The two sidebars resize independently

```
Given the dbt Diagram is open
When the user drags the filter sidebar's right edge and the details sidebar's
  left edge to different widths
Then each sidebar keeps its own width
```

### Visibility and widths survive panel hide/reveal

```
Given the dbt Diagram is open with the details sidebar hidden at a custom width
When the user switches away from the diagram tab and back
Then the details sidebar is still hidden and the widths are unchanged
```

## Acceptance Criteria

- [ ] The left filter sidebar and the right details sidebar hide/show
      independently via a collapse control and a slim reopen rail; collapsing
      one never affects the other.
- [ ] Clicking a table header, a column row, or double-clicking an FK edge
      reveals the details sidebar automatically.
- [ ] Both visible sidebars resize by dragging their inner edge, clamped to
      160–480px, and their widths are independent.
- [ ] Visibility and width state follows the repo's plain-webview-state policy
      (survives panel hide/reveal, resets on reopen).
- [ ] No changes under `src/dbt/` or `src/diagram/`; the existing unit and
      integration suites and `npm run typecheck` stay green.

## Confirm at Approval

- **(a) Plain webview state.** Visibility and widths are not persisted across
  panel reopen (consistent with spec 05's filter selection and spec 06's
  selection policy). If session persistence is wanted, say so.
- **(b) Defaults and clamps.** Default width 260px; drag clamps to 160–480px;
  collapsed rail ~28px.
- **(c) Auto-reveal scope.** Only the details sidebar auto-reveals, and only on
  selection (table header, column row, FK edge double-click). There is no
  auto-reveal for the filter sidebar.
- **(d) Rail form.** The collapsed state is a slim vertical rail with a chevron
  (tooltip only, no labels). If a wider "tab" strip with labels is preferred,
  say so.
