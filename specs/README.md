# Specs

This directory is the **source of truth** for dbtiagram product behavior. Nothing
under `src/` may be implemented, modified, or removed without an approved,
up-to-date spec in `specs/features/`.

## Layout

- `features/` — one Markdown file per feature. Each file uses Frontmatter
  (metadata) + Gherkin (`Given` / `When` / `Then`) scenarios.

## Feature Index

| ID  | Feature | Status |
|-----|---------|--------|
| 01  | Open dbt Diagram from the editor title bar | Done |
| 02  | Column-level foreign key edges | Done |
| 03  | React Flow diagram with automatic layout | Done |

Status values: `draft` → `approved` → `implemented` → `done`.

## Workflow

1. **Draft.** Write or extend a spec in `specs/features/` before touching code.
2. **Approve.** The user reviews and approves the spec (explicit confirmation).
3. **Implement.** Code is written test-first: pure logic in `src/dbt/` and
   `src/diagram/` with Vitest unit tests in `test/unit/`; VS Code API wiring in
   `src/vscode/` and `src/webview/`; integration coverage in `test/integration/`.
4. **Automatic Verify.** Run `npm test` and `npm run typecheck` and resolve every
   failure. This is automatic and runs before every commit.
5. **Manual Verify.** The user manually tests the feature in VS Code and reports
   adjustments. For each request the agent updates the spec first (the spec stays
   the source of truth), then applies the matching code changes, then re-runs
   Automatic Verify — iterating until the user is satisfied. The spec status
   stays `implemented` throughout this step.
6. **Done.** Only when the user explicitly confirms the feature is done does the
   agent set the spec status to `done` and update the index above.

When a scenario's desired behavior is ambiguous, ask the user — never guess.

## Version Control

Git history mirrors this lifecycle (see AGENTS.md → Git & Version Control):
spec drafts are iterated in the working tree **without commits**; a
`docs(spec): ... (approved)` commit is created only at approval time; the
implementing `feat:` commit leaves the spec at `implemented`; the
`docs(spec): mark feature XX done` commit is created only after the user
confirms the Manual Verify step.
