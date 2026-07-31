---
id: 01
title: Open dbt Diagram from the editor title bar
status: done
priority: high
created: 2026-07-31
owner: unassigned
depends_on: []
---

# Open dbt Diagram from the editor title bar

## Summary

As a dbt developer, when I have a model.yml file open in the editor, I see a
"dbt Diagram" button in the editor title bar. Clicking it opens the dbt Diagram
webview, so I do not have to reach for the command palette.

## Background

The extension already exposes the `dbt Diagram: Open dbt Model Diagram` command
and a webview that renders every model in the workspace as a diagram. Finding
the command via Ctrl+Shift+P every time is slow and undiscoverable. This feature
surfaces that existing command as a native editor title bar button that is
visible exactly when the active editor is a dbt model file.

## Scope

- An editor title bar button that opens the existing dbt Diagram webview.
- The button is visible only while the active editor is a model file (a file
  matching the `dbtiagram.modelFileGlob` configuration).
- No changes to diagram rendering, editing, or persistence behavior.

## Implementation Notes

- Contribute a menu item under `contributes.menus["editor/title"]` with group
  `navigation` and an icon.
- Keep a custom context key (e.g. `dbtiagram.isModelYml`) in sync with the
  active editor and the `dbtiagram.modelFileGlob`; the menu item's `when`
  clause references it.
- Because the context key must be set before the button can show, the extension
  needs an activation event that runs early (e.g. `onStartupFinished`).
- Clicking the button runs the existing `dbtiagram.open` command.

## Scenarios

### Button appears when a model.yml file is active

```
Given a dbt workspace with model.yml files matching "dbtiagram.modelFileGlob"
And the active editor is a file that is not a model file
When the active editor changes to a model file
Then a button titled "Open dbt Model Diagram" appears in the editor title bar
```

### Button disappears for non-model files

```
Given the active editor is a model file and the editor title bar shows the button
When the active editor changes to a non-model file (for example a .sql or .json file)
Then the button no longer appears in the editor title bar
```

### Button opens the diagram

```
Given the active editor is a model file and the editor title bar shows the button
When the user clicks the button
Then the existing dbt Diagram webview opens
And the diagram renders one node per model discovered in the workspace
```

## Acceptance Criteria

- [ ] A button appears in the editor title bar for model files and only model files.
- [ ] Button visibility tracks the active editor and respects `dbtiagram.modelFileGlob`.
- [ ] Clicking the button opens (or reveals) the existing dbt Diagram webview.
- [ ] Existing diagram behavior is unchanged.
