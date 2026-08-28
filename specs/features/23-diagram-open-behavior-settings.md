---
id: 23
title: Diagram open-behavior settings panel
status: draft
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [14]
---

# Diagram open-behavior settings panel

## Summary

As a dbt developer, I want a small settings panel inside the diagram webview
where I can choose **how new diagram tabs open** (same tab group, split, or a
separate OS window), so the diagram fits my window-management habits. The
choice is a single dropdown/radio list of options with an explanation of each,
persists on my machine across VS Code sessions, and applies to every diagram
opened afterwards (existing diagram tabs are unaffected until reopened).

## Background

Spec 14 fixed diagram tabs to always open with `vscode.ViewColumn.Beside`
("split and new tab"). That is one reasonable default, but users who keep a
wide single editor group, or who like to drag the diagram to a second monitor,
have no way to change it short of manually moving the tab every time.

## Scope

**In scope**

- A **settings button** in the webview's existing header (`app__header`,
  next to the status text) that opens a small modal-style panel inside the
  webview (not a native VS Code webview/quick-pick).
- One setting, **"Open new diagrams"**, with these options:
  1. **New tab** — opens in the same editor group as the last focused tab
     (`ViewColumn.Active`).
  2. **Split and new tab** *(default, current behavior)* — opens beside the
     last focused tab (`ViewColumn.Beside`), per spec 14.
  3. **Separate window (reuse)** — opens in its own OS-level VS Code window,
     the first time. Later diagrams are added as new tabs to the **first**
     already-open separate diagram window found, instead of opening yet
     another window. If no separate diagram window is currently open, one is
     created (lazily).
  4. **Always separate window** — every diagram always opens in its own new
     OS-level window, never reusing one.
- Each option is described in the UI in one short sentence (text above).
- The setting is stored as a VS Code **user setting**
  (`dbtiagram.openBehavior`, `ConfigurationTarget.Global`) — the same
  mechanism already used for `dbtiagram.modelFileGlob` /
  `dbtiagram.watchModelFiles` — so it is local to the machine and survives
  restarts without any new storage mechanism.
- The setting takes effect for the **next** diagram opened (from the editor
  title button or command palette); it never moves or reflows already-open
  tabs.
- Changing the setting from any open diagram's settings panel updates it for
  every other open diagram panel immediately (they all read the same
  underlying configuration and are notified via
  `workspace.onDidChangeConfiguration`).

**Out of scope**

- Any change to which tab is revealed for a source that already has a tab
  open (spec 14's "reveal existing tab" rule is unchanged and takes priority
  over all four options — a same-source reopen never creates a new tab or
  window).
- A VS Code `settings.json` UI entry beyond the configuration contribution
  itself (the setting is still visible/editable there, for free, since it's a
  normal contributed setting — but this feature is about the in-webview
  panel, not a `settings.json` docs page).
- Any other settings besides open behavior (space is reserved for future
  ones, per Behavior notes, but none are added now).
- Resizing/dragging the settings panel — it is a fixed-size non-resizable
  overlay sized to fit its content.
- Restoring diagram tabs/windows across a VS Code restart (unchanged from
  spec 14: they simply do not reopen).

## Known technical constraint (needs your confirmation)

Option 3 ("Separate window, reuse") requires detecting whether a
dbtiagram-owned tab already exists in a *different OS window* than the one the
command was invoked from, and — if so — opening the new webview panel
directly into that window's tab group. VS Code's stable extension API
provides:

- `vscode.window.tabGroups.all` — includes tab groups from auxiliary
  (separate) windows on current VS Code versions, but this repo's declared
  minimum engine is `^1.90.0`; this cross-window visibility is a more recent
  addition. On an old-enough VS Code build the list may only reflect the main
  window.
- `workbench.action.moveEditorToNewWindow` — a built-in command that moves the
  *currently active* editor tab into a brand-new OS window. There is no public
  command to move a tab into a specific *existing* separate window.

The planned approach: after we move one of our own panels into a new window
(via that command), we record the `viewColumn` VS Code subsequently reports
for its tab group. For later "Separate window (reuse)" opens, we look for any
of our own currently-open panels whose recorded tab group still appears in
`tabGroups.all`; if found, we create the new webview panel with
`{ viewColumn: <that group's column> }` so it lands as a new tab there;
otherwise we create it normally and then move it to a new window ourselves,
recording its column for the next reuse.

**Fallback**: if the recorded tab group can no longer be found (window closed,
or the older-VS-Code case where it was never visible), option 3 falls back to
behaving like option 4 for that one diagram (a fresh separate window),
self-healing on the next open once a new window is tracked. This is a
best-effort feature, not a guarantee, given VS Code's public API surface.

**Please confirm you're OK with:**
(a) this best-effort/self-healing fallback for option 3 rather than a hard
guarantee, and
(b) no `package.json` engines bump — we rely only on APIs already available at
`^1.90.0`, degrading gracefully on older installs.

## Scenarios

### Opening the settings panel

```
Given a diagram tab is open
When the user clicks the settings (gear) button in the header
Then a small panel opens over the diagram
And it lists the four "Open new diagrams" options with a one-line
  explanation for each
And the option matching the current setting is pre-selected
```

### Choosing "New tab"

```
Given the setting is "New tab"
And the user has models/core/schema.yml focused in the main editor group
When the user opens the diagram for models/marts/schema.yml
Then the new diagram tab opens in the same editor group as the focused tab
And no split occurs
```

### Choosing "Split and new tab" (default)

```
Given the setting is "Split and new tab"
When the user opens a diagram for a source with no existing tab
Then the diagram opens beside the currently active editor group
```
(Unchanged from spec 14.)

### Choosing "Separate window (reuse)"

```
Given the setting is "Separate window (reuse)"
And no separate dbtiagram window is currently open
When the user opens a diagram
Then it opens in a new, separate VS Code window

Given that separate window is still open
When the user opens a second diagram from the main window
Then it opens as a new tab inside that same separate window
And the main window's editor layout is unchanged
```

### Choosing "Always separate window"

```
Given the setting is "Always separate window"
When the user opens two different diagrams, one after another
Then each opens in its own new, separate VS Code window
```

### Reopening an already-open source is unaffected

```
Given the diagram for models/core/schema.yml is already open (any setting)
When the user clicks "Open dbt Diagram" on that same file again
Then the existing tab/window is revealed
And no new tab or window is created, regardless of the current setting
```

### The setting persists and is shared across panels

```
Given the user sets "Open new diagrams" to "Always separate window"
When VS Code is restarted
And the user opens a diagram
Then it opens in a separate window
Given two diagram tabs are already open when the user changes the setting
Then both of their settings panels show the new value if reopened
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Add `dbtiagram.openBehavior` configuration property (`enum`, default `"splitTab"`). |
| `src/shared/openBehavior.ts` | create | Pure shared type + label/description text for the four options. |
| `src/shared/protocol.ts` | modify | Add `settings:current` (host→webview) and `settings:setOpenBehavior` (webview→host) messages. |
| `src/vscode/openBehaviorWindows.ts` | create | vscode-facing: tracks this extension's separate-window tab groups and resolves where a new panel should be created for a given `OpenBehavior` (`resolvePlacement`). Wraps `tabGroups.all` + `moveEditorToNewWindow`. |
| `src/webview/panel.ts` | modify | Read `dbtiagram.openBehavior` when creating a panel; call `resolvePlacement`; send `settings:current` on ready and on `onDidChangeConfiguration`; handle `settings:setOpenBehavior` by writing the VS Code setting. |
| `webview-ui/SettingsPanel.tsx` | create | The settings overlay UI: option list with descriptions, radio-style selection, Close button. |
| `webview-ui/hooks/useSettings.ts` | create | Webview-side state: current `OpenBehavior`, open/close panel, send `settings:setOpenBehavior`. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Add `onSettingsCurrent` handler. |
| `webview-ui/App.tsx` | modify | Render the settings (gear) button in `app__header`; render `SettingsPanel` when open. |
| `webview-ui/styles.css` | modify | Styles for the settings button and the fixed-size overlay panel. |
| `specs/ARCHITECTURE.md` | modify | Add rows for the new modules. |

### Signatures

```ts
// src/shared/openBehavior.ts (shared — must not import `vscode`)
export type OpenBehavior = 'newTab' | 'splitTab' | 'reuseWindow' | 'newWindow';
export const DEFAULT_OPEN_BEHAVIOR: OpenBehavior;
export interface OpenBehaviorOption {
  value: OpenBehavior;
  label: string;
  description: string;
}
export const OPEN_BEHAVIOR_OPTIONS: readonly OpenBehaviorOption[];

// src/shared/protocol.ts additions (shared)
// MessageToWebview
| { type: 'settings:current'; openBehavior: OpenBehavior }
// MessageToExtension
| { type: 'settings:setOpenBehavior'; openBehavior: OpenBehavior }

// src/vscode/openBehaviorWindows.ts (vscode-facing)
export interface PanelPlacement {
  showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean };
  /** Called after the panel is created, to move it to a new window and/or record its group. */
  afterCreate: (panel: vscode.WebviewPanel) => Promise<void>;
}
export function resolvePlacement(behavior: OpenBehavior): PanelPlacement;
/** Forgets a tracked window (panel disposed / group no longer found). */
export function untrackPanel(panel: vscode.WebviewPanel): void;

// webview-ui/hooks/useSettings.ts (webview)
export interface SettingsState {
  open: boolean;
  openBehavior: OpenBehavior;
  openPanel: () => void;
  closePanel: () => void;
  setOpenBehavior: (value: OpenBehavior) => void;
  applyCurrent: (value: OpenBehavior) => void; // called from onSettingsCurrent
}
export function useSettings(): SettingsState;

// webview-ui/SettingsPanel.tsx (webview)
export interface SettingsPanelProps {
  value: OpenBehavior;
  onChange: (value: OpenBehavior) => void;
  onClose: () => void;
}
export function SettingsPanel(props: SettingsPanelProps): JSX.Element;
```

### Behavior notes

- **Default** is `splitTab`, matching current behavior exactly — installing
  this feature changes nothing for existing users until they open settings.
- **Reveal-existing-tab always wins** (spec 14): `resolvePlacement` is
  consulted only in `DiagramPanel.createOrShow`'s "no existing panel for this
  key" branch; the existing-panel branch is untouched.
- **`newTab`** → `showOptions: vscode.ViewColumn.Active`. **`splitTab`** →
  `vscode.ViewColumn.Beside` (today's constant, unchanged).
- **`newWindow`** → panel is created normally (`ViewColumn.Active` as a
  starting point, since it will be relocated), then `afterCreate` runs
  `workbench.action.moveEditorToNewWindow` against the panel (VS Code moves
  the currently active editor tab; the panel must be `.reveal()`ed/active
  first). No tracking is recorded — the next `newWindow` open always makes
  another new window.
- **`reuseWindow`** → `resolvePlacement` first calls a helper that scans
  `vscode.window.tabGroups.all` for a tab group previously recorded by this
  module (`openBehaviorWindows.ts` keeps a small in-memory
  `Map<number /* group identity */, vscode.ViewColumn>`, pruned when a group
  disappears from `tabGroups.all`). If one is found, `showOptions` targets
  that `viewColumn` directly (no move needed — the panel is created straight
  into that window's group as a new tab). If none is found, it behaves like
  `newWindow` and additionally records the resulting group for future reuse.
- **Self-healing**: pruning happens lazily on every `resolvePlacement` call
  (cheap: iterate `tabGroups.all`), so a closed separate window is detected
  the next time a diagram is opened, never eagerly.
- **Live setting propagation**: `panel.ts` subscribes to
  `vscode.workspace.onDidChangeConfiguration` for `dbtiagram.openBehavior` and
  re-sends `settings:current` to that panel's own webview so every open
  diagram's settings panel reflects the newest value.
- **Error messages**: none introduced (no new error paths — `resolvePlacement`
  and `moveEditorToNewWindow` cannot fail in a way the user needs to see;
  failures degrade silently to "acts like `newTab`/no move happened").
- The settings overlay is centered over the canvas, dismissible by its Close
  button, clicking outside it, or Escape — consistent with `ContextMenu`'s
  existing dismiss conventions.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/openBehavior.test.ts` | `OPEN_BEHAVIOR_OPTIONS has all four values in order` | — | `['newTab','splitTab','reuseWindow','newWindow']` |
| `test/unit/webview/useSettings.test.ts` (or plain function tests if hook logic is extracted to a pure helper) | `applyCurrent updates openBehavior and does not force the panel open` | current `open=false`, apply `'newWindow'` | `open` stays `false`, `openBehavior === 'newWindow'` |
| `test/unit/vscode/openBehaviorWindows.test.ts` | `resolvePlacement('newTab') returns ViewColumn.Active` | `'newTab'` | `showOptions === vscode.ViewColumn.Active` (test doubles `vscode.ViewColumn` via the existing vscode test shim, or the module is refactored so the pure column-choice logic is testable without importing real `vscode`) |
| `test/integration/` | manual/skip | — | Reuse-window and always-new-window behavior verified manually per the plan's best-effort caveat; not asserted in CI given the Electron host's limited multi-window support in test runs. |

Note for the implementing pass: if `src/vscode/openBehaviorWindows.ts` cannot
be unit-tested without a real `vscode` import (likely, since it touches
`tabGroups`/`ViewColumn`/commands), extract the **pure decision** (which of
the four behaviors + tracked-group-found-or-not maps to which action) into a
small pure helper in the same file's sibling, e.g.
`src/shared/openBehaviorPlacement.ts`, and keep `openBehaviorWindows.ts` as a
thin wrapper. Flag this split back to the user if it changes the Files table.

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before commit, must be green.
- Manual Verify (per `specs/README.md`): open the settings panel, switch
  through all four options, and confirm each scenario above by hand, since
  multi-window behavior is not exercised by the automated suites.

### Do not touch

- `src/webview/panelKey.ts` and spec 14's reveal-existing-tab logic in
  `DiagramPanel.createOrShow` — the existing-panel branch is unchanged.
- `src/dbt/*` and `src/diagram/*` — unaffected.
- The default `ViewColumn.Beside` behavior for users who never open settings.

## Acceptance Criteria

- [ ] A gear/settings button appears in the webview header and opens a
      fixed-size, non-resizable settings panel listing all four options with
      descriptions.
- [ ] The current selection is pre-selected and persists in
      `dbtiagram.openBehavior` (`ConfigurationTarget.Global`) across restarts.
- [ ] "New tab" opens in the active group; "Split and new tab" is unchanged
      from today; "Always separate window" opens a new OS window every time.
- [ ] "Separate window (reuse)" opens a new window the first time and adds
      subsequent diagrams as tabs to that same window while it stays open,
      falling back to a fresh window if it was closed.
- [ ] Reopening an already-open source always reveals its existing tab,
      regardless of the setting (spec 14 unaffected).
- [ ] Changing the setting in one open diagram updates every other open
      diagram's settings panel.
- [ ] `npm run verify` and `npm test` pass; `src/dbt/*` and `src/diagram/*`
      are unchanged.
