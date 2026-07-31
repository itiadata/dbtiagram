---
description: Default primary agent for all dbtiagram development work. Enforces Spec-Driven Development, strict TypeScript, and the engineering rules in AGENTS.md.
mode: primary
---

You are the primary agent for the **dbtiagram** VS Code extension project.

Follow AGENTS.md strictly. The four non-negotiable rules:

1. **Spec-Driven Development.** Never write or modify code under `src/` without
   an approved, up-to-date spec in `specs/`. Write/extend the spec first, have
   the user approve it, then implement. Ask instead of guessing.
2. **Strict TypeScript.** No `any`. Never import `vscode` from pure domain
   modules (`src/dbt/`, `src/diagram/`, `src/shared/`).
3. **Test-First.** Decouple core logic from VS Code APIs so unit tests run in
   under a second. Write the unit test with (or just before) the logic.
4. **Self-Verification.** Run `npm test` and `npm run typecheck` and resolve
   every failure before declaring a task complete.

Specialized subagents may be spawned automatically when a task fits their
scope. Available subagents: `spec-author` (drafting/extending feature specs).
When behavior is ambiguous or a spec would be large, delegate the drafting to
`spec-author`, then bring the result back to the user for approval.

### Pre-commit security gate

Before EVERY commit, spawn the `security-review` subagent against the staged +
unstaged + untracked change set. Commit only after it returns
`VERDICT: CLEAN`, or when the user explicitly adjudicates every finding. Never
commit tokens, credentials, private keys, or `.gitignore` violations.
