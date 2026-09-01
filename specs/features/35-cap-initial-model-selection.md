---
id: 35
title: Cap the initial model selection for large workspaces
status: implemented
priority: medium
created: 2026-09-01
owner: unassigned
depends_on: [05]
---

# Cap the initial model selection for large workspaces

## Summary

As a dbt developer with a large workspace (many models across one or more
model.yml files), I want the diagram to open showing a manageable subset of
models rather than trying to render everything at once, so that the initial
render is fast and the canvas isn't overwhelming. When there are more than 20
models in total, only the first 20 are checked when the diagram first opens; a
transient popup tells me that only 20 were loaded and points me at the sidebar
filter to change the selection.

## Background

Spec 05 gave every model.yml file and every model a checked-by-default state,
so today's diagram always tries to render **every** model on first load. A
workspace with hundreds of models across many schema.yml files makes the first
render slow and the canvas unreadable, and the user has no signal that a
lighter subset would be more usable — they only discover the sidebar filter
after the fact.

This feature narrows the **initial** checked-model set only, on the diagram's
very first `diagram:update` after the webview mounts. It builds directly on
spec 05's `reconcileSelection`/`computeVisibleModels` machinery and the
`FilterSidebar` — filtering, bulk All/None, and search are all unchanged and
remain the way the user changes the selection afterward.

## Scope

**In scope**

- A fixed cap of **20 models** applied only to the **very first**
  `diagram:update` a freshly opened diagram panel receives.
- When the total model count (across every discovered model.yml file) exceeds
  the cap, only the **first 20 models** (in file order, then in-file
  declaration order — the same flattened order `FilterSidebar`/`computeVisibleModels`
  already use) start checked; the remaining models start **unchecked**. Every
  model.yml **file** stays checked by default (file-level behavior from spec 05
  is unchanged) — only the model-level default selection is capped.
- A **transient popup** ("toast") appears once, automatically, when the cap
  was applied: it names how many models are shown vs. the total and tells the
  user to use the **Filter** section in the sidebar to change which models are
  loaded. It auto-dismisses after a few seconds and can also be dismissed
  manually.
- Workspaces with 20 or fewer models total: no cap, no popup — byte-identical
  to today's spec 05 behavior.
- The cap is a one-time initial-load decision. It never re-applies later in
  the same panel session: subsequent `diagram:update`s (new files/models
  appearing, edits, etc.) reconcile exactly as spec 05 already describes
  (new items default checked), even if that pushes the checked count above 20.
- Reopening the diagram (a new panel/webview instance) re-evaluates the cap
  and can show the popup again, consistent with spec 05's filter selection
  already resetting on reopen.

**Out of scope**

- Making the cap value (20) user-configurable via a VS Code setting.
- Capping which model.yml **files** are checked — only the model-level
  selection is capped; every file still starts checked.
- Persisting the popup's dismissal or the capped selection across sessions.
- Any change to `computeVisibleModels`, `filterGraph`, file precedence, search,
  or bulk All/None — this feature only changes what the *initial* model
  selection is seeded to.
- Changing the host/protocol: the host keeps sending the full graph and full
  `modelFiles`; the cap is entirely a webview-side initial-selection decision,
  matching spec 05's "webview-side filtering" design.

## Scenarios

### A large workspace opens with only the first 20 models checked

```
Given a workspace whose model.yml files define 47 models in total
When the dbt Diagram is opened for the first time
Then the diagram shows exactly the first 20 models in file/declaration order
And the Models section in the sidebar shows those 20 as checked and the other 27 as unchecked
And every model.yml file is checked
```

### A popup names the cap and points at the filter

```
Given a workspace whose model.yml files define 47 models in total
When the dbt Diagram is opened for the first time
Then a popup appears reading something like "Showing 20 of 47 models — use the Filter section in the sidebar to change which models are loaded."
And the popup disappears on its own after a few seconds
And the user can also dismiss it immediately by clicking its close control
```

### Small workspaces are unaffected

```
Given a workspace whose model.yml files define 15 models in total
When the dbt Diagram is opened for the first time
Then all 15 models are checked
And no popup appears
```

### The cap never re-applies after the initial load

```
Given a workspace with 47 models where the diagram just opened and capped the selection to 20
When the user checks 5 more models in the sidebar
And a new model.yml file with 3 more models is subsequently added to the workspace
Then the 3 new models appear checked (spec 05's normal "new items default checked" behavior)
And no new popup appears
And the previously capped/unchecked models remain exactly as the user left them
```

### Reopening the diagram re-evaluates the cap

```
Given a workspace with 47 models
When the user closes the diagram panel and reopens it
Then the fresh panel again shows only the first 20 models checked
And the popup appears again
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/filter.ts` | modify | Add `INITIAL_MODEL_SELECTION_LIMIT` and pure `capInitialSelection` helper. |
| `test/unit/shared/filter.test.ts` | modify | Unit tests for `capInitialSelection`. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | On the first-ever `applyModelFiles` call, seed `selectedModels` via `capInitialSelection` when the total exceeds the limit, and expose an `initialCapNotice` + `dismissInitialCapNotice`. |
| `webview-ui/Toast.tsx` | create | Small presentational auto-dismissing popup component. |
| `webview-ui/App.tsx` | modify | Render `<Toast>` when `filter.initialCapNotice` is set. |
| `webview-ui/styles.css` | modify | `.toast` styles (fixed position, dark-theme aware, dismiss button). |
| `specs/ARCHITECTURE.md` | modify | Update the `src/shared/filter.ts` and `useDiagramFilter.ts` rows; add `webview-ui/Toast.tsx`. |
| `specs/README.md` | modify | Add feature 35 to the Feature Index. |

### Signatures

```ts
// src/shared/filter.ts (shared — must not import `vscode`)

/** Default cap on how many models start checked on a diagram's first load. */
export const INITIAL_MODEL_SELECTION_LIMIT = 20;

/**
 * The initial checked-model set for a freshly opened diagram: the first
 * `limit` names from `modelNames` (already in file/declaration order), or all
 * of them when the total is at or under `limit`.
 */
export function capInitialSelection(
  modelNames: readonly string[],
  limit?: number,
): Set<string>;
```

```ts
// webview-ui/hooks/useDiagramFilter.ts (webview)

export interface InitialCapNotice {
  shown: number;
  total: number;
}

export interface DiagramFilterState {
  // ...existing fields unchanged...
  initialCapNotice: InitialCapNotice | null;
  dismissInitialCapNotice: () => void;
}
```

```tsx
// webview-ui/Toast.tsx (webview)
export interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Milliseconds before auto-dismiss. Defaults to 8000. */
  durationMs?: number;
}
export function Toast(props: ToastProps): JSX.Element;
```

### Behavior notes

- **Order.** `capInitialSelection` takes the already-flattened model-name list
  in the same order `useDiagramFilter` already derives it in `applyModelFiles`
  (`files.flatMap((file) => file.models)`), so "first 20" means file order then
  in-file declaration order — no new ordering concept is introduced.
- **One-time only.** `useDiagramFilter` needs a ref (e.g. `hasLoadedOnceRef`)
  set on the first call to `applyModelFiles` and checked before deciding
  whether to cap. Every subsequent call reconciles normally via the existing
  `reconcileSelection`, uncapped — this satisfies "the cap never re-applies"
  scenario.
- **Files stay fully checked.** `applyModelFiles`'s existing file-selection
  reconciliation (`reconcileSelection` over `fileUris`) is untouched; only the
  model-selection seeding branches on the cap.
- **Cap vs. reconcile.** When capping applies on the first call, `selectedModels`
  is set directly from `capInitialSelection(modelNames)` instead of the result
  of `reconcileSelection(...)` (there is no meaningful "previous" selection to
  reconcile against on the very first load, and reconcile would otherwise
  select everything). When the cap does not apply (≤ limit, or not the first
  call), behavior is byte-identical to today.
- **Popup content.** Exact message: `` `Showing ${shown} of ${total} models — use the Filter section in the sidebar to change which models are loaded.` `` The notice object carries `shown`/`total`; `App.tsx` formats the string (keeps `Toast` a generic, reusable component with no domain-specific text).
- **Popup lifecycle.** `initialCapNotice` starts `null`; it is set once, in the
  same `applyModelFiles` call that applies the cap; `dismissInitialCapNotice`
  (called by `Toast`'s `onDismiss`, wired from both its internal timer and its
  close button) sets it back to `null`. No further scenario re-arms it within
  the same panel session, matching "never re-applies."
- **Toast is generic.** `Toast.tsx` has no knowledge of models/filters — it
  just renders `message`, auto-calls `onDismiss` after `durationMs` (default
  8000ms) via a cleared `setTimeout`, and exposes a close button. This keeps it
  reusable and trivially unit-testable-by-inspection (no logic besides the
  timer, which is a one-line effect — no dedicated pure module needed).
- **No protocol change.** The host is untouched; `diagram:update` keeps sending
  the full graph and `modelFiles` exactly as spec 05 defined.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/filter.test.ts` | `capInitialSelection returns everything at or under the limit` | `capInitialSelection(['a','b'], 20)` | `new Set(['a','b'])` |
| `test/unit/shared/filter.test.ts` | `capInitialSelection keeps only the first N in order` | `capInitialSelection(Array.from({length: 47}, (_,i) => `m${i}`), 20)` | a `Set` equal to `new Set(Array.from({length:20}, (_,i) => `m${i}`))` (first 20 names, `m0`..`m19`) |
| `test/unit/shared/filter.test.ts` | `capInitialSelection uses the default limit of 20 when omitted` | `capInitialSelection(Array.from({length: 25}, (_,i) => `m${i}`))` | a `Set` of size 20 containing `m0`..`m19` |

### Verification

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

- `computeVisibleModels`, `filterGraph`, `reconcileSelection`,
  `scopeSelectionToFile` (spec 05/14) — unchanged; the cap only changes what
  `selectedModels` is initially seeded to.
- The host/protocol (`src/webview/panel.ts`, `src/shared/protocol.ts`) — no
  change; the full graph and `modelFiles` are still always sent.
- `FilterSidebar.tsx`'s search, bulk All/None, and collapse behavior — untouched;
  the user can immediately check more models the normal way.

## Acceptance Criteria

- [ ] Workspaces with more than 20 total models open with only the first 20
      (file/declaration order) checked; every model.yml file stays checked.
- [ ] A popup appears once on that first load, states the shown/total counts,
      names the Filter sidebar as the way to change the selection, and
      auto-dismisses after a few seconds or on manual close.
- [ ] Workspaces with 20 or fewer total models are unaffected: all checked, no
      popup.
- [ ] The cap applies only to the panel's first `diagram:update`; later updates
      (new files/models, edits) reconcile exactly as spec 05 already does, with
      no repeated popup.
- [ ] Reopening the diagram panel re-evaluates the cap and can show the popup
      again.
- [ ] `src/shared/filter.ts` stays pure (no `vscode` import) and
      `capInitialSelection` is covered by sub-second Vitest unit tests.
- [ ] `npm test` and `npm run typecheck` pass; `computeVisibleModels`,
      `filterGraph`, `reconcileSelection`, the host, and the protocol are
      unchanged.

## Confirm at Approval

- **(a) Cap value.** Fixed at 20, not user-configurable for now.
- **(b) What gets capped.** Only the model-level selection; every model.yml
  file still starts checked (file precedence already lets the user narrow by
  file today).
- **(c) One-time per panel.** The cap is evaluated once per webview instance
  (the panel's first `diagram:update`), not on every update; reopening the
  panel re-evaluates it.
- **(d) Popup style.** A generic, self-dismissing `Toast` component (not a
  native VS Code notification), consistent with this codebase's existing
  in-webview banners (`.banner`) rather than `vscode.window.showInformationMessage`.
