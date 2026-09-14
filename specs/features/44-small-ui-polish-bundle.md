---
id: 44
title: Polish diagram icons, source notes, toolbars, table names, and display ordering
status: implemented
priority: medium
created: 2026-09-14
owner: unassigned
depends_on: [16, 24, 27, 28, 40, 41]
---

# Polish diagram icons, source notes, toolbars, table names, and display ordering

## Summary

As a dbt Diagram user, I want the downloaded diagram artwork to identify the
extension and its diagram-opening editor actions, notes to be available in
source diagrams, related toolbar actions to have a predictable order, long
table names to remain readable, and column-display choices ordered from most to
least detail, so that both model and source diagrams feel consistent and clear.

## Scope

**In scope**

- Copy the supplied `diagram-project-svgrepo-com.svg` artwork from the user's
  Downloads folder into the repository and use its geometry for the extension
  Marketplace icon and all three editor-title commands that open model, source,
  or saved diagrams.
- Show the existing Add note toolbar action in source mode as well as model mode;
  note behavior and persistence remain shared between modes.
- In model mode, place Import models from source yml at the far right of the
  top-left toolbar group, immediately after Edit fields matrix.
- Render a long table-card title on up to two centered lines and truncate any
  remaining text with an ellipsis; expose the full table name in its tooltip.
- Order every column-display selector/menu as All columns, Primary + foreign
  keys, Primary keys only, Table name only.

**Out of scope**

- Changing note storage, layout schema, model/source YAML, or source-mode edit
  permissions.
- Changing table-card width, column-name rendering, or inline rename behavior.
- Reordering any toolbar action other than the source-import action.
- Redesigning the supplied icon artwork.

## Scenarios

### Extension and diagram actions use the supplied artwork

```
Given dbt Diagram is installed
Then its extension listing uses the supplied diagram-project artwork
When a model yml, source yml, or .dbtiagram.yml editor is active
Then its diagram-opening editor-title button uses the same diagram-project artwork
```

### Add a note in source mode

```
Given a source-mode diagram is open
When the user clicks the Add note toolbar button
Then an empty expanded note is created at the viewport center
And the note can be edited and saved with the source diagram layout
```

### Import is the final action in the model toolbar group

```
Given a model-mode diagram is open
When the user looks at the top-left toolbar
Then the actions are ordered Add note, Add foreign key, Edit fields matrix,
  Import models from source yml
And Import models from source yml is at the right edge of that group
```

### Source toolbar omits model-only actions

```
Given a source-mode diagram is open
When the user looks at the top-left toolbar
Then Add note and Add foreign key are visible
And Edit fields matrix and Import models from source yml are absent
```

### Long table names remain identifiable

```
Given a table name does not fit on one header line
When its card is rendered
Then the name wraps onto at most two centered lines
And text beyond the second line is truncated with an ellipsis
And hovering the header reveals the full table name
```

### Column-display choices run from most to least detail

```
Given any column-display selector or Show columns context submenu is open
Then its options are ordered All columns, Primary + foreign keys,
  Primary keys only, Table name only
And the selected mode and display behavior are otherwise unchanged
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Set the extension icon and replace the three built-in database command icons with theme-specific diagram-project SVG assets. |
| `media/diagram-project.svg` | create | Repository copy of the supplied SVG geometry for light-theme editor-title buttons. |
| `media/diagram-project-dark.svg` | create | Same supplied geometry with a light stroke for dark-theme editor-title visibility. |
| `media/diagram-project.png` | create | 128×128 PNG rendering of the supplied geometry for the extension/Marketplace icon required by VS Code packaging. |
| `src/diagram/columnDisplay.ts` | modify | Reverse the shared UI option ordering without changing mode values or behavior. |
| `webview-ui/DiagramCanvas.tsx` | modify | Always show Add note, keep model-only fields matrix/import actions conditional, and move import after fields matrix. |
| `webview-ui/TableNode.tsx` | modify | Give non-editing table headers a full-name tooltip while retaining description information. |
| `webview-ui/styles.css` | modify | Clamp table titles to two centered lines with overflow ellipsis. |
| `test/unit/diagram/columnDisplay.test.ts` | create | Lock the shared option ordering and existing display behavior. |
| `specs/README.md` | modify | Add feature 44 and track its lifecycle status. |

### Signatures

No exported TypeScript signatures change. The existing pure export keeps its
type and receives a new literal order:

```ts
// src/diagram/columnDisplay.ts (pure — must not import `vscode`)
export const COLUMN_DISPLAY_OPTIONS: readonly ColumnDisplayOption[];
// Literal order: all, pkAndFk, pkOnly, nameOnly.
```

`DiagramCanvasProps.onOpenFieldsMatrix` and
`DiagramCanvasProps.onImportSourceModels` remain optional. Add note continues to
use the existing required `onAddNoteAt` callback.

### Behavior notes

1. **Icon assets.** `media/diagram-project.svg` retains the downloaded SVG's
   path and view box, removes fixed 800px dimensions, and uses a dark stroke.
   `media/diagram-project-dark.svg` retains the same path/view box and uses a
   light stroke. `package.json` sets top-level `icon` to
   `media/diagram-project.png`; each of `dbtiagram.open`,
   `dbtiagram.openSource`, and `dbtiagram.openLayout` uses
   `{ "light": "media/diagram-project.svg", "dark":
   "media/diagram-project-dark.svg" }`. The PNG is a 128×128 rendering of the
   same path on a transparent background.
2. **Source notes.** The Add note button is no longer guarded by
   `onOpenFieldsMatrix !== undefined`. It is always rendered because
   `onAddNoteAt` is already supplied in both modes and source layout files
   already persist notes. No note hook, protocol, or layout-file change is made.
3. **Toolbar order.** The top-left JSX order is Add note, Add foreign key,
   optional Fields Matrix, optional Import. Model mode supplies both optional
   callbacks; source mode supplies neither. Existing click handlers, icons,
   titles, and context-menu ordering stay unchanged.
4. **Long titles.** The non-editing label is wrapped in a dedicated
   `.table-node__title-text` span. It uses `min-width: 0`, `overflow: hidden`,
   `display: -webkit-box`, `-webkit-box-orient: vertical`,
   `-webkit-line-clamp: 2`, `overflow-wrap: anywhere`, and centered text. The
   fixed 44px header/card geometry is unchanged. The header `title` is the full
   label when there is no description, and `<full label>\n<description>` when a
   description exists, preserving access to both values. Inline title editing
   remains single-line and unchanged.
5. **Display options.** `COLUMN_DISPLAY_OPTIONS` is the single source used by
   the toolbar select, details select, and context submenu. Only its array order
   changes to `all`, `pkAndFk`, `pkOnly`, `nameOnly`; values, labels, default
   (`all`), persistence, and filtering semantics do not change.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/diagram/columnDisplay.test.ts` | `orders display options from most to least detail` | `COLUMN_DISPLAY_OPTIONS.map(({ value, label }) => ({ value, label }))` | `[{value:'all',label:'All columns'},{value:'pkAndFk',label:'Primary + foreign keys'},{value:'pkOnly',label:'Primary keys only'},{value:'nameOnly',label:'Table name only'}]` |
| `test/unit/diagram/columnDisplay.test.ts` | `keeps each display mode's column behavior` | node with columns `id, customer_id, total`, PK `id`, FK column `customer_id`; call `displayedColumns` for all four modes | `all -> ['id','customer_id','total']; pkAndFk -> ['id','customer_id']; pkOnly -> ['id']; nameOnly -> []` |

The icon appearance, source/model toolbar visibility and ordering, centered
two-line clamp, ellipsis, and tooltip are DOM/CSS/VS Code chrome behaviors with
no component-test harness in this repository. They are covered by build/type
checking and Manual Verify.

### Verification

1. `npm run verify` — typecheck and all unit suites must pass.
2. `npm run build` — extension and webview bundles must build.
3. `npm test` — unit and VS Code integration suites must pass.
4. `npm run typecheck` — final strict typecheck must pass.
5. Manual Verify (F5): inspect the installed/listing icon and each model/source/
   layout editor-title action; verify the two mode-specific toolbar orders; add,
   edit, save, and reopen a note in source mode; inspect a long table name and
   tooltip; inspect all three column-display UI surfaces.

### Do not touch

- `src/dbt/**`, `src/shared/**`, `src/vscode/**`, and `src/webview/**` — no data,
  protocol, host, persistence, or VS Code wrapper behavior changes.
- Note creation/persistence modules (`webview-ui/hooks/useNotes.ts`,
  `src/diagram/layoutFile.ts`) — source mode already supports the required data.
- Column-display mode values, default, persistence, and `displayedColumns`
  implementation — only the option array's presentation order changes.
- Table width, `HEADER_HEIGHT`, row geometry, graph layout, edge routing, and
  inline table-name editing.
- Empty-canvas context-menu ordering and source-import behavior.

## Acceptance Criteria

- [ ] The supplied artwork identifies the extension and all three editor-title
      diagram-opening buttons and remains visible in light and dark themes.
- [ ] Add note is available and persists notes in source mode.
- [ ] The model toolbar ends with Fields Matrix followed by Import from source;
      source mode shows Add note and Add foreign key but neither model-only action.
- [ ] Long table names occupy at most two centered lines, truncate with an
      ellipsis, and expose the full name on hover.
- [ ] Every column-display UI orders options from All columns to Table name only.
- [ ] Existing mode values, saved layouts, and diagram behavior remain compatible.
- [ ] `npm test` and `npm run typecheck` are green.

## Confirm at Approval

- The plan uses a **two-line maximum** for table names and then ellipsizes. If
  you want three lines or a growing header/card instead, say so before approval.
- The supplied black artwork is preserved geometrically, with a white-stroke
  dark-theme command variant and a transparent 128×128 PNG for the extension
  icon. Confirm that theme adaptation is acceptable.
