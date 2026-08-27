---
id: 17
title: Modular source layout and fast feedback loop
status: done
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [06, 08, 13, 14]
---

# Modular source layout and fast feedback loop

## Summary

As a maintainer, I want the four oversized files in this repo split into focused
modules, and the unit-test feedback loop made quiet and targeted, so that adding
a feature requires reading and rewriting a small slice of the codebase instead of
a 1000-line file. This is a **pure refactor plus tooling change: no observable
product behavior may change.**

## Background

Four files dominate the repo and are touched by almost every task:

| File | Size | Problem |
|------|------|---------|
| `test/unit/dbt/edit.test.ts` | 52 KB | Mirrors `edit.ts`; heavy duplicated inline YAML setup |
| `webview-ui/App.tsx` | 46 KB | `App()` alone spans lines 93–850 |
| `src/dbt/edit.ts` | 35 KB | One `applyEdit` dispatcher over all edit kinds |
| `src/webview/panel.ts` | 18 KB | Panel lifecycle, HTML generation, and message handling mixed |

Every read of one of these pulls in large amounts of context irrelevant to the
task at hand, and every edit risks unrelated regressions. Additionally
`npm test` boots the Electron integration host, making the routine inner loop
slow and its output noisy.

## Scope

**In scope**

- Splitting the four files above into smaller modules with unchanged public APIs.
- A shared unit-test fixture helper to remove duplicated YAML setup.
- A `npm run verify` script and quieter Vitest reporting.
- A file-size convention recorded in `AGENTS.md`.

**Out of scope**

- Any change to diagram rendering, editing, persistence, or the message protocol.
- Any change to the public surface of `src/shared/protocol.ts`.
- Renaming or relocating modules other than those listed here.
- Trimming existing specs (tracked separately).

## Implementation Notes

### `src/dbt/edit.ts` → `src/dbt/edit/`

- `src/dbt/edit/index.ts` re-exports `applyEdit`, `ModelEdit`, `EditError`, and
  `ApplyEditResult` so **all existing import paths (`src/dbt/edit`) keep working
  unchanged**.
- `index.ts` holds only the `ModelEdit` union, the error/result types, and the
  `applyEdit` dispatcher (a `switch` delegating to a handler per edit kind).
- Handlers are grouped into sibling modules by subject area (model-level edits,
  column-level edits, key/constraint edits). The exact grouping is chosen during
  implementation so that each module stays under the size cap; shared helpers go
  in `src/dbt/edit/internal.ts`.
- The modules remain pure: no `vscode` import anywhere under `src/dbt/`.

### `src/webview/panel.ts`

- `DiagramPanel` (lifecycle, disposal, reveal, state) stays in `panel.ts`.
- Webview HTML/CSP/nonce generation moves to `src/webview/html.ts`.
- Inbound message handling moves to `src/webview/messageHandlers.ts`, exposed as
  functions that take an explicit dependency object rather than reaching into
  `DiagramPanel` internals, so they can be unit-tested without VS Code.
- `DiagramPanel` remains the only exported symbol of `panel.ts`.

### `webview-ui/App.tsx`

- `App()` retains only state ownership and composition.
- `DiagramCanvas` moves to its own file; `SidebarRail` and `SidebarResizer`
  move together into `webview-ui/SidebarChrome.tsx`.
- Behavior moves into dedicated hooks under `webview-ui/hooks/`:
  `useHostMessages` (the inbound message listener), `useSelection` (selection,
  focused FK, pending renames), `useDiagramFilter` (spec 05/13/14 filtering),
  `useLayoutPersistence` (spec 13 save + live write-back),
  `useDraftForeignKeys` (spec 09 drafts), and `useEdgeHighlighting` (hover).
- `acquireVsCodeApi()` may be called only once per webview, so the handle moves
  to `webview-ui/host.ts`, which exposes a typed `postToHost`.
- Sidebar width constants and `clampSidebarWidth` move to
  `webview-ui/sidebar-constants.ts`.
- `App` stays the module's public export used by `index.tsx`.
- Memo dependency lists must reference the individual stable callbacks returned
  by the hooks, never the hook result objects (which are new on every render),
  so `interaction` keeps its identity and `TableNode` re-render behavior is
  unchanged.

### `test/unit/dbt/edit.test.ts`

- Split to mirror the `src/dbt/edit/` modules, one suite file per handler module
  under `test/unit/dbt/edit/`.
- The shared base model set and virtual-block reader move to
  `test/unit/helpers/models.ts`. Suites that build their own local fixtures keep
  them: replacing those would change what the test asserts, which this
  mechanical split explicitly must not do.
- **Assertion count and coverage must not decrease**; this is a mechanical move,
  not a rewrite. No test may be deleted without being reproduced elsewhere.

### Tooling

- Add `npm run verify` = `npm run typecheck && npm run test:unit` as the routine
  inner-loop command. `npm test` keeps its current meaning (unit + integration)
  and remains mandatory before every commit.
- Configure Vitest with a `dot` reporter and a bounded
  `chaiConfig.truncateThreshold` so a failing run reports the mismatch without
  dumping whole model objects.
- Record in `AGENTS.md`: a soft cap of **400 lines per source file**, the
  `npm run verify` inner loop, and a note never to read `package-lock.json`
  directly (use `npm ls <pkg>`).

## Scenarios

### Behavior is unchanged after the split

```
Given the full test suite passes on the current code
When edit.ts, panel.ts, App.tsx and edit.test.ts are split into modules
Then npm run typecheck reports no errors
And npm run test:unit passes with no test skipped or removed
And npm run test:integration passes
```

### Existing import paths keep working

```
Given modules that import applyEdit from "src/dbt/edit"
When src/dbt/edit.ts becomes the directory src/dbt/edit/ with an index.ts
Then those import statements compile unchanged
And no importing module outside src/dbt/edit/ needs modification
```

### Purity rules still hold

```
Given the refactored modules under src/dbt/ and src/diagram/
When the sources are inspected
Then no module under src/dbt/ or src/diagram/ imports "vscode"
And no module under src/ uses the "any" type
```

### Message handling is unit-testable without VS Code

```
Given inbound webview message handling has moved to src/webview/messageHandlers.ts
When a unit test invokes a handler with a stub dependency object
Then the handler runs under Vitest without launching the Electron host
And the suite still completes in under one second
```

### The inner loop is fast and quiet

```
Given a developer has made a change under src/
When they run npm run verify
Then typecheck and the unit suite run without launching the Electron host
And a passing run prints a compact summary rather than per-test output
```

### File size cap is met

```
Given the refactor is complete
When file sizes are measured
Then no file under src/ or webview-ui/ exceeds 400 lines
And no file under test/unit/ exceeds 600 lines
```

## Acceptance Criteria

- [ ] `src/dbt/edit.ts` is replaced by `src/dbt/edit/` with an `index.ts`
      preserving the existing public API and import path.
- [ ] `src/webview/panel.ts` exports only `DiagramPanel`; HTML generation and
      message handling live in separate modules.
- [ ] `webview-ui/App.tsx` contains only `App`; canvas, sidebar chrome, and the
      three hooks live in their own files.
- [ ] `test/unit/dbt/edit.test.ts` is split under `test/unit/dbt/edit/` with a
      shared fixture helper and no loss of assertions.
- [ ] No file under `src/` or `webview-ui/` exceeds 400 lines; none under
      `test/unit/` exceeds 600 lines.
- [ ] `npm run verify` exists and runs typecheck + unit tests only.
- [ ] Vitest uses a compact reporter with a bounded assertion-diff threshold.
- [ ] `AGENTS.md` documents the size cap, `npm run verify`, and the
      `package-lock.json` rule.
- [ ] `npm test` and `npm run typecheck` are green; product behavior is
      identical to before the refactor.
