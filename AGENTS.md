# AGENTS.md

## Project Overview

**dbtiagram** is a VS Code extension that provides a visual, webview-based editor for
[dbt](https://docs.getdbt.com/) `model.yml` (schema.yml) files. It renders an
ER-style diagram of the models/tables described in the workspace's YAML files and
lets the user add or edit tables, columns, descriptions, and other dbt model
properties through that UI. Every change is written back to the corresponding
`model.yml` file in real time.

The extension has **no runtime AI dependency** — it works fully offline.

## Repository Layout

- `specs/` — Feature specs (Spec-Driven Development). **This is the source of
  truth for product behavior. Never implement anything not specified here.**
  - `specs/features/` — one Markdown file per feature, Frontmatter + Gherkin.
  - `specs/README.md` — spec index and workflow.
- `src/` — TypeScript extension logic, organized to enforce the API-isolation rule:
  - `src/dbt/` — **pure** domain logic: parsing/serializing model.yml, edit
    application. MUST NOT import `vscode`.
  - `src/diagram/` — **pure** graph logic (nodes/edges from models). MUST NOT
    import `vscode`.
  - `src/shared/` — types shared between the extension host and the webview.
  - `src/vscode/` — **isolated wrappers** for every VS Code API touch point
    (file discovery, file reads/writes).
  - `src/webview/` — extension-host side of the webview panel.
  - `src/extension.ts` — `activate` / `deactivate` lifecycles only.
- `webview-ui/` — React webview front-end (bundled by esbuild into `dist/webview/`).
- `fixtures/sample-dbt/` — minimal dbt workspace used as the F5 debug target and
  exercised by `test/unit/fixture.test.ts`.
- `test/unit/` — Vitest suites for pure domain logic. Run in <1s without the
  VS Code Electron host.
- `test/integration/` — Mocha + `@vscode/test-electron` suites that launch a
  real VS Code host.

## Commands

- `npm run build` — bundle extension host + webview with esbuild into `dist/`.
- `npm run watch` — incremental rebuild on source change.
- `npm run typecheck` — `tsc --noEmit` (strict).
- `npm run test:unit` — Vitest unit suites (fast, no Electron host).
- `npm run test:integration` — Mocha integration suites in a real VS Code host
  (downloads/caches a VS Code build on first run).
- `npm test` — unit + integration.
- `npm run package` — build then package a `.vsix` with `@vscode/vsce`.

## Corporate Network Setup (TLS Interception / Zscaler)

On corporate networks that TLS-intercept HTTPS (e.g. Zscaler), Node.js fails with
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` because it does not trust the corporate CA.
`npm install` hangs or fails while `curl` works fine. This repo ships a fix:

1. `scripts/setup-corporate-ca.ps1` exports the corporate root CA(s) from the
   Windows certificate store into `.certs/zscaler-root-ca.pem` and configures
   the project `.npmrc` (`cafile=./.certs/zscaler-root-ca.pem`). It is idempotent
   and safe to re-run. A baseline `.certs/zscaler-root-ca.pem` is committed, so
   `npm install` works even before running the script on a Zscaler tenant that
   uses the standard root.
2. The project `.npmrc` makes **npm commands** work in every session with zero
   per-machine config.
3. **npx / `node` fetch / `@vscode/test-electron` first-run downloads** bypass npm
   and use Node's TLS directly, so they also need `NODE_EXTRA_CA_CERTS`. The
   script sets it as a user environment variable; restart opencode/terminals
   after running it.

Machines NOT under TLS interception need no action — the extra CA in the
committed `.certs/` bundle only adds trust and is harmless.

## Engineering Rules (Mandatory)

1. **Spec-Driven Development.** NEVER modify or add code under `src/` without an
   approved, up-to-date spec in `specs/`. Write or extend the spec first, have it
   approved, then implement. When behavior is ambiguous, ask the user instead of
   guessing.
2. **Strict TypeScript.** No `any` (use `unknown` + narrowing), no implicit
   `any`. All VS Code API usage must live in the isolated wrapper modules
   (`src/vscode/`, `src/webview/`); pure domain logic (`src/dbt/`, `src/diagram/`)
   must never import `vscode`.
3. **Test-First.** Core business logic must be decoupled from VS Code APIs so
   unit tests complete in sub-second time without launching the Electron host.
   Write/extend the unit test alongside (or just before) the logic it verifies.
4. **Self-Verification.** Before declaring a task complete, run `npm test` and
   resolve every failure. Type errors are failures too — run `npm run typecheck`.

## Git & Version Control

The repo tracks the spec-driven workflow. The primary agent handles commits
automatically; no user action is required for routine work.

### Branching

- Default branch is `main` with linear history. Work directly on `main`.
- Short-lived feature branches (`feat/02-<slug>`) only when a feature grows
  unusually large (multi-day / many commits).

### Commit conventions

- **Conventional Commits** (`type(scope): summary`), bodies reference the spec
  file, e.g. `Implements specs/features/02-edit-column-descriptions.md`.
- Commit type maps to the spec lifecycle stage:

  | Stage | Type | Example |
  |-------|------|---------|
  | Spec approved | `docs(spec):` | `docs(spec): add feature 02 - edit column descriptions (approved)` |
  | Implementation + tests | `feat:` | `feat: implement column description editing (spec 02)` |
  | Fix during implementation | `fix:` | `fix: preserve YAML comments when writing back (spec 02)` |
  | Tooling/build | `chore:` | `chore: bump typescript to 5.6` |
  | Refactor | `refactor:` | `refactor: simplify model discovery (spec 03)` |

### Commit policy (rules for the agent)

- **Spec drafting produces no commits.** Iterate on the spec in the working tree
  as many times as needed; commit only at the moment of approval
  (`docs(spec): ... (approved)`).
- A feature reaches `done` only after the user confirms the Manual Verify step
  (see `specs/README.md` → Workflow). The implementing `feat:` commit leaves the
  spec at `implemented`; the `docs(spec): mark feature XX done` status update is
  committed separately at that point. Adjustments requested during Manual Verify
  update the spec first, then the code (`fix:` or `feat:` as appropriate), and
  must pass Automatic Verify before committing.
- Never commit with failing tests or typecheck errors (`npm test` +
  `npm run typecheck` must be green first).
- **Security gate:** before every commit, run the `security-review` subagent
  against the staged + unstaged + untracked change set. A commit proceeds only
  on `VERDICT: CLEAN`, or after the user explicitly adjudicates every finding.
- Never amend, rebase, force-push, or open PRs without explicit user instruction.
- Keep `.gitignore` current; never stage `node_modules/`, `dist/`, `out/`,
  `.vscode-test/`, or `*.vsix`.
- `.certs/zscaler-root-ca.pem` is tracked as a committed baseline (see Corporate
  Network Setup). Do not gitignore it.

## Agents & Subagents

- A single primary agent is configured in `.opencode/agent/primary.md` and is the
  default agent for all work in this repo.
- The `security-review` subagent (`.opencode/agent/security-review.md`) is a
  read-only pre-commit gate: it scans staged/unstaged/untracked files for
  secrets, tokens, credentials, private keys, and `.gitignore` violations, and
  returns a `CLEAN` / `FINDINGS` verdict. The primary agent MUST spawn it before
  every commit (see Git & Version Control → Commit policy).
- **Dynamic subagent rule:** If a feature or task becomes complex (e.g., requiring
  deep security audits, heavy webview UI testing, or complex dependency
  migrations), PROPOSE creating a specialized subagent to the user before setting
  it up. Never silently spawn one.

## Webview & Message Protocol

The diagram lives in a custom Webview (React). Extension host and webview
communicate exclusively through the typed message protocol in `src/shared/protocol.ts`.
The webview is the only component allowed to mutate the in-memory model set; every
mutation is applied by the pure `applyEdit` in `src/dbt/edit.ts` and persisted
through the wrappers in `src/vscode/`.
