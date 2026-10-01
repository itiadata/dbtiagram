---
id: 56
title: Add downstream lineage from source cards
status: implemented
priority: medium
created: 2026-10-01
owner: unassigned
depends_on: [52, 53]
---

# Add downstream lineage from source cards

## Summary

As a dbt developer, I want a source card's context menu to offer `Add lineage >
Add downstream lineage`, so that I can expand every model transitively fed by
that source without first locating a model card.

## Background

Model cards already expose upstream and downstream SQL-lineage expansion. Source
cards participate in `source()` lineage but their normal context menu does not
offer lineage expansion, even though a project-wide downstream scan can discover
models that consume the source.

## Scope

**In scope**

- An `Add lineage` submenu on source-card context menus opened from either the
  header or a column row.
- One source action, `Add downstream lineage`, using the existing downstream
  progress, cancellation, placement and result behavior.
- Complete transitive expansion: direct `source()` consumers and all model
  descendants reached through `ref()` calls.
- The same downstream-only menu policy for local and read-only source cards.
- Preserve the existing two-direction lineage menu on model and external-model
  cards.

**Out of scope**

- Upstream lineage from a source card; model SQL provides no parent relation for
  a dbt source.
- Changes to SQL parsing, source identity, lineage rendering, layout persistence
  or automatic refresh.
- Precomputing source descendants merely to enable or disable the action.

## Scenarios

### Add complete downstream lineage from a source header

```
Given source finops.transactions feeds payments through source('finops', 'transactions')
And report refs payments
And only finops.transactions is displayed
When the user right-clicks the source header and chooses Add lineage > Add downstream lineage
Then payments and report are added to the diagram
And arrows point finops.transactions -> payments -> report
And the existing source card does not move
```

### Offer the same action from a source column

```
Given source finops.transactions is displayed with column transaction_id
When the user right-clicks the transaction_id row
Then the context menu contains Add lineage > Add downstream lineage
And the Add lineage submenu does not contain Add upstream lineage
```

### Complete a source scan with no descendants

```
Given no model SQL calls source('finops', 'transactions')
When the user chooses Add lineage > Add downstream lineage on finops.transactions
Then the downstream scan completes normally
And no table or lineage edge is added
```

### Preserve model lineage actions

```
Given a model or external-model card is displayed
When the user opens its context menu
Then Add lineage still contains Add upstream lineage
And Add lineage still contains Add downstream lineage
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/features/56-source-downstream-lineage-action.md` | create | Define source-card downstream lineage behavior and its implementation contract. |
| `specs/README.md` | modify | Add feature 56 to the feature index. |
| `specs/ARCHITECTURE.md` | modify | Register the new pure webview lineage-menu policy module and test responsibility. |
| `webview-ui/lineage-menu.ts` | create | Purely select the lineage directions offered for each diagram entity kind. |
| `webview-ui/App.tsx` | modify | Build source-card lineage submenu items from the shared menu policy for header and column context menus. |
| `test/unit/webview/lineage.test.ts` | modify | Lock the existing direct and transitive downstream traversal behavior when rooted at a source, including an empty result. |
| `test/unit/webview/lineageMenu.test.ts` | create | Cover source, model and external-model context-menu direction policy. |

### Signatures

```ts
// webview-ui/lineage-menu.ts (webview pure — must not import `vscode`)
import type { DiagramEntityKind } from '../src/shared/entityId';

export type LineageDirection = 'upstream' | 'downstream';

export function lineageDirectionsForEntity(
  kind: DiagramEntityKind,
): readonly LineageDirection[];
```

No exported signature changes are required in `webview-ui/App.tsx`.

### Behavior notes

- `lineageDirectionsForEntity('source')` returns only `['downstream']`.
  `model` and `external` each return `['upstream', 'downstream']`, preserving
  their current menu behavior.
- `buildTableMenuItems` uses the entity kind rather than model-only conditional
  rendering. It emits the exact parent label `Add lineage` and child labels
  `Add upstream lineage` / `Add downstream lineage`, with the existing icons and
  callbacks. Because the same builder serves headers and rows, both source
  invocation points receive the same submenu.
- A source's downstream item is enabled without pre-scanning. If the source has
  no descendants, the ordinary scan reaches its final progress count and
  returns empty `nodes` and `edges` arrays.
- The existing `expandDownstream` accepts the source's namespaced ID as its
  traversal start. A discovered edge such as `source:finops:transactions ->
  model:sample:payments` therefore seeds the same descendant closure already
  used by model-rooted requests; this behavior is locked by tests rather than
  changed by this feature.
- The descendant closure includes direct source consumers and recursively
  connected model descendants. The result excludes the root source from
  `nodes`, includes only descendant nodes, and includes only edges connecting
  the root or one descendant to another descendant.
- Existing downstream progress and cancellation remain atomic. Existing card
  positions remain unchanged and new cards use downstream placement from spec
  52.
- Read-only source cards use the same downstream-only policy. External-model
  cards remain model-like and continue to expose both directions.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/webview/lineageMenu.test.ts` | `offers only downstream lineage for a source` | kind `'source'` | `['downstream']` |
| `test/unit/webview/lineageMenu.test.ts` | `preserves both lineage directions for model cards` | kinds `'model'` and `'external'` | each returns `['upstream', 'downstream']` |
| `test/unit/webview/lineage.test.ts` | `expands downstream transitively from a source` | root `source:finops:transactions`; `payments` calls that source; `report` refs `payments` | node IDs `['model:sample:payments', 'model:sample:report']`; edges `source:finops:transactions -> model:sample:payments` and `model:sample:payments -> model:sample:report`; final progress `{scanned:2,total:2}` |
| `test/unit/webview/lineage.test.ts` | `returns an empty downstream result for an unused source` | root `source:finops:transactions`; two model SQL files with no matching `source()` call | `nodes: []`; `edges: []`; final progress `{scanned:2,total:2}` |

The source-column scenario uses the same tested direction policy and the
existing shared `buildTableMenuItems` path; its header/row wiring is checked in
Manual Verify.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- `npm run typecheck` — must be green after the full test run.

### Do not touch

- `src/shared/protocol.ts` — the existing downstream request/result messages are
  sufficient.
- `src/dbt/sqlRefs.ts` and `src/diagram/lineage.ts` — existing literal `ref()` /
  `source()` parsing and descendant traversal remain unchanged.
- `src/webview/lineage.ts`, `src/webview/panel.ts` and
  `src/vscode/lineageFiles.ts` — reuse the existing source-root-compatible
  traversal, project-wide SQL enumeration, resolution, progress and
  cancellation behavior unchanged.
- Lineage edge rendering, automatic layout, retained-position placement and
  layout-file persistence.
- Foreign-key context-menu behavior and source edit permissions.

## Acceptance Criteria

- [ ] A source header and source column context menu both contain `Add lineage > Add downstream lineage`.
- [ ] A source `Add lineage` submenu does not offer upstream lineage.
- [ ] Source expansion adds all direct and transitive model descendants with the correct arrows.
- [ ] An unused source completes the scan without adding cards or edges.
- [ ] Existing progress, cancellation and retained-position behavior is reused.
- [ ] Model and external-model cards retain both lineage directions.
- [ ] `npm run verify` is green.
