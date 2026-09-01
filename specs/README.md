# Specs

This directory is the **source of truth** for dbtiagram product behavior. Nothing
under `src/` may be implemented, modified, or removed without an approved,
up-to-date spec in `specs/features/`.

## Layout

- `features/` — one Markdown file per feature. Each file uses Frontmatter
  (metadata) + Gherkin (`Given` / `When` / `Then`) scenarios + an
  `## Implementation Plan`.
- `TEMPLATE.md` — the canonical skeleton for a new feature spec. Copy it.
- `ARCHITECTURE.md` — one line per module under `src/` and `webview-ui/`
  (path, responsibility, key exports, layer rule). Consult it while planning so
  every path a plan cites is real; update it in the same commit as any module
  add/split/removal.

## Feature Index

| ID  | Feature | Status |
|-----|---------|--------|
| 01  | Open dbt Diagram from the editor title bar | Done |
| 02  | Column-level foreign key edges | Done |
| 03  | React Flow diagram with automatic layout | Done |
| 04  | Live model.yml edits reflected without losing layout | Done |
| 05  | Filter diagram by model.yml files and models | Done |
| 06  | Edit model and column properties in the diagram | Done |
| 07  | Fix FK edge hover interactivity | Done |
| 08  | Editable primary keys and foreign keys | Done |
| 09  | FK edges and handle dots follow column pairs (merged former 09 + 10) | Done |
| 11  | Sidebar visibility and resizable widths | Done |
| 12  | Obstacle-aware FK edge routing with free side choice | Done |
| 13  | Saved diagram layout files | Done |
| 14  | One diagram tab per source file, scoped to that file | Done |
| 15  | Locate a model from the sidebar list | Done |
| 16  | Sticky notes on the diagram | Done |
| 17  | Modular source layout and fast feedback loop | Done |
| 18  | Plan-time implementation contracts | Done |
| 19  | Diagram viewport and chrome polish | Done |
| 20  | Show foreign keys with missing columns as broken instead of dropping them | Implemented |
| 21  | Fix details pane auto-reveal and the lost first click after opening a diagram | Done |
| 22  | Manual save for diagram layout files | Implemented |
| 23  | Diagram open-behavior settings panel | Implemented |
| 24  | Per-table column visibility in the diagram | Done |
| 25  | Reveal a specific column in model.yml | Done |
| 26  | Draw a foreign key with the mouse | Done |
| 27  | Column fields matrix (spreadsheet-style batch editor) | Done |
| 28  | Lucide icons for UI buttons | Approved |
| 29  | Surgical model.yml write-back that only touches edited keys | Done |
| 30  | Show a test-tube icon on columns that have a data test | Draft |
| 31  | Group tables inside a named box on the diagram | Draft |
| 32  | Fit the view after auto-layout | Done |
| 33  | Opt in or out of the model-level unique-combination test for a primary key | Draft |
| 34  | Column primary-key toggle and a Reveal in model.yml button in the details sidebar | Implemented |
| 35  | Cap the initial model selection for large workspaces | Done |
| 36  | Remove a table from the diagram | Draft |
| 37  | Add related tables to the diagram | Draft |
| 38  | Open a model's .sql file from the diagram and the sidebar | Draft |

Status values: `draft` → `approved` → `implemented` → `done`.

## Two-pass workflow

Work is split into a **planning pass** and an **implementation pass**, which may
be performed by models of different capability. The expensive reasoning happens
once, at plan time, and is captured in the spec; implementation is then
transcription plus verification.

- **Planning pass.** Copy `TEMPLATE.md`, write Summary / Scope / Scenarios, then
  do the design work: read the code, consult `ARCHITECTURE.md`, and fill in the
  `## Implementation Plan` — files, signatures, behavior notes, tests,
  verification, do-not-touch. Every design judgement call is resolved here.
- **Implementation pass.** Follow the plan literally. Write the listed files and
  the listed tests, run the listed verification commands. Touch no file outside
  the plan's Files table. When the plan does not cover something, **stop and
  ask** — do not invent behavior, and do not "improve" adjacent code.

A file discovered to be missing from the Files table is a *plan bug*: return to
the planning pass and amend the spec rather than improvising.

## Definition of Ready

A spec may not move from `draft` to `approved` unless all of the following hold.
This gate is checked at the point where the lifecycle already requires the
user's explicit confirmation.

- [ ] Summary, Scope (in and out) and at least one Gherkin scenario are present.
- [ ] An `## Implementation Plan` exists with **all six** subsections present —
      Files, Signatures, Behavior notes, Tests, Verification, Do not touch. A
      subsection with nothing to say reads `None.`; it is never omitted.
- [ ] The Files table names every file to create or modify, with an action and a
      responsibility.
- [ ] Every exported function/type that is new or changed has its exact
      TypeScript signature and its layer rule (`pure`, `shared`,
      `vscode-facing`, `webview`).
- [ ] Every scenario maps to at least one test case in the Tests subsection, and
      each test case names its file, its input, and its literal expected output.
- [ ] Every path cited in the plan exists in the repo or is explicitly marked
      `create`.

Specs created before feature 18 keep their current shape; they are not
retrofitted.

## Workflow

1. **Draft.** Copy `TEMPLATE.md` into `specs/features/` and write the spec —
   including its `## Implementation Plan` — before touching code.
2. **Approve.** The user reviews and approves the spec (explicit confirmation).
   The Definition of Ready above is a hard gate on this transition.
3. **Implement.** Follow the Implementation Plan. Code is written test-first:
   pure logic in `src/dbt/` and
   `src/diagram/` with Vitest unit tests in `test/unit/`; VS Code API wiring in
   `src/vscode/` and `src/webview/`; integration coverage in `test/integration/`.
4. **Automatic Verify.** Run `npm test` and `npm run typecheck` and resolve every
   failure. This is automatic and runs before every commit.
5. **Manual Verify.** The user manually tests the feature in VS Code and reports
   adjustments. For each request the agent updates the spec first (the spec stays
   the source of truth), then applies the matching code changes. **Automatic
   Verify is mandatory after every manual iteration**: the agent re-runs `npm
   test` and `npm run typecheck` and resolves every failure before the next
   iteration — and before the user can confirm the feature done. The iteration
   loop ends only on a green tree (tests and typecheck passing). The spec status
   stays `implemented` throughout this step.
6. **Done.** Only when the user explicitly confirms the feature is done — which
   happens only after the final Automatic Verify pass from step 5 — does the
   agent set the spec status to `done` and update the index above.

When a scenario's desired behavior is ambiguous, ask the user — never guess.

## Version Control

Git history mirrors this lifecycle (see AGENTS.md → Git & Version Control):
spec drafts are iterated in the working tree **without commits**; a
`docs(spec): ... (approved)` commit is created only at approval time; the
implementing `feat:` commit leaves the spec at `implemented`; the
`docs(spec): mark feature XX done` commit is created only after the user
confirms the Manual Verify step, which by then has passed Automatic Verify after
every manual iteration.
