---
id: 18
title: Plan-time implementation contracts for split planning/implementation models
status: done
priority: high
created: 2026-08-27
owner: unassigned
depends_on: [17]
---

# Plan-time implementation contracts for split planning/implementation models

## Summary

As the maintainer, I want every feature spec to carry a mechanical
**Implementation Plan** written during the planning pass, so a cheaper model can
implement the feature correctly on the first attempt without re-deriving design
decisions, exploring the codebase, or guessing at file layout.

The expensive reasoning happens once, at plan time, and is captured in the spec.
Implementation becomes transcription plus verification.

## Background

Today a spec describes *what* the product does and leaves *how* to
implementation time. That worked when the same model did both passes, but it
means the costly work — locating the right module, choosing signatures, deciding
which tests to write, understanding the purity and layering rules — is repeated
on every implementation.

Splitting the two passes across models of different capability only pays off if
the plan is precise enough that the implementing model never has to make a
judgement call. Where the plan is vague, a cheaper model will guess, and
`AGENTS.md`'s "ask instead of guessing" rule is unreliable at that tier.

Spec 17 is a prerequisite: with every module under 400 lines, a plan can name a
small file as the unit of work instead of pointing at a 1000-line module.

## Scope

**In scope**

- A mandatory `## Implementation Plan` section in the feature spec template.
- A Definition of Ready gate: a spec may not move to `approved` without one.
- `specs/ARCHITECTURE.md`: a one-line-per-module map so plans can cite real
  paths without the implementing model exploring for them.
- `AGENTS.md` and `specs/README.md` updates describing the two-pass workflow.

**Out of scope**

- Any change to `src/`, `webview-ui/`, or product behavior.
- Retrofitting Implementation Plans onto specs already marked `done`.
- Configuring which model runs which pass (a runtime concern, not a repo one).

## The Implementation Plan contract

Every new feature spec gains a `## Implementation Plan` section after
`## Scenarios`, containing these subsections. A subsection with nothing to say
is written as `None.` — never omitted, so a missing one always signals an
incomplete plan.

### Files

An explicit table of every file to create or modify. No file outside this table
may be touched; a file the plan forgot is a plan bug, to be fixed by returning
to the planning pass rather than improvised during implementation.

| Path | Action | Responsibility |
|------|--------|----------------|

### Signatures

The exact exported signature of every new or changed function, type, and
interface, in TypeScript, with the layer rule that applies to it (pure vs
VS Code-facing). The implementing pass writes bodies, not APIs.

### Behavior notes

Ordering constraints, identity-preservation requirements, error messages as
literal strings, and edge cases — each tied to the scenario it satisfies.
Anything a reasonable implementer could get wrong in more than one way belongs
here.

### Tests

The specific test cases to write: file path, test name, input, expected output.
Every `## Scenarios` entry maps to at least one listed test. Expected values are
literal, not described.

### Verification

The exact commands to run, in order, with the expected result — normally
`npm run verify`, plus `npm test` before the commit.

### Do not touch

Modules, behaviors, and public APIs that must remain byte-identical, and the
reason. This is the guard rail that keeps a cheap model from "improving"
adjacent code.

## Scenarios

### A spec cannot be approved without an implementation plan

```
Given a feature spec with Summary, Scope and Scenarios but no Implementation Plan
When the spec is put forward for approval
Then it is rejected as not ready
And the missing section is added before approval is requested again
```

### The plan names every file the implementation touches

```
Given an approved spec whose Implementation Plan lists the files to change
When the feature is implemented
Then no file outside that list is created or modified
And a file discovered to be missing from the list sends the spec back to planning
```

### Every scenario is covered by a listed test

```
Given an approved spec with N scenarios
When its Implementation Plan is reviewed
Then each scenario maps to at least one test case in the Tests subsection
And each listed test case names its file, its input, and its literal expected output
```

### The architecture map keeps plans grounded

```
Given a planning pass that needs to place new logic
When the planner consults specs/ARCHITECTURE.md
Then it finds each module's path, responsibility and key exports
And the resulting plan cites real existing paths rather than invented ones
```

### Implementation does not re-derive design decisions

```
Given an approved spec with a complete Implementation Plan
When a model implements it
Then it writes the listed files and tests as specified
And it runs the listed verification commands
And it asks for guidance instead of inventing behavior the plan does not cover
```

## Implementation Plan

This spec changes documentation only; it is its own first worked example.

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/TEMPLATE.md` | create | The canonical feature spec skeleton, including the Implementation Plan section with all six subsections. |
| `specs/ARCHITECTURE.md` | create | One line per module under `src/` and `webview-ui/`: path, responsibility, key exports, layer rule. |
| `specs/README.md` | modify | Document the two-pass workflow and the Definition of Ready gate in the Workflow section; link the template. |
| `AGENTS.md` | modify | Note that specs carry Implementation Plans and that implementation follows the plan rather than re-deriving it. |

### Signatures

None. No code changes.

### Behavior notes

- `specs/ARCHITECTURE.md` must state the layer rule per module explicitly
  (`pure`, `vscode-facing`, `shared`, `webview`), because that rule is the one
  an implementing model is most likely to violate.
- The Definition of Ready gate applies at the `draft` → `approved` transition,
  which is where the existing lifecycle already requires user confirmation.
- Existing specs keep their current shape; only specs created after this one
  carry an Implementation Plan.

### Tests

None — there is no executable behavior. Verification is by review:
`specs/ARCHITECTURE.md` is checked against the actual module list, and the next
feature spec written after this one is checked against `specs/TEMPLATE.md`.

### Verification

- `npm run verify` — must stay green (documentation-only change).
- Every path named in `specs/ARCHITECTURE.md` exists in the repo.

### Do not touch

- Any file under `src/`, `webview-ui/`, or `test/` — this spec is
  documentation-only.
- The existing spec lifecycle (`draft` → `approved` → `implemented` → `done`)
  and its commit conventions, which stay exactly as they are.

## Acceptance Criteria

- [x] `specs/TEMPLATE.md` exists and contains the six Implementation Plan subsections.
- [x] `specs/ARCHITECTURE.md` lists every module under `src/` and `webview-ui/`
      with its responsibility, key exports, and layer rule.
- [x] Every path named in `specs/ARCHITECTURE.md` resolves to a real file.
- [x] `specs/README.md` documents the two-pass workflow and the Definition of
      Ready gate.
- [x] `AGENTS.md` instructs the implementing pass to follow the Implementation
      Plan and to stop and ask when the plan does not cover something.
- [x] No file under `src/`, `webview-ui/` or `test/` is modified.
- [x] `npm run verify` is green.
