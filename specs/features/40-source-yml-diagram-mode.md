---
id: 40
title: Add a source.yml diagram mode
status: implemented
priority: high
created: 2026-09-08
owner: unassigned
depends_on: [08, 13, 14, 22, 29, 34, 35]
---

# Add a source.yml diagram mode

## Summary

As a dbt developer, I want to open a diagram from a YAML file whose root contains
`sources`, inspect its source tables, edit table and column descriptions, and
maintain diagram-only primary and foreign keys, so that raw source structures can
be documented and related without pretending that dbt enforces those keys. The
existing model diagram remains the primary mode and keeps its current behavior;
source diagrams are a separate mode that reuse the diagram UI and layout features
without mixing source tables and models.

## Background

The extension currently recognizes only YAML files with a root `models` array.
dbt source files instead contain a root `sources` array, with tables nested below
each source. Source tables have no dbt PK/FK contract representation suitable for
this feature, so every key maintained by dbtiagram is virtual and is stored in the
table's existing `config.meta.dbtiagram.virtual` namespace.

Source files are expected under `models/`, like model YAML files. A separate
`dbtiagram.sourceFileGlob` setting is nevertheless clearer and lets users move
them independently later. It defaults to the same `**/models/**/*.yml` pattern.

## Scope

**In scope**

- Two mutually exclusive diagram modes: `model` and `source`.
- Root-key classification after parsing YAML: `models` selects model mode;
  otherwise `sources` selects source mode. If both keys exist, model mode wins.
- An editor-title action named **Open dbt Source Diagram** for classified source
  files. Existing model files continue to use **Open dbt Model Diagram**.
- A separate `dbtiagram.sourceFileGlob`, default
  `**/models/**/*.yml`; discovery still verifies the root key, so matching an
  arbitrary YAML path does not make it a source file.
- One source diagram tab per source YAML path, independent from model tabs.
- Source panels load only source YAML files and source tables. Model panels load
  only model YAML files and models. The two universes never mix.
- Every table identity, graph node ID, filter row, relationship target, and
  saved-layout table name is `source_name.table_name`, for example
  `finops.astro_cost_breakdown`. A card header normally shows only `table_name`;
  when two or more loaded source tables share that table name, only those
  colliding headers show their qualified `source_name.table_name` identities.
  The source's physical `schema` is not used for identity or display.
- All source entries and all their nested tables from every discovered source
  file are available to source mode. A file opened from the title bar is initially
  scoped to that file, matching model mode.
- The existing initial-selection cap and toast apply to source table IDs exactly
  as they apply to model names.
- Source-mode left-sidebar wording: **Source yml files** and **Tables**. Its file
  list contains source YAML files only.
- Source-mode property editing:
  - table description is editable;
  - column description is editable;
  - table name, column name, and data type are shown read-only;
  - source-level name, description, database, schema, and other source properties
    are not shown;
  - PK membership and FK targets/column pairs can be added, edited, and removed;
  - PKs and FKs are always virtual. Their **Virtual** controls are checked and
    disabled, and the PK's **Omit unique combination test** control is hidden;
  - the column-level **Primary key** checkbox remains editable and always emits a
    virtual PK edit.
- Source virtual constraints use the existing table-level shape:

  ```yaml
  config:
    meta:
      dbtiagram:
        virtual:
          primary_key:
            columns: [Workspace Name]
          foreign_keys:
            - to: source('finops', 'workspaces')
              columns: [Workspace Name]
              to_columns: [Workspace Name]
  ```

- Source FK references are canonicalized as
  `source('source_name', 'table_name')`; source FK targets can only be other
  source tables in the same source-mode workspace graph.
- Source-mode context menus and details buttons say **Reveal in source yml** and
  reveal the selected table or column declaration.
- Existing diagram-only features that are domain-neutral remain available:
  filtering, remove/add-related tables, column visibility, mouse-drawn FKs,
  automatic layout, notes, manual layout save, and viewport behavior.
- Surgical source-YAML write-back: editing a managed description or virtual key
  preserves unknown keys, comments, key order, source/table ordering, column
  configuration (including sample metadata), and unrelated sources/tables.
- Saved layout schema version 2 records `mode: model | source` while retaining
  the future-proof visual key `tables`. Version 1 layouts remain readable and
  are interpreted as model layouts; the next explicit save upgrades them to
  version 2.

**Out of scope**

- Mixing models and source tables in one panel, relationship, filter, or layout.
- Creating model.yml model entries from source tables.
- Editing source-level properties (`name`, `description`, `database`, `schema`,
  loader/freshness settings, quoting, tags, or other dbt source properties).
- Renaming source tables or columns, or editing source column data types.
- Showing source tables in the fields matrix, opening model SQL files from source
  mode, or treating dbt tests as source PK/FK declarations.
- Real/non-virtual source PKs or FKs, source key constraints, `not_null` tests, or
  `dbt_utils.unique_combination_of_columns` tests.
- Supporting a source FK target outside the source tables loaded by source mode.
- Changing model-mode labels, edit semantics, `ref(...)` storage, discovery
  results, initial selection, or layout behavior except for writing layout v2.
- A mode chooser for mixed files: a file containing both root keys opens only in
  model mode.

## Scenarios

### Open a source file in source mode

```
Given models/sources/finops.yml has a root sources array and no root models key
When the user clicks "Open dbt Source Diagram" in that editor
Then a source-mode diagram tab keyed by that file path opens
And only finops.yml is initially checked in "Source yml files"
And its nested tables are listed under "Tables"
And no model.yml models are loaded into the panel
```

### Model mode wins for a mixed YAML file

```
Given a YAML file contains both root models and root sources arrays
When its editor-title diagram action is evaluated and then opened
Then only "Open dbt Model Diagram" is offered
And the diagram opens in model mode
```

### Source tables have qualified identities

```
Given a source named finops has schema raw_finops and table astro_cost_breakdown
When its source diagram is rendered
Then the table node ID and Tables-filter label are "finops.astro_cost_breakdown"
And the card header is "astro_cost_breakdown"
And "raw_finops.astro_cost_breakdown" is not used as its identity or label
```

### Qualify only duplicate source table headers

```
Given source tables finops.orders, sales.orders, and crm.customers are loaded
When their source diagram is rendered
Then the finops.orders and sales.orders card headers use their qualified IDs
And the crm.customers card header is "customers"
And every graph ID and Tables-filter label remains qualified
```

### Multiple source blocks and files are reusable through the filter

```
Given the source workspace contains finops.costs, sales.orders, and crm.customers
And the diagram was opened from the file declaring finops.costs
When the user checks the other source YAML files
Then sales.orders and crm.customers become available and visible like checked models do today
And source tables beyond the initial-selection limit remain unchecked
And the existing initial-selection-limit toast is shown with table wording
```

### Edit source descriptions without damaging YAML

```
Given finops.astro_cost_breakdown has a table description, a column description,
  config.meta sample_values, unknown tags, comments, and neighbouring tables
When the user edits the table description and the column description
Then only those description scalar values and required YAML syntax change on disk
And sample_values, unknown tags, comments, ordering, and neighbouring tables remain present
```

### Source identity fields are read-only

```
Given finops.astro_cost_breakdown is selected in source mode
When the Properties sidebar is shown
Then its table name is visible but read-only
When one of its columns is selected
Then the column name and data type are visible but read-only
And every read-only input has a visibly muted background, foreground, and cursor
And the column description remains editable
And source-level database and schema fields are not shown
```

### Add and remove a virtual source primary key

```
Given finops.astro_cost_breakdown has no dbtiagram virtual primary key
When the user adds "Workspace Name" to its primary key
Then config.meta.dbtiagram.virtual.primary_key.columns is ["Workspace Name"] on that table
And the key is displayed as virtual
And no constraints, data_tests, tests, or not_null entry is created
When the user removes the last PK column
Then the empty dbtiagram virtual scaffolding is removed
```

### Source PK controls cannot create a real key

```
Given a source table is selected
When the Primary key section is displayed
Then Virtual is checked and disabled
And "Omit unique combination test" is absent
When a selected column's Primary key checkbox is toggled
Then the emitted setPrimaryKey edit has virtual true and uniqueTest false
```

### Add and edit a virtual source foreign key

```
Given source tables finops.costs and finops.workspaces are loaded
When the user creates an FK from costs.workspace_name to workspaces.workspace_name
Then costs config.meta stores to: source('finops', 'workspaces')
And its columns are ["workspace_name"] and to_columns are ["workspace_name"]
And the diagram draws a dashed virtual edge between the two column rows
When the user changes or removes the mapping
Then only that virtual FK entry is changed or removed
```

### Source FK controls cannot create a real key or cross modes

```
Given a source table FK card or mouse-drawn FK draft is shown
Then Virtual is checked and disabled
And its target picker contains only qualified source table IDs
And model names are absent
```

### Reveal source declarations

```
Given finops.astro_cost_breakdown is visible in source mode
When the user chooses "Reveal in source yml" for the table
Then the declaring source YAML opens at that nested table's name declaration
When the user chooses it for column "Workspace Name"
Then the editor reveals that column declaration inside that table
```

### Save and reopen a source layout without collisions

```
Given a source-mode diagram contains finops.astro_cost_breakdown
When the user saves its layout
Then the file contains version: 2, mode: source, and a tables entry named finops.astro_cost_breakdown
When that layout is reopened
Then a source-mode panel loads source tables and applies its saved positions
And a model with the same unqualified table name cannot satisfy the layout entry
```

### Open and upgrade a legacy layout

```
Given a version 1 layout has no mode and contains a table named orders
When it is opened
Then it is interpreted as a model-mode layout
And the file is not rewritten merely by opening it
When the user explicitly saves it
Then it is written as version 2 with mode: model and the tables key is retained
```

### Reject a layout whose mode cannot be honored

```
Given a version 2 layout has mode: source
When it is opened in a workspace with no matching source tables
Then the panel still opens in source mode
And its missing source table names are reported by the existing layout warning path
And it never falls back to matching model names
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Contribute `dbtiagram.sourceFileGlob`, the source-open command/menu item and source context key; broaden watch-setting wording without changing its key/default. |
| `src/shared/diagramMode.ts` | create | Shared `DiagramMode` type and mode-specific UI nouns. |
| `src/dbt/sourceTypes.ts` | create | Pure typed representation of source YAML files, source blocks, and nested tables. |
| `src/dbt/sourceRefs.ts` | create | Parse and format canonical two-argument dbt `source(...)` references and qualified source table IDs. |
| `src/dbt/sourceParse.ts` | create | Parse source YAML, enforce model-root precedence, and preserve unmodeled mappings. |
| `src/dbt/sourceSerialize.ts` | create | Deterministic fallback serialization and source-shaped object conversion. |
| `src/dbt/sourceMerge.ts` | create | Surgical merge of edited source state into existing YAML text with source/table/column policies. |
| `src/dbt/sourceLocate.ts` | create | Locate a nested source table or one of its columns in source YAML text. |
| `src/dbt/sourceStore.ts` | create | Pure last-good store, live file reconciliation, flattening, and redistribution for source files. |
| `src/dbt/sourceEdit.ts` | create | Source-mode edit dispatcher: descriptions plus forced-virtual PK/FK edits over qualified table IDs. |
| `src/dbt/virtual.ts` | modify | Generalize virtual-block helpers from `ModelDefinition` to any typed owner with `config`, preserving model behavior. |
| `src/dbt/edit/foreignKey.ts` | modify | Accept an optional target-reference formatter so source edit reuse writes `source(...)`; the default remains `ref(...)`. |
| `src/diagram/graph.ts` | modify | Add source graph construction while sharing table-node/edge derivation; source relationships parse only `source(...)` and are always virtual. |
| `src/diagram/layoutFile.ts` | modify | Normalize v1 layouts to v2/model, validate v2 mode, serialize v2 mode, and keep `tables`. |
| `src/shared/protocol.ts` | modify | Add panel mode to updates and generalize file/source-reveal metadata without allowing mixed universes. |
| `src/shared/filter.ts` | modify | Consume generalized diagram file/entity metadata; algorithms and model-mode results remain unchanged. |
| `src/shared/relations.ts` | modify | Consume generalized diagram file/entity metadata with no traversal behavior change. |
| `src/vscode/project.ts` | modify | Discover/read/write source YAML through its independent glob and surgical merge. |
| `src/vscode/modelWatcher.ts` | modify | Generalize the watcher port so each panel supplies its mode's glob while preserving the existing watch toggle. |
| `src/vscode/editorButton.ts` | modify | Classify parsed root keys with model precedence and expose model/source context keys. |
| `src/vscode/editorButtonContext.ts` | modify | Scan both globs, classify candidate contents, and maintain mutually exclusive model/source context keys. |
| `src/webview/panelKey.ts` | modify | Add source-file and mode-bearing ad-hoc identity while preserving layout key behavior. |
| `src/webview/openSource.ts` | modify | Resolve and reveal either a model declaration or nested source table/column declaration by mode. |
| `src/webview/layoutMessages.ts` | modify | Require a layout's mode to match the owning panel and use mode-neutral known entity IDs. |
| `src/webview/panel.ts` | modify | Own a model or source store, load/watch/publish/edit/write/reveal only that mode, and preserve existing model paths. |
| `src/extension.ts` | modify | Register source-open and mode-aware layout opening; palette `dbtiagram.open` remains model mode. |
| `webview-ui/App.tsx` | modify | Thread mode through labels/actions, force virtual source FK gestures, hide model-only matrix/SQL actions, and retain domain-neutral features. |
| `webview-ui/DiagramCanvas.tsx` | modify | Hide the Fields Matrix canvas action in source mode. |
| `webview-ui/FilterSidebar.tsx` | modify | Render mode nouns (`Model yml files`/`Models` or `Source yml files`/`Tables`) and hide Open SQL in source mode. |
| `webview-ui/DetailsSidebar.tsx` | modify | Render source names/types read-only, source reveal wording, and forced-virtual PK/FK sections. |
| `webview-ui/PrimaryKeySection.tsx` | modify | Add forced-virtual presentation and hide the unique-test option in source mode. |
| `webview-ui/ForeignKeySection.tsx` | modify | Force persisted and draft FKs virtual and make Virtual checked/read-only in source mode. |
| `webview-ui/columnPrimaryKey.ts` | modify | Derive source column PK toggles with `virtual: true`, `uniqueTest: false`. |
| `webview-ui/hooks/useDraftForeignKeys.ts` | modify | Seed every source-mode FK draft as virtual and refuse virtual-state changes. |
| `webview-ui/hooks/useFkCreateMode.ts` | modify | Carry source-mode forced-virtual creation through the existing mouse gesture. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Expose the mode supplied by `diagram:update`. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Use mode-neutral entity metadata and reuse the existing selection cap/toast with mode nouns. |
| `webview-ui/styles.css` | modify | Visually mute read-only source identity inputs with theme-aware colors and a read-only cursor. |
| `specs/ARCHITECTURE.md` | modify | Add new modules and update changed responsibilities/exports. |
| `specs/README.md` | modify | Add feature 40 as Draft (or Approved at approval time). |
| `fixtures/sample-dbt/models/sources/finops.yml` | create | Minimal multi-table source fixture with descriptions, metadata, and virtual relationships. |
| `test/unit/dbt/sourceParse.test.ts` | create | Source parsing, mixed-root precedence, preservation, and errors. |
| `test/unit/dbt/sourceRefs.test.ts` | create | Qualified IDs and source-reference parsing/formatting. |
| `test/unit/dbt/sourceMerge.test.ts` | create | Surgical source description/virtual-key write-back and fallback. |
| `test/unit/dbt/sourceLocate.test.ts` | create | Nested source table and column declaration positions. |
| `test/unit/dbt/sourceStore.test.ts` | create | Source last-good/live-update/redistribution behavior. |
| `test/unit/dbt/sourceEdit.test.ts` | create | Forced-virtual descriptions, PKs, FKs, validation, and read-only edit rejection. |
| `test/unit/diagram/graph.test.ts` | modify | Source node IDs, PK/FK display, source edges, and model graph regression. |
| `test/unit/diagram/layoutFile.test.ts` | modify | v1 normalization and v2 model/source parse/serialize/apply cases. |
| `test/unit/shared/filter.test.ts` | modify | Source-qualified IDs and unchanged initial-cap behavior. |
| `test/unit/vscode/editorButton.test.ts` | modify | Root classification and model precedence. |
| `test/unit/webview/panelKey.test.ts` | modify | Source keys/titles and mode-bearing layout sources. |
| `test/unit/webview/openSource.test.ts` | modify | Nested source table/column reveal and model regression. |
| `test/unit/webview/layoutMessages.test.ts` | modify | Mode match/mismatch and v1-model behavior. |
| `test/unit/webview/columnPrimaryKey.test.ts` | modify | Forced-virtual source toggle output and model regression. |
| `test/unit/fixture.test.ts` | modify | Exercise the sample source file through parse, graph, edit, and merge. |
| `test/integration/suite/extension.test.ts` | modify | Source editor action, independent source panel, write-back, and mode-aware layout smoke coverage. |

### Signatures

```ts
// src/shared/diagramMode.ts (shared — must not import `vscode`)
export type DiagramMode = 'model' | 'source';
export interface DiagramModeLabels {
  fileSection: 'Model yml files' | 'Source yml files';
  entitySection: 'Models' | 'Tables';
  entitySingular: 'model' | 'table';
  sourceFile: 'model.yml' | 'source yml';
}
export function diagramModeLabels(mode: DiagramMode): DiagramModeLabels;
```

```ts
// src/dbt/sourceTypes.ts (pure — must not import `vscode`)
import type { ModelColumn, ModelConfig } from './types';

export interface SourceTableDefinition {
  name: string;
  description?: string;
  config?: ModelConfig;
  columns?: ModelColumn[];
  extra?: Record<string, unknown>;
}
export interface SourceDefinition {
  name: string;
  description?: string;
  tables: SourceTableDefinition[];
  extra?: Record<string, unknown>;
}
export interface SourceYmlFile {
  version?: number;
  sources: SourceDefinition[];
  extra?: Record<string, unknown>;
}
export interface QualifiedSourceTable {
  id: string;
  sourceName: string;
  table: SourceTableDefinition;
}
export function flattenSourceTables(sources: readonly SourceDefinition[]): QualifiedSourceTable[];
```

```ts
// src/dbt/sourceRefs.ts (pure — must not import `vscode`)
export interface SourceRef { source: string; table: string; id: string }
export function sourceTableId(source: string, table: string): string;
export function parseSourceRef(value: string): SourceRef | null;
export function formatSourceRef(id: string): string;
```

```ts
// src/dbt/sourceParse.ts (pure — must not import `vscode`)
export class SourceYmlParseError extends Error {
  public readonly source: string;
  public readonly cause?: unknown;
}
export class NotASourceYmlFileError extends SourceYmlParseError {}
export function parseSourceYml(content: string, source?: string): SourceYmlFile;
```

```ts
// src/dbt/sourceSerialize.ts (pure — must not import `vscode`)
export function toDbtSourceShape(file: SourceYmlFile): Record<string, unknown>;
export function serializeSourceYml(file: SourceYmlFile): string;
```

```ts
// src/dbt/sourceMerge.ts (pure — must not import `vscode`)
export function mergeSourceYml(originalText: string, file: SourceYmlFile): string;
```

```ts
// src/dbt/sourceLocate.ts (pure — must not import `vscode`)
export function findSourceTableDeclaration(text: string, sourceName: string, tableName: string): DeclarationPosition | null;
export function findSourceColumnDeclaration(text: string, sourceName: string, tableName: string, columnName: string): DeclarationPosition | null;
```

```ts
// src/dbt/sourceStore.ts (pure — must not import `vscode`)
export interface SourceFileRecord { uri: string; file: SourceYmlFile }
export interface LoadedSourceFile { uri: string; file: SourceYmlFile }
export interface FailedSourceFile { uri: string; error: string }
export interface SourceStore {
  records: SourceFileRecord[];
  pendingErrors: Map<string, string>;
}
export function createSourceStore(records?: SourceFileRecord[]): SourceStore;
export function upsertSourceRecord(store: SourceStore, uri: string, file: SourceYmlFile): SourceStore;
export function applySourceTextChange(store: SourceStore, uri: string, content: string): SourceStore;
export function applySourceFileDeleted(store: SourceStore, uri: string): SourceStore;
export function applySourceFileRenamed(store: SourceStore, oldUri: string, newUri: string, content: string): SourceStore;
export function replaceSourceStore(store: SourceStore, loaded: readonly LoadedSourceFile[], failed: readonly FailedSourceFile[]): SourceStore;
export function distributeEditedSources(store: SourceStore, edited: SourceDefinition[]): SourceFileRecord[];
```

```ts
// src/dbt/sourceEdit.ts (pure — must not import `vscode`)
import type { ModelEdit } from './edit';
export interface ApplySourceEditResult { sources: SourceDefinition[]; changed: boolean }
export function applySourceEdit(sources: SourceDefinition[], edit: ModelEdit): ApplySourceEditResult;
```

```ts
// src/dbt/virtual.ts (pure — changed/generalized)
export interface VirtualConstraintOwner { config?: ModelConfig }
export function readVirtualConstraints(owner: VirtualConstraintOwner): VirtualConstraintsBlock;
export function writeVirtualConstraints<T extends VirtualConstraintOwner>(owner: T, block: VirtualConstraintsBlock): T;
```

```ts
// src/dbt/edit/foreignKey.ts (pure — changed; existing callers use defaults)
export type ForeignKeyTargetFormatter = (target: string) => string;
export function applyForeignKeyTarget(models: ModelDefinition[], modelName: string, fk: ForeignKeyDescriptor, target: string, formatTarget?: ForeignKeyTargetFormatter): ApplyEditResult;
export function createForeignKey(models: ModelDefinition[], modelName: string, target: string, columns: string[], toColumns: string[], virtual: boolean, formatTarget?: ForeignKeyTargetFormatter): ApplyEditResult;
```

```ts
// src/diagram/graph.ts (pure — changed/additive)
export function buildDiagram(models: ModelDefinition[]): DiagramGraph;
export function buildSourceDiagram(sources: SourceDefinition[]): DiagramGraph;
```

```ts
// src/diagram/layoutFile.ts (pure — changed)
export const LAYOUT_VERSION = 2;
export interface DiagramLayout {
  version: typeof LAYOUT_VERSION;
  mode: DiagramMode;
  name: string;
  tables: DiagramLayoutTable[];
  notes: DiagramNote[];
  defaultColumnDisplay?: ColumnDisplayMode;
}
export function buildLayout(name: string, mode: DiagramMode, visible: readonly { name: string; x: number; y: number }[], notes?: readonly DiagramNote[], columnDisplay?: { default: ColumnDisplayMode; overrides: ReadonlyMap<string, ColumnDisplayMode> }): DiagramLayout;
```

`parseDiagramLayout`, `serializeDiagramLayout`, and `applyLayout` retain their
existing exported signatures; parsing returns normalized version 2 objects.

```ts
// src/shared/protocol.ts (shared — changed)
export interface DiagramEntityFile {
  uri: string;
  label: string;
  entities: string[];
}
// `diagram:update` becomes:
// { type: 'diagram:update'; mode: DiagramMode; diagram: DiagramGraph;
//   pendingErrors: DiagramPendingError[]; files: DiagramEntityFile[] }
// `filter:scope` keeps `{ uri }`.
// Replace `model:openSource` with:
// { type: 'diagram:openSource'; entity: string; column?: string }
```

```ts
// src/vscode/project.ts (vscode-facing)
export interface SourceYmlRecord { uri: vscode.Uri; file: SourceYmlFile }
export interface SourceYmlFailure { uri: vscode.Uri; message: string }
export interface SourceYmlLoadResult { records: SourceYmlRecord[]; failures: SourceYmlFailure[] }
export async function loadSourceYmlFiles(glob?: string): Promise<SourceYmlLoadResult>;
export async function writeSourceYmlFile(uri: vscode.Uri, file: SourceYmlFile): Promise<void>;
```

```ts
// src/vscode/editorButton.ts (pure)
export type DbtYmlKind = DiagramMode | 'none';
export const sourceFileContextKey = 'dbtiagram.isSourceYml';
export function classifyDbtYml(content: string): DbtYmlKind;
```

```ts
// src/webview/panelKey.ts (pure)
export type DiagramSource =
  | { kind: 'layout'; fsPath: string }
  | { kind: 'model'; fsPath: string }
  | { kind: 'source'; fsPath: string }
  | { kind: 'adhoc'; id: string; mode: DiagramMode };
export function diagramSourceMode(source: Exclude<DiagramSource, { kind: 'layout' }>): DiagramMode;
```

`diagramPanelKey` and `diagramPanelTitle` retain their existing signatures. A
source title is `<file base name> — dbt Diagram`; its key starts with `source:`.
The layout key remains path-based; `DiagramPanel.createOrShow` reads and parses a
layout before creating its panel, then initializes that panel with the layout's
normalized mode.

```ts
// src/webview/openSource.ts (pure host orchestration)
export interface OpenSourceRequest { mode: DiagramMode; entity: string; column?: string }
export function openDiagramSource(host: OpenSourceHost, request: OpenSourceRequest): Promise<void>;
```

```ts
// webview-ui/PrimaryKeySection.tsx (webview)
interface PrimaryKeySectionProps {
  node: TableNode;
  onEdit: (edit: ModelEdit) => void;
  forceVirtual?: boolean;
}

// webview-ui/ForeignKeySection.tsx (webview)
interface ForeignKeySectionProps {
  // existing properties unchanged
  forceVirtual?: boolean;
}

// webview-ui/columnPrimaryKey.ts (webview, pure)
export function toggleColumnPrimaryKey(node: TableNode, columnName: string, forceVirtual?: boolean): ModelEdit;
```

All other changed component/hook interfaces add a required `mode: DiagramMode`
or mode-specific labels where needed; they do not introduce a second graph,
selection, layout, or message state machine.

### Behavior notes

1. **Classification and precedence.** `classifyDbtYml` catches YAML parse errors
   and non-mapping roots as `none`. A present root `models` key returns `model`
   even when `sources` is also present; otherwise a present `sources` key returns
   `source`; otherwise `none`. The domain parsers still validate that the chosen
   key is an array and report malformed selected files through the existing
   pending-error mechanism.
2. **Discovery cost.** Model and source scans may visit the same paths because
   their default globs overlap. Each loader reads candidates once within its own
   panel and silently skips the other kind. No global duplicate store is added;
   model panels remain isolated from source parsing and source panels from model
   parsing. Layout files are excluded from both.
3. **Identity.** `sourceTableId` concatenates the exact source and table names
   with `.` and performs no trimming/case folding. Empty names are parse errors.
   Duplicate qualified IDs follow existing model-mode behavior; this feature
   adds no new duplicate-name validation or resolution policy. Source graph
   node IDs remain qualified. Their display labels are the unqualified table
   name unless that table name occurs more than once in the loaded source
   universe; every member of that collision set then uses its qualified ID.
4. **Reference grammar.** `parseSourceRef` accepts `source('a', 'b')` and
   `source("a", "b")` with arbitrary surrounding/argument whitespace but no
   Jinja braces, package argument, concatenation, or mixed expression. It returns
   null for anything else. `formatSourceRef('a.b')` splits at the first dot and
   returns exactly `source('a', 'b')`; an ID without both non-empty parts throws
   `Invalid source table id "<id>"`.
5. **Source parsing.** Root unknown keys, source unknown keys (including
   `database` and `schema`), and table unknown keys are retained in `extra` for
   fallback safety. Columns use the same normalized `name`, `data_type`,
   `description`, and `config.meta` representation as models. A flat column
   `meta` remains ignored/preserved exactly as in model mode.
6. **Graph reuse.** `buildSourceDiagram` adapts nested source tables to the same
   `TableNode`/`RelationEdge` contracts. It reads only virtual blocks, parses only
   `source(...)`, sets every reported key/edge `virtual: true`, and always sets
   PK `uniqueTest: false`. Handwritten `constraints`, model tests, or `ref(...)`
   values do not create source keys/edges.
7. **Edit reuse and enforcement.** `applySourceEdit` maps qualified tables to the
   existing model-shaped PK/FK helpers, but passes `formatSourceRef` and forces
   virtual true. It accepts `setModelDescription`, `setColumnDescription`,
   `setPrimaryKey`, `setForeignKeyTarget`, `setForeignKeyColumns`,
   `createForeignKey`, and `removeForeignKey`. It rejects name/data-type/meta
   edits and `setForeignKeyVirtual` with `EditError('This field is read-only in source mode')`.
   A source `setPrimaryKey` with `virtual: false` or source FK creation with
   `virtual: false` is normalized to true rather than trusted. `uniqueTest` is
   ignored and no real artifacts are touched.
8. **Write-back.** Source shape emits root keys in `version`, existing unknowns,
   `sources` order; source/table/column sequences reconcile positionally.
   Existing keys are never reordered. Deletable source/table keys are limited to
   understood string `description` and mapping `config`; column deletion policy
   matches model mode. Descendants round-trip via typed fields/`extra` before
   allowing deletion. Unusable original YAML falls back to
   `serializeSourceYml`, and line endings follow the original when mergeable.
9. **UI read-only fields.** Read-only Name/Data type controls use the same visual
   field layout with `readOnly` and no commit handler; they remain selectable for
   copying. They use theme-aware muted background/foreground colors and the
   default cursor so their read-only state is visually apparent. Table and
   column descriptions keep current commit/revert semantics.
10. **Forced virtual UI.** Source mode passes `forceVirtual`. PK/FK Virtual
    checkboxes render checked and disabled. Drafts initialize virtual true; no
    source callback can flip them. The unique-test checkbox and real-key note are
    omitted. Mouse-drawn source FKs post `virtual: true`. Model mode omits the
    prop and remains byte-for-byte behaviorally equivalent.
11. **Mode-specific features.** Source mode hides Fields Matrix and every Open
    SQL action. Add related tables operates on source edges and qualified IDs.
    Reveal labels use `source yml`; model mode retains `model.yml`. Empty/filter/
    selection-cap text uses the labels from `diagramModeLabels`.
12. **Layout migration.** `parseDiagramLayout` accepts version 1 only without a
    `mode`, normalizing it in memory to `{version: 2, mode: 'model'}`. Version 2
    requires mode exactly `model` or `source`. Other versions and invalid/missing
    v2 modes throw readable errors. Serialization always writes key order
    `version`, `mode`, `name`, `tables`, optional `notes`, optional display mode.
    Merely opening v1 does not write; explicit save writes normalized v2.
13. **Layout panel mode.** A layout is parsed before its panel/store is created,
    and the normalized layout mode selects that panel's store. Layout
    reconciliation receives only that mode's IDs. `openLayout` rejects a layout differing from the panel
    mode with `Layout mode "<layout>" does not match panel mode "<panel>"`.
14. **Panel and watcher isolation.** A panel has one immutable mode even after it
    is re-keyed to a saved layout. Its loader, store, graph builder, write path,
    reveal locator, filter metadata, and watcher glob are selected once from that
    mode. A source edit never enters `applyEdit`; a model edit never enters
    `applySourceEdit`.
15. **Source reveal.** The locator first finds the matching source `name`, then
    the nested table `name`, then the nested column. A missing column falls back
    to the table declaration; a missing table reports the existing user-facing
    not-found error with the qualified ID.
16. **Existing model behavior.** Default target formatting in model FK edits is
    still exactly `ref('<target>')`. V1 layouts open as model layouts. Model
    context classification, labels, SQL/matrix actions, editable names/types,
    virtual toggles, unique-test option, and all tests remain unchanged.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/sourceParse.test.ts` | `parses nested source tables and columns` | supplied finops YAML | source `finops`; table `astro_cost_breakdown`; column data type `VARCHAR(16777216)` and meta `{max_length:17,…}` |
| `test/unit/dbt/sourceParse.test.ts` | `model root wins over source root` | YAML with `models: []` and `sources: [...]` | throws `NotASourceYmlFileError` |
| `test/unit/dbt/sourceParse.test.ts` | `requires a sources array` | `sources: nope` | `SourceYmlParseError` message `source yml is missing the required "sources" array` |
| `test/unit/dbt/sourceParse.test.ts` | `retains source and table extras` | source with database/schema/tags and table freshness | exact values remain in `extra` |
| `test/unit/dbt/sourceRefs.test.ts` | `formats a qualified target` | `finops.workspaces` | `source('finops', 'workspaces')` |
| `test/unit/dbt/sourceRefs.test.ts` | `parses supported quote styles` | single- and double-quoted source calls | `{source:'finops',table:'workspaces',id:'finops.workspaces'}` for both |
| `test/unit/dbt/sourceRefs.test.ts` | `rejects non-source expressions` | `ref('x')`, `{{ source('a','b') }}`, `source('a')` | `null`, `null`, `null` |
| `test/unit/dbt/sourceMerge.test.ts` | `changes only table and column descriptions` | commented YAML with metadata/unknown keys and edited state | new scalar texts; every named comment/unknown key/sample value remains and sibling table text is unchanged |
| `test/unit/dbt/sourceMerge.test.ts` | `adds and removes virtual blocks surgically` | table with unknown config siblings | exact virtual shape is inserted/removed; unknown siblings remain |
| `test/unit/dbt/sourceMerge.test.ts` | `falls back for unusable YAML` | non-mapping original plus valid desired state | parseable serialized source YAML with version/sources |
| `test/unit/dbt/sourceLocate.test.ts` | `locates a nested source table and column` | finops YAML, table `astro_cost_breakdown`, column `Workspace Name` | each returned range selects the matching nested `name` scalar |
| `test/unit/dbt/sourceStore.test.ts` | `keeps last good source data on malformed edits` | valid then malformed text | old record retained and pending error set |
| `test/unit/dbt/sourceStore.test.ts` | `silently drops a file changed to model mode` | source record then text with root models | record and pending error absent |
| `test/unit/dbt/sourceStore.test.ts` | `redistributes a qualified table edit to its file` | two source files, second table changed | only second `SourceFileRecord` returned |
| `test/unit/dbt/sourceEdit.test.ts` | `edits source descriptions` | qualified table/column IDs | only requested descriptions change |
| `test/unit/dbt/sourceEdit.test.ts` | `forces a virtual primary key` | `setPrimaryKey` carrying `virtual:false, uniqueTest:true` | only `config.meta.dbtiagram.virtual.primary_key.columns` exists; no constraints/tests |
| `test/unit/dbt/sourceEdit.test.ts` | `creates a canonical virtual source FK` | create FK carrying `virtual:false` | virtual entry `to` equals `source('finops', 'workspaces')` and no constraint exists |
| `test/unit/dbt/sourceEdit.test.ts` | `rejects read-only edits` | set name, data type, meta, or FK virtual | each returns error `This field is read-only in source mode` |
| `test/unit/diagram/graph.test.ts` | `builds qualified source nodes and dashed edges` | finops costs/workspaces with virtual FK | node IDs `finops.costs`,`finops.workspaces`; one edge with `virtual:true` |
| `test/unit/diagram/graph.test.ts` | `qualifies only duplicate source table labels` | finops.orders, sales.orders, crm.customers | labels `finops.orders`, `sales.orders`, `customers`; IDs remain qualified |
| `test/unit/diagram/graph.test.ts` | `ignores model relationships in source mode` | source table extras containing constraints/ref | no source edge |
| `test/unit/diagram/graph.test.ts` | `model graph is unchanged` | existing model fixture | existing literal model graph snapshot/equality remains green |
| `test/unit/diagram/layoutFile.test.ts` | `normalizes version 1 to model mode` | v1 layout text | `{version:2,mode:'model',…}` in memory |
| `test/unit/diagram/layoutFile.test.ts` | `round trips a source layout` | v2/source qualified table | serialized `version: 2`, `mode: source`, same table after parse |
| `test/unit/diagram/layoutFile.test.ts` | `rejects invalid v2 mode` | v2 without mode and v2 mode `mixed` | readable `DiagramLayoutParseError` for each |
| `test/unit/shared/filter.test.ts` | `caps qualified source table IDs` | more than `INITIAL_MODEL_SELECTION_LIMIT` source IDs | selected set contains exactly the first limit in input order; notice reports remaining count |
| `test/unit/vscode/editorButton.test.ts` | `classifies model source and mixed roots` | model-only, source-only, both, invalid YAML | `model`, `source`, `model`, `none` |
| `test/unit/webview/panelKey.test.ts` | `distinguishes model and source panels for one path` | model/source sources with same path | different `model:` and `source:` keys; same title format |
| `test/unit/webview/openSource.test.ts` | `reveals nested source table and column` | finops YAML + qualified request | table and column declaration positions respectively |
| `test/unit/webview/openSource.test.ts` | `keeps model reveal behavior` | existing model request | existing literal host calls unchanged |
| `test/unit/webview/layoutMessages.test.ts` | `rejects a layout mode mismatch` | source layout + model host | exact error `Layout mode "source" does not match panel mode "model"`; no apply message |
| `test/unit/webview/columnPrimaryKey.test.ts` | `forces a source column toggle virtual` | no PK, toggle with force true | `{kind:'setPrimaryKey',model:'finops.costs',columns:['id'],virtual:true,uniqueTest:false}` |
| `test/unit/webview/columnPrimaryKey.test.ts` | `keeps model defaults` | existing no-PK model toggle | existing `virtual:false, uniqueTest:true` output |
| `test/unit/fixture.test.ts` | `loads the source fixture end to end` | fixture source YAML | qualified nodes, descriptions/meta, virtual key/edge and surgical edit survive |
| `test/integration/extension.test.ts` | `opens and edits a source diagram` | active fixture source editor | source panel opens; description edit persists; model records absent |
| `test/integration/extension.test.ts` | `opens a mode-aware source layout` | v2/source layout | source panel and matching qualified node position |

React rendering scenarios (read-only styling, hidden matrix/SQL,
disabled Virtual controls, hidden unique-test option, and mode-specific toast)
are covered by Manual Verify because this repository has no React component test
harness. Their state-producing helpers and host effects are covered above.

### Verification

- `npm run verify` — strict typecheck and all unit suites must pass.
- `npm test` — unit and VS Code integration suites must pass before commit.
- Manual Verify (F5): open the sample source file; confirm source-only sidebar
  labels and qualified IDs; edit both descriptions; create/remove PK and FK by
  sidebar and mouse; inspect preserved YAML; reveal table/column; save/reopen a
  source layout; open a v1 layout and verify it stays model mode until saved.

### Do not touch

- Model-mode on-disk PK/FK semantics: real/virtual switching, `ref(...)`,
  constraints, tests, unique-combination behavior, and current error strings.
- Model parsing/serialization/merge shapes except the generic virtual-owner type
  and optional FK target formatter explicitly listed above.
- Layout `tables` key, note schema, column-display schema, coordinate rounding,
  dirty-state rules, manual-save rules, or save-dialog behavior.
- Edge routing, flow handle IDs, node geometry, automatic layout algorithms,
  sidebar resizing, settings, update checks, or SQL discovery/opening code.
- Fields-matrix implementation and preferences; source mode only hides its entry
  point.
- Any source-level property editing or cross-mode graph composition.

## Acceptance Criteria

- [ ] Root `models`/`sources` classification selects separate model/source modes,
      with model precedence for mixed files.
- [ ] `dbtiagram.sourceFileGlob` exists with the agreed default and only
      classified source files enter source panels.
- [ ] Source tables use `source_name.table_name` for identity and never mix with
      models; card headers qualify only table-name collisions.
- [ ] Source sidebar labels, initial file scope, selection cap, toast, filtering,
      and domain-neutral diagram features behave as specified.
- [ ] Only table/column descriptions and virtual PK/FK definitions are editable;
      names/types are visibly read-only and source-level fields are absent.
- [ ] Every source PK/FK is stored only under table
      `config.meta.dbtiagram.virtual`, and FKs use canonical `source(...)`.
- [ ] Source reveal actions locate nested table and column declarations.
- [ ] Source writes preserve unknown YAML, comments, ordering, metadata, and
      untouched entries.
- [ ] Layout v2 records mode and retains `tables`; v1 is read as model and
      upgraded only on explicit save.
- [ ] Model-mode observable behavior remains unchanged.
- [ ] No file outside the Implementation Plan Files table is modified.
- [ ] `npm test` and `npm run typecheck` are green after implementation.
