---
id: 28
title: Lucide icons for UI buttons
status: implemented
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [15, 16, 22, 27]
---

# Lucide icons for UI buttons

## Summary

As a diagram user, I want visual icons on all toolbar buttons, context menu
items, header actions, collapsed notes, and primary key indicators so that I
can quickly identify controls and elements at a glance without reading text
labels. The icons come from the Lucide icon set
(https://lucide.dev/icons/) and are rendered as inline SVGs. Toolbar buttons
become icon-only (text hidden, tooltip shows the action), while context menu
items show icon + label side by side.

## Background

The current UI uses Unicode characters (⚙ for settings, 🗒 for collapsed
notes), plain text labels ("Add note", "Auto-layout"), or custom inline SVGs
(primary key icon). This makes the interface visually inconsistent and forces
users to read every button label. Lucide provides a consistent, lightweight
SVG icon set that integrates cleanly into a React webview without external
dependencies.

## Scope

**In scope**

- Add the `lucide-react` package as a dependency.
- Create a thin wrapper module that re-exports the specific Lucide icons
  needed, keeping imports centralized.
- Replace all canvas toolbar button labels with icon-only buttons (tooltip
  shows the action name).
- Add icons to context menu items (icon + label).
- Replace the settings button's Unicode ⚙ with the Lucide `settings` icon.
- Update the save diagram button to show icons alongside its three states
  (Save as new diagram / Save / No changes).

**Out of scope**

- Icons on sidebar items or any component not listed above.
- Changing the icon color, size, or visual style beyond what Lucide provides
  by default.
- Adding keyboard shortcuts or accessibility changes beyond what already exists.

## Scenarios

### Canvas toolbar buttons are icon-only with tooltips

```
Given the diagram canvas is open
When I look at the top-left toolbar
Then I see four icon buttons: sticky-note-plus, cable, sheet, and network
And each button has no visible text label
And hovering any button shows a tooltip with the action name
```

### Context menu items show icon and label

```
Given I right-click on the canvas background
When the context menu appears
Then "Add note here" shows a sticky-note-plus icon to its left
And "Edit fields matrix (all models)" shows a sheet icon to its left
```

### Table card context menu shows icons

```
Given I right-click on a table card
When the context menu appears
Then "Reveal in model.yml" shows a square-code icon
And "Show columns" shows a between-horizontal-start icon
And "Edit fields matrix" shows a sheet icon
```

### Settings button uses Lucide icon

```
Given the diagram header is visible
When I look at the settings button
Then it shows the Lucide settings icon
And the button is not primary-colored (matches other toolbar buttons)
```

### Save diagram button shows icons for each state

```
Given the diagram header is visible
When there is no active layout
Then the save button shows save-plus icon followed by "Save as new diagram"
When there is an active layout with unsaved changes
Then the save button shows save icon followed by "Save"
When there is an active layout with no unsaved changes
Then the save button shows save-check icon followed by "No changes"
```

### Collapsed note uses Lucide icon

```
Given a sticky note is collapsed on the diagram
When I look at the collapsed note node
Then it shows the Lucide square-text icon
And the previous Unicode notepad emoji is removed
```

### Primary key icon uses Lucide

```
Given a table card has a primary key
When I look at the key icon next to the primary key column
Then it shows the Lucide key-round icon
And the previous custom inline SVG is removed
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `webview-ui/icons.ts` | create | Centralized re-exports of all Lucide icons used in the project |
| `webview-ui/DiagramCanvas.tsx` | modify | Replace toolbar button text with icon-only buttons + tooltips |
| `webview-ui/App.tsx` | modify | Update header: settings icon, save button states with icons |
| `webview-ui/ContextMenu.tsx` | modify | Render optional icon before label in menu items |
| `webview-ui/NoteNode.tsx` | modify | Replace Unicode collapsed note emoji with Lucide square-text icon |
| `webview-ui/TableNode.tsx` | modify | Replace custom PK SVG with Lucide key-round icon |
| `webview-ui/styles.css` | modify | Add styles for icon-only toolbar buttons and icon+label context menu items |

### Signatures

```ts
// webview-ui/icons.ts (webview — re-exports Lucide icons)
export {
  StickyNotePlus,
  Cable,
  Sheet,
  Network,
  Settings,
  SavePlus,
  SaveCheck,
  Save,
  SquareCode,
  BetweenHorizontalStart,
  SquareText,
  KeyRound,
} from 'lucide-react';
```

The `ContextMenuItem` interface in `ContextMenu.tsx` gains an optional `icon`
field:

```ts
// webview-ui/ContextMenu.tsx (webview)
export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  checked?: boolean;
  title?: string;
  onSelect?: () => void;
  items?: ContextMenuItem[];
}
```

### Behavior notes

1. **Toolbar buttons (DiagramCanvas.tsx)**: Each button renders only the Lucide
   icon component (size 16, inheriting `currentColor`). The `title` attribute
   provides the tooltip text. The existing `panel-button panel-button--secondary`
   classes are kept; no color change.

2. **Context menu items (ContextMenu.tsx)**: When `icon` is provided, render it
   in a `<span className="context-menu__icon">` before the label text. The icon
   is sized to match the row height (16×16). The checked-mark span stays in
   place; icons appear between the check area and the label.

3. **Settings button (App.tsx)**: Replace the `{⚙}` JSX with `<Settings size={16} />`.
   Keep the existing `panel-button app__settings` classes (no primary color).

4. **Save button (App.tsx)**: The button text becomes a fragment:
   - No layout: `<SavePlus size={14} /> Save as new diagram`
   - Active, dirty: `<Save size={14} /> Save`
   - Active, clean: `<SaveCheck size={14} /> No changes`
   The icon uses `size={14}` to align well with the text baseline.

5. **Icon sizing**: Toolbar buttons use `size={16}`. Context menu icons use
   `size={16}`. Save button icons use `size={14}`. Collapsed note icon uses
   `size={16}`. All icons inherit `currentColor` from their parent.

6. **Collapsed note (NoteNode.tsx)**: Replace the `🗒` Unicode emoji with
   `<SquareText size={16} />`. The icon inherits `currentColor` and maintains
   the same click-to-expand behavior.

7. **Primary key icon (TableNode.tsx)**: Replace the custom `KeyIcon` SVG
   component with `<KeyRound size={10} />`. The icon inherits `currentColor`.
   The `outlined` prop distinction (filled for real PK, outlined for virtual PK)
   is not supported by Lucide; both use the same icon. If visual distinction is
   needed later, CSS opacity or a wrapper class can be added.

8. **CSS additions**: A new `.context-menu__icon` rule provides spacing
   (`margin-right: 6px`, `display: inline-flex`, `align-items: center`).
   Toolbar buttons get `display: inline-flex; align-items: center; justify-content: center`
   to center the icon. The save button gets the same inline-flex treatment.

### Tests

This is a purely visual/UI feature with no domain logic changes. No new unit
tests are required. Verification is manual: run the extension, inspect every
button and menu item, confirm icons render correctly.

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| None | — | — | — |

### Verification

- `npm run verify` — typecheck + unit suites, must be green (no new tests, but
  existing tests must not break).
- `npm run build` — must succeed (confirms lucide-react resolves correctly).
- Manual: open a diagram, verify all toolbar icons, context menu icons, header
  icons, and save button states.

### Do not touch

- `src/dbt/` — no domain logic changes.
- `src/diagram/` — no graph/layout changes.
- `src/shared/` — no protocol changes.
- `src/vscode/` — no extension host changes.
- `src/webview/` — no panel lifecycle changes.
- `webview-ui/FieldsMatrix.tsx` — fields matrix UI unchanged.

## Acceptance Criteria

- [ ] `lucide-react` is added as a dependency and `npm run build` succeeds.
- [ ] All four canvas toolbar buttons show only icons (no text) with correct
      tooltips.
- [ ] Canvas context menu items (Add note here, Edit fields matrix) show icons.
- [ ] Table card context menu items (Reveal in model.yml, Show columns, Edit
      fields matrix) show icons.
- [ ] Settings button shows Lucide settings icon, not Unicode ⚙.
- [ ] Settings button is not primary-colored.
- [ ] Save button shows save-plus + "Save as new diagram" when no layout is open.
- [ ] Save button shows save + "Save" when layout has changes.
- [ ] Save button shows save-check + "No changes" when layout is clean.
- [ ] Collapsed notes show Lucide square-text icon, not Unicode emoji.
- [ ] Primary key columns show Lucide key-round icon, not custom SVG.
- [ ] `npm run verify` is green.
