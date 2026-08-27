---
id: NN
title: <Short imperative title>
status: draft
priority: high | medium | low
created: YYYY-MM-DD
owner: unassigned
depends_on: []
---

# <Title>

## Summary

One paragraph, user-story shaped: as the <role>, I want <capability>, so that
<benefit>. Describe *what* the product does, not how it is built.

## Background

Why this is needed now: the current behavior, the pain it causes, and any
prior feature this builds on. Omit the section if there is nothing to say.

## Scope

**In scope**

- Bullets describing exactly what this feature covers.

**Out of scope**

- Bullets describing adjacent work this feature deliberately does not do.

## Scenarios

Gherkin, one fenced block per scenario, with a `###` heading naming it.

### <Scenario name>

```
Given <precondition>
When <action>
Then <observable outcome>
And <further outcome>
```

## Implementation Plan

Written during the **planning pass**, before approval. This section is the
contract the implementing pass transcribes. Every subsection below is
mandatory; a subsection with nothing to say is written as `None.` and is never
omitted, so a missing subsection always signals an incomplete plan.

Consult `specs/ARCHITECTURE.md` while writing this section so that every path
cited is a real one.

### Files

Every file to create or modify. No file outside this table may be touched
during implementation. A file discovered to be missing from the table is a
**plan bug**: return to the planning pass and amend the spec rather than
improvising.

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/…` | create / modify / delete | What this file does for this feature. |

### Signatures

The exact exported signature of every new or changed function, type and
interface, in TypeScript, each annotated with the layer rule that applies
(`pure`, `vscode-facing`, `shared`, `webview`). The implementing pass writes
bodies, not APIs.

```ts
// src/…  (pure — must not import `vscode`)
export function doThing(input: Thing): Result;
```

### Behavior notes

Ordering constraints, identity-preservation requirements, error messages as
literal strings, and edge cases — each tied to the scenario it satisfies.
Anything a reasonable implementer could get wrong in more than one way belongs
here.

### Tests

The specific test cases to write: file path, test name, input, and literal
expected output. Every entry under `## Scenarios` maps to at least one test
listed here. Expected values are written out, not described.

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/…` | `…` | `…` | `…` |

### Verification

The exact commands to run, in order, with the expected result. Normally:

- `npm run verify` — typecheck + unit suites, must be green.
- `npm test` — before the commit, must be green.

### Do not touch

Modules, behaviors and public APIs that must remain byte-identical, and the
reason. This is the guard rail that keeps the implementing pass from
"improving" adjacent code.

## Acceptance Criteria

- [ ] One checkbox per observable outcome, phrased so it can be checked off by
      inspection or by a passing test.
- [ ] `npm run verify` is green.
