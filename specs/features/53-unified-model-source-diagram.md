---
id: 53
title: Unify model and source diagrams
status: approved
priority: medium
created: 2026-09-30
owner: unassigned
depends_on: [40, 49, 52]
---

# Unify model and source diagrams

## Summary

As a dbt developer, I want models and dbt sources in one diagram and one filter
sidebar, so that `ref()` and `source()` lineage can be explored without changing
diagram modes. Existing model and source entry points remain, but only determine
the initial file scope.

## Background

Model and source diagrams currently use separate modes and stores. SQL lineage
from spec 52 naturally joins both domains because `source()` is an upstream
dependency of a model. This feature removes the mode split while retaining each
domain's current editing permissions.

## Scope

**In scope**

- One combined graph containing model-YAML models, source-YAML tables and
  external/unknown read-only lineage cards.
- Separate `Model YAML files` and `Source YAML files` filter sections in the
  same left sidebar, plus corresponding model/source table sections.
- Namespaced stable IDs for models, sources and external refs.
- `source('source_name', 'table_name')` SQL lineage from source table to model.
- Existing model edits remain editable; existing source-mode edit restrictions
  remain exactly as specified by specs 40 and 49.
- `Open dbt Model Diagram` and `Open dbt Source Diagram` both open the combined
  diagram and initially scope/check the invoking file's domain.
- A new namespaced layout format for model, source and external table IDs.
  Existing pre-feature layout files are unsupported and require no migration.
- Saved layouts continue to persist tables and positions only, never `ref()` or
  `source()` lineage arrows; current SQL reconstructs arrows after opening.
- Combined auto-layout uses both `ref()` and `source()` lineage parent-to-child.
- Fixture source lineage for manual verification.

**Out of scope**

- Editing source identities or importing external package metadata.
- Resolving dynamic `source()` arguments.
- Removing either existing command or editor-title button.
- Merging model and source files into one sidebar section.

## Scenarios

### Open a combined diagram from model YAML

```
Given orders.yml and sources/finops.yml exist
When the user opens the diagram from orders.yml
Then one combined diagram opens
And the Model YAML files section is initially scoped to orders.yml
And the Source YAML files section is available but initially unchecked
```

### Open a combined diagram from source YAML

```
Given sources/finops.yml exists
When the user opens the diagram from that source file
Then the same combined diagram type opens
And that source file's tables are initially checked
And model files remain available in their own filter section
```

### Add source lineage

```
Given payments.sql contains source('finops', 'transactions')
And payments is displayed
When the user chooses Add lineage > Add upstream lineage
Then source table transactions is added
And an arrow points transactions -> payments
```

### Preserve domain edit permissions

```
Given a model card and a source card are displayed
When the user selects each card
Then model fields retain normal model editing
And source fields retain the source editing restrictions from specs 40 and 49
```

### Save and open the namespaced layout format

```
Given a combined diagram displays model "orders" and source "finops.transactions"
When the user saves and reopens its layout
Then both entries use their namespaced IDs
And both cards return at their saved positions
```

### Recalculate rather than persist source lineage

```
Given a saved layout contains source finops.transactions and model payments
And payments.sql no longer calls source('finops', 'transactions')
When the saved layout opens
Then both cards appear at their saved positions
And no transactions -> payments lineage arrow appears
```

### Keep colliding names distinct

```
Given model "transactions", source table "finops.transactions", and external package model "transactions" exist
When all are displayed
Then they are three distinct cards despite overlapping visible names
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/entityId.ts` | create | Namespaced model/source/external IDs. |
| `src/shared/diagramMode.ts` | modify | Replace runtime model/source mode with combined-domain labels while retaining source-kind scoping. |
| `src/shared/filter.ts` | modify | Compute visibility from independent model/source file and entity selections. |
| `src/shared/protocol.ts` | modify | Publish both file domains in one update and remove mode-dependent edit messages. |
| `src/dbt/sqlRefs.ts` | modify | Parse literal `source()` calls alongside `ref()` calls. |
| `src/diagram/graph.ts` | modify | Merge model/source nodes into one namespaced graph and emit source lineage inputs. |
| `src/diagram/layoutFile.ts` | modify | Replace the table identity format with namespaced model/source/external IDs, without legacy migration. |
| `src/diagram/lineage.ts` | modify | Resolve source targets and include them in transitive lineage closure and current-edge reconciliation. |
| `src/webview/panelKey.ts` | modify | Treat model/source file opens as combined panels while preserving per-file keys. |
| `src/webview/panel.ts` | modify | Always own/publish both stores and route edits by namespaced entity kind. |
| `src/webview/openSource.ts` | modify | Resolve namespaced model and source declarations without a global mode. |
| `src/webview/lineage.ts` | modify | Include parsed source dependencies in upstream results and displayed refresh. |
| `src/extension.ts` | modify | Open both existing commands into the combined panel with domain-specific initial scope. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Own separate model/source filters and one combined visible-ID set. |
| `webview-ui/App.tsx` | modify | Remove mode branching and compose domain behavior from each selected node's kind. |
| `webview-ui/FilterSidebar.tsx` | modify | Render separate model/source file and table sections together. |
| `webview-ui/DetailsSidebar.tsx` | modify | Select edit capabilities by entity kind rather than panel mode. |
| `webview-ui/FieldsMatrix.tsx` | modify | Select model/source matrix policy by row entity kind. |
| `webview-ui/hooks/useDraftForeignKeys.ts` | modify | Select forced-virtual behavior from the source entity kind. |
| `webview-ui/hooks/useSourceImport.ts` | modify | Operate in the combined panel without mode gating. |
| `test/unit/shared/entityId.test.ts` | create | Namespaced identity construction and parsing tests. |
| `test/unit/shared/filter.test.ts` | modify | Independent two-domain filter tests. |
| `test/unit/dbt/sqlRefs.test.ts` | modify | Literal source parsing and exclusions. |
| `test/unit/diagram/graph.test.ts` | modify | Combined node identity and source-lineage tests. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Namespaced layout parsing and serialization tests, including rejection of the old format. |
| `test/unit/webview/lineage.test.ts` | modify | Source upstream expansion tests. |
| `test/integration/suite/extension.test.ts` | modify | Both commands, scoping and combined persistence coverage. |
| `fixtures/sample-dbt/models/payments.yml` | create | Model metadata for source-lineage manual testing. |
| `fixtures/sample-dbt/models/payments.sql` | create | `source('finops', 'transactions')` fixture dependency. |
| `specs/ARCHITECTURE.md` | modify | Register entity IDs and update all changed responsibilities. |

### Signatures

```ts
// src/shared/entityId.ts (shared — must not import `vscode`)
export type DiagramEntityId =
  | `model:${string}:${string}`
  | `source:${string}:${string}`
  | `external:${string}:${string}`;
export function modelEntityId(packageName: string, modelName: string): DiagramEntityId;
export function sourceEntityId(sourceName: string, tableName: string): DiagramEntityId;
export function externalEntityId(packageName: string, modelName: string): DiagramEntityId;
export function parseDiagramEntityId(id: string):
  | { kind: 'model'; packageName: string; name: string }
  | { kind: 'source'; sourceName: string; tableName: string }
  | { kind: 'external'; packageName: string; name: string }
  | null;

// addition in src/dbt/sqlRefs.ts (pure)
export interface SqlSourceOccurrence { start: number; end: number; source: string; table: string }
export function findSqlSources(text: string): SqlSourceOccurrence[];

// changed src/shared/protocol.ts (shared)
export interface DiagramEntityFile {
  uri: string;
  label: string;
  domain: 'model' | 'source';
  entities: DiagramEntityId[];
}
// diagram:update no longer carries DiagramMode and always carries the combined graph/files.

// changed src/diagram/layoutFile.ts (pure)
export const LAYOUT_VERSION = 2;
export function parseDiagramLayout(text: string): DiagramLayout;

// changed src/webview/panelKey.ts (pure)
export type DiagramSource =
  | { kind: 'entityFile'; domain: 'model' | 'source'; fsPath: string }
  | { kind: 'layout'; fsPath: string }
  | { kind: 'adhoc'; id: string };
```

### Behavior notes

- Visible labels remain concise; identity always uses the namespaced ID. A model
  and source with the same visible name therefore never collide.
- Both stores load for every panel. Opening from a file applies initial scope
  only to that domain: the invoked file is checked and the other domain starts
  unchecked. Palette/layout opens follow their existing all/layout behavior.
- The sidebar has four lists under two domain groups: Model YAML files / Models,
  and Source YAML files / Sources. Search and All/None controls are independent.
- Source cards retain all current source-mode behavior, including read-only
  structural fields and forced-virtual constraints; model cards retain model
  behavior. External cards retain spec 52 read-only behavior.
- `findSqlSources` uses the same lexical exclusions and formatting rules as
  `findSqlRefs`, and accepts exactly two non-empty literal string arguments.
- Layout parsing accepts version 2 namespaced IDs only. A version-1 file is
  rejected with `DiagramLayoutParseError('Unsupported diagram layout version 1')`;
  it is never migrated or guessed.
- Layout serialization writes version 2 and namespaced IDs only. Positions,
  notes, groups and column display settings otherwise retain their semantics.
- Layouts never serialize lineage edges. After tables are restored, current SQL
  parsing rebuilds valid `ref()` and `source()` arrows; missing relationships
  remove only arrows and never remove restored cards.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/entityId.test.ts` | `keeps colliding entities distinct` | model/source/external named transactions | three distinct literal IDs |
| `test/unit/shared/entityId.test.ts` | `parses each namespaced entity kind` | one model, source and external literal ID | corresponding three parsed discriminated values |
| `test/unit/dbt/sqlRefs.test.ts` | `finds a literal source call` | `{{ source('finops', 'transactions') }}` | `{source:'finops',table:'transactions'}` |
| `test/unit/dbt/sqlRefs.test.ts` | `ignores source calls in comments and SQL strings` | excluded forms plus one executable call | one occurrence |
| `test/unit/shared/filter.test.ts` | `filters model and source domains independently` | one selected model file and one unselected source file | model visible, source hidden |
| `test/unit/diagram/graph.test.ts` | `builds a combined collision-safe graph` | colliding model/source names | both namespaced nodes present |
| `test/unit/webview/lineage.test.ts` | `adds source upstream lineage` | payments SQL source call | edge `source:finops:transactions -> model:sample:payments` |
| `test/unit/diagram/layoutFile.test.ts` | `round-trips namespaced model and source tables` | version-2 model/source entries with positions | identical IDs and positions after serialization and parse |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a version-1 layout` | version-1 layout text | `DiagramLayoutParseError('Unsupported diagram layout version 1')` |
| `test/unit/diagram/layoutFile.test.ts` | `serializes tables without lineage edges` | combined graph with model/source lineage plus table positions | serialized YAML contains table entries and no lineage key |
| `test/unit/webview/lineage.test.ts` | `missing source relationship keeps layout cards` | restored source/model IDs and model SQL without the prior source call | both displayed IDs remain; source lineage edges `[]` |
| `test/integration/suite/extension.test.ts` | `both commands open combined data with domain scope` | invoke model then source commands | each panel publishes both domains and scopes the invoking domain |

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.

### Do not touch

- Existing source edit permissions from specs 40 and 49.
- Existing model edit permissions.
- Command IDs and editor-title menu availability.
- No migration or compatibility path for pre-feature layout files.

## Acceptance Criteria

- [ ] One diagram and sidebar can show/filter model and source entities together.
- [ ] Existing model/source commands differ only in initial scope.
- [ ] Literal `source()` calls create source-to-model lineage.
- [ ] Namespaced IDs prevent model/source/external collisions.
- [ ] Domain-specific editing rules remain intact.
- [ ] Namespaced layouts save and reopen; pre-feature layout files are rejected without migration.
- [ ] Layout files store tables but no lineage arrows; current SQL reconstructs arrows without removing tables.
- [ ] `npm run verify` is green.
