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
- Static documentation generation and its browser viewer use the same combined
  entity universe, namespaced layouts and SQL-derived lineage.

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
| `src/shared/entityEdit.ts` | create | Validate an entity-targeted edit, remove namespaces for the existing domain edit engines, and reject external/cross-domain edits. |
| `src/shared/diagramMode.ts` | modify | Replace panel mode with model/source domain labels used only for file sections and entity capabilities. |
| `src/shared/filter.ts` | modify | Compute visibility from independent model/source file and entity selections. |
| `src/shared/relations.ts` | modify | Keep related-entity/file lookup namespaced and domain-independent. |
| `src/shared/matrixColumns.ts` | modify | Derive matrix capabilities from an entity domain instead of a panel mode. |
| `src/shared/protocol.ts` | modify | Publish both file domains in one update and remove mode-dependent edit messages. |
| `src/dbt/sqlRefs.ts` | modify | Parse literal `source()` calls alongside `ref()` calls. |
| `src/diagram/graph.ts` | modify | Merge model/source nodes into one namespaced graph and emit source lineage inputs. |
| `src/diagram/layoutFile.ts` | modify | Replace the table identity format with namespaced model/source/external IDs, without legacy migration. |
| `src/diagram/lineage.ts` | modify | Resolve source targets and include them in transitive lineage closure and current-edge reconciliation. |
| `src/vscode/modelWatcher.ts` | modify | Watch the union of model/source globs once and dispatch each YAML event to both classifiers. |
| `src/webview/panelKey.ts` | modify | Treat model/source file opens as combined panels while preserving per-file keys. |
| `src/webview/panel.ts` | modify | Always own/publish both stores and route edits by namespaced entity kind. |
| `src/webview/openSource.ts` | modify | Resolve namespaced model and source declarations without a global mode. |
| `src/webview/lineage.ts` | modify | Include parsed source dependencies in upstream results and displayed refresh. |
| `src/webview/layoutMessages.ts` | modify | Open/save mode-free combined layouts and reconcile all namespaced entities. |
| `src/extension.ts` | modify | Open both existing commands into the combined panel with domain-specific initial scope. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Own separate model/source filters and one combined visible-ID set. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch domain-qualified scope and combined update messages. |
| `webview-ui/hooks/useLayoutPersistence.ts` | modify | Build mode-free combined layouts. |
| `webview-ui/hooks/useLineage.ts` | modify | Add local model/source lineage nodes through the combined filter and restore only external layout nodes locally. |
| `webview-ui/App.tsx` | modify | Remove mode branching and compose domain behavior from each selected node's kind. |
| `webview-ui/FilterSidebar.tsx` | modify | Render separate model/source file and table sections together. |
| `webview-ui/DetailsSidebar.tsx` | modify | Select edit capabilities by entity kind rather than panel mode. |
| `webview-ui/FieldsMatrix.tsx` | modify | Select model/source matrix policy by row entity kind. |
| `webview-ui/FieldsMatrixRow.tsx` | modify | Enforce source-row read-only cells inside a mixed global matrix. |
| `webview-ui/ForeignKeySection.tsx` | modify | Restrict FK targets to the selected entity's domain and show concise labels. |
| `webview-ui/hooks/useDraftForeignKeys.ts` | modify | Select forced-virtual behavior from the source entity kind. |
| `webview-ui/hooks/useSourceImport.ts` | modify | Reveal imported model entity IDs while retaining concise report names. |
| `src/static/project.ts` | modify | Read the dbt package name and model SQL files for static lineage. |
| `src/static/site.ts` | modify | Build one combined static universe and reconstruct current ref/source lineage. |
| `src/static/generate.ts` | modify | Report one combined layout count after static schema unification. |
| `src/shared/staticSite.ts` | modify | Replace separate model/source static universes and routes with one combined explorer. |
| `static-ui/StaticDiagram.tsx` | modify | Render the combined static universe with domain-aware shared sidebars. |
| `static-ui/DiagramMenu.tsx` | modify | Present one combined explorer and one combined saved-layout section. |
| `webview-ui/matrix-row-order.ts` | modify | Derive row-structure capability from the selected node's entity kind. |
| `test/unit/shared/entityId.test.ts` | create | Namespaced identity construction and parsing tests. |
| `test/unit/shared/entityEdit.test.ts` | create | Domain routing, namespace removal and cross-domain rejection tests. |
| `test/unit/shared/filter.test.ts` | modify | Independent two-domain filter tests. |
| `test/unit/shared/relations.test.ts` | modify | Namespaced related-entity and declaring-file tests. |
| `test/unit/shared/staticSite.test.ts` | modify | Combined static route/menu tests. |
| `test/unit/dbt/sqlRefs.test.ts` | modify | Literal source parsing and exclusions. |
| `test/unit/diagram/graph.test.ts` | modify | Combined node identity and source-lineage tests. |
| `test/unit/diagram/flow.test.ts` | modify | Use namespaced graph inputs and expected node/edge IDs. |
| `test/unit/diagram/layout.test.ts` | modify | Use namespaced graph inputs and expected placements. |
| `test/unit/diagram/layoutFile.test.ts` | modify | Namespaced layout parsing and serialization tests, including rejection of the old format. |
| `test/unit/webview/lineage.test.ts` | modify | Source upstream expansion tests. |
| `test/unit/webview/panelKey.test.ts` | modify | Combined entity-file source key/title tests. |
| `test/unit/webview/openSource.test.ts` | modify | Namespaced model/source reveal tests. |
| `test/unit/webview/layoutMessages.test.ts` | modify | Mode-free combined layout open/save tests. |
| `test/unit/webview/history.test.ts` | modify | Use mode-free version-2 layout fixtures. |
| `test/unit/webview/layoutHistory.test.ts` | modify | Use mode-free version-2 layout fixtures. |
| `test/unit/fixture.test.ts` | modify | Combined fixture graph, namespace and source-lineage assertions. |
| `test/unit/static/site.test.ts` | modify | Combined static graph/layout/current-SQL lineage tests. |
| `test/unit/static/project.test.ts` | modify | Static package-name and SQL discovery tests. |
| `test/integration/suite/extension.test.ts` | modify | Both commands, scoping and combined persistence coverage. |
| `fixtures/sample-dbt/models/payments.yml` | create | Model metadata for source-lineage manual testing. |
| `fixtures/sample-dbt/models/payments.sql` | create | `source('finops', 'transactions')` fixture dependency. |
| `fixtures/sample-dbt/models/sources/finops.yml` | modify | Add the transactions source table referenced by payments.sql. |
| `fixtures/sample-dbt/diagrams/orders.dbtiagram.yml` | modify | Convert the committed sample layout to namespaced version 2. |
| `fixtures/sample-dbt/diagrams/customers.dbtiagram.yml` | modify | Convert the committed sample layout to namespaced version 2. |
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

export type DiagramEntityKind = 'model' | 'source' | 'external';

// src/shared/entityEdit.ts (shared — must not import `vscode`)
export type RoutedDiagramEdit =
  | { domain: 'model'; edit: ModelEdit }
  | { domain: 'source'; edit: ModelEdit };
export function routeDiagramEdit(edit: ModelEdit): RoutedDiagramEdit;

// changed src/shared/diagramMode.ts (shared — must not import `vscode`)
export type DiagramDomain = 'model' | 'source';
export interface DiagramDomainLabels {
  fileSection: 'Model YAML files' | 'Source YAML files';
  entitySection: 'Models' | 'Sources';
  entitySingular: 'model' | 'source';
  sourceFile: 'model.yml' | 'source yml';
}
export function diagramDomainLabels(domain: DiagramDomain): DiagramDomainLabels;

// changed src/shared/matrixColumns.ts (shared — must not import `vscode`)
export function defaultMatrixColumns(
  metaKeys: readonly string[],
  scope: MatrixScope,
  domain?: DiagramDomain,
): MatrixColumnDef[];

// changed src/vscode/modelWatcher.ts (vscode-facing)
export interface ModelWatcherCallbacks {
  getGlobs: () => readonly string[];
  getEnabled: () => boolean;
  onDocumentChanged: (uri: vscode.Uri, content: string) => void;
  onFilesCreated: (uris: vscode.Uri[]) => void;
  onFilesDeleted: (uris: vscode.Uri[]) => void;
  onFilesRenamed: (oldUri: vscode.Uri, newUri: vscode.Uri) => void;
  onConfigurationChanged: () => void;
}
export function registerModelWatcher(callbacks: ModelWatcherCallbacks): vscode.Disposable[];

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
// filter:scope carries both `domain: DiagramDomain` and `uri: string`.
// diagram:edit continues carrying ModelEdit; every entity-bearing field contains a DiagramEntityId.
// SourceImportReport gains `importedEntityIds: DiagramEntityId[]`; `importedModels`
// remains the concise names used by the completion dialog.

// changed src/diagram/graph.ts (pure — must not import `vscode`)
export interface DiagramModelInput { packageName: string; model: ModelDefinition }
export function buildDiagram(
  models: readonly DiagramModelInput[],
  sources: readonly SourceDefinition[],
  lineageEdges?: readonly LineageEdge[],
): DiagramGraph;
// TableNode gains `entityKind: DiagramEntityKind`; buildSourceDiagram is removed.

// changed src/shared/filter.ts (shared — must not import `vscode`)
export interface DomainSelection {
  files: Set<string>;
  entities: Set<string>;
}
export function scopeSelectionToFile(
  files: readonly DiagramEntityFile[],
  domain: DiagramDomain,
  uri: string,
): DomainSelection | null;

// changed src/diagram/layoutFile.ts (pure)
export const LAYOUT_VERSION = 2;
// DiagramLayout no longer has `mode`; every DiagramLayoutTable.name must parse as DiagramEntityId.
export function buildLayout(
  name: string,
  visible: readonly { name: string; x: number; y: number }[],
  notes?: readonly DiagramNote[],
  columnDisplay?: { default: ColumnDisplayMode; overrides: ReadonlyMap<string, ColumnDisplayMode> },
  groups?: readonly DiagramGroup[],
): DiagramLayout;
export function parseDiagramLayout(text: string, fallbackName: string): DiagramLayout;

// changed src/webview/lineage.ts (pure — must not import `vscode`)
export interface LineageHost {
  readModelSql(modelId: string): Promise<string | null>;
  allProjectModelIds(): Promise<string[]>;
  resolveModelNode(packageName: string, modelName: string): Promise<TableNode>;
  resolveSourceNode(sourceName: string, tableName: string): Promise<TableNode>;
  progress(value: LineageProgress): void;
  isCancelled(): boolean;
}

// changed src/diagram/lineage.ts (pure — must not import `vscode`)
export type SqlLineageTarget =
  | { kind: 'model'; packageName: string; name: string }
  | { kind: 'source'; sourceName: string; tableName: string };
export function sqlLineageTargets(
  packageName: string,
  text: string,
): SqlLineageTarget[];

// changed src/webview/layoutMessages.ts (pure — must not import `vscode`)
export interface LayoutHost {
  postMessage(message: MessageToWebview): void;
  getActiveLayout(): ActiveLayout | undefined;
  setActiveLayout(active: ActiveLayout | undefined): void;
  readLayout(fsPath: string): Promise<DiagramLayout>;
  writeLayout(fsPath: string, layout: DiagramLayout): Promise<void>;
  promptForLayoutPath(defaultName: string): Promise<string | undefined>;
  knownEntityNames(): Set<string>;
  onLayoutOpened(name: string): void;
  onLayoutSaved(fsPath: string, name: string): void;
  republish(): void;
  setPendingLayout(layout: DiagramLayout, dirty: boolean): void;
  getPendingLayout(): { layout: DiagramLayout; dirty: boolean } | undefined;
  onLayoutReplaced(): void;
}

// changed src/webview/panelKey.ts (pure)
export type DiagramSource =
  | { kind: 'entityFile'; domain: 'model' | 'source'; fsPath: string }
  | { kind: 'layout'; fsPath: string }
  | { kind: 'adhoc'; id: string };

// changed src/webview/openSource.ts (pure — must not import `vscode`)
export interface OpenSourceRequest { entity: DiagramEntityId; column?: string }
export async function openDiagramSource(host: OpenSourceHost, request: OpenSourceRequest): Promise<void>;

// changed webview-ui/hooks/useDiagramFilter.ts (webview)
export interface DiagramFilterState {
  filesByDomain: Readonly<Record<DiagramDomain, DiagramEntityFile[]>>;
  selectedFilesByDomain: Readonly<Record<DiagramDomain, Set<string>>>;
  selectedEntitiesByDomain: Readonly<Record<DiagramDomain, Set<string>>>;
  availableEntitiesByDomain: Readonly<Record<DiagramDomain, string[]>>;
  visibleEntities: Set<string>;
  filterTick: number;
  applyEntityFiles(files: DiagramEntityFile[]): void;
  applyScope(domain: DiagramDomain, uri: string): void;
  applyLayoutTables(ids: string[]): void;
  addEntities(ids: readonly string[]): void;
  removeEntities(ids: readonly string[]): void;
  showImportedModels(ids: readonly string[], destinationUri: string): void;
  initialCapNotice: InitialCapNotice | null;
  dismissInitialCapNotice(): void;
  // Domain-indexed search/toggle/all/none callbacks are also exposed for FilterSidebar.
}

// changed webview-ui/hooks/useLayoutPersistence.ts (webview)
export function useLayoutPersistence(
  notes?: readonly DiagramNote[],
  groups?: PersistedGroupsState,
  columnDisplay?: { defaultMode: ColumnDisplayMode; overrides: Map<string, ColumnDisplayMode> },
): LayoutPersistenceState;

// changed webview-ui/hooks/useDraftForeignKeys.ts (webview)
export function useDraftForeignKeys(
  onEdit: (edit: ModelEdit) => void,
  entityKind: (id: string) => DiagramEntityKind | null,
): DraftForeignKeysState;

// changed webview-ui/hooks/useSourceImport.ts (webview)
export function useSourceImport(
  showImportedModels: (ids: readonly string[], destinationUri: string) => void,
): SourceImportState;

// changed src/shared/staticSite.ts (shared — must not import `vscode`)
export type StaticDiagramRoute = 'explore' | `diagram/${string}`;
export interface StaticSiteData {
  schemaVersion: typeof STATIC_SITE_SCHEMA_VERSION;
  initialSelectionLimit: number;
  universe?: StaticDiagramUniverse;
  layouts: StaticLayoutEntry[];
}
// STATIC_SITE_SCHEMA_VERSION becomes 2.

// changed src/static/project.ts (Node-facing)
export interface StaticProjectInputs {
  projectRoot: string;
  packageName: string;
  yamlFiles: StaticInputFile[];
  sqlFiles: StaticInputFile[];
  layoutFiles: StaticInputFile[];
}
export async function loadStaticProjectInputs(options: StaticGeneratorOptions): Promise<StaticProjectInputs>;

// changed src/static/generate.ts (Node-facing)
export interface GenerateStaticSiteResult {
  indexPath: string;
  explorerCount: 0 | 1;
  layoutCount: number;
  warnings: StaticSiteWarning[];
}
```

### Behavior notes

- Visible labels remain concise; identity always uses the namespaced ID. A model
  and source with the same visible name therefore never collide.
- Both stores load for every panel. Opening from a file applies initial scope
  only to that domain: the invoked file is checked and the other domain starts
  unchecked. Palette/layout opens follow their existing all/layout behavior.
- The sidebar has four lists under two domain groups: Model YAML files / Models,
  and Source YAML files / Sources. Search and All/None controls are independent.
- Model IDs are `model:<dbt-project-name>:<model-name>`. Source IDs are
  `source:<source-name>:<table-name>`. Colons are separators; empty components
  and components containing `:` are invalid. Package-qualified refs resolve to
  their package ID; unresolved refs use `external:<package>:<model>`.
- A model file is assigned the nearest containing `dbt_project.yml` package.
  If none exists, package `unknown` is used. Unqualified `ref()` calls resolve
  in the child model's package. Editing and FK creation are allowed only among
  models in the same package; attempts across packages use the same
  `Cannot edit across diagram entity domains` error because the current dbt edit
  engine has no cross-package write contract.
- Edit messages retain the existing `ModelEdit` shape but carry namespaced IDs
  in `model`, `sourceModel`, `destinationModel`, `target` and `fk.target`.
  `routeDiagramEdit` converts one-domain edits to the raw identities expected by
  `applyEdit`/`applySourceEdit`. External edits and model/source-crossing FK or
  column-transfer edits throw `Error('Cannot edit across diagram entity domains')`.
- FK target pickers list only entities in the selected card's own domain.
- Source cards retain all current source-mode behavior, including read-only
  structural fields and forced-virtual constraints; model cards retain model
  behavior. External cards retain spec 52 read-only behavior.
- `findSqlSources` uses the same lexical exclusions and formatting rules as
  `findSqlRefs`, and accepts exactly two non-empty literal string arguments.
- Layout parsing accepts version 2 namespaced IDs only. A version-1 file is
  rejected with message `Unsupported diagram layout version 1`; an old
  mode-bearing version-2 file or any unnamespaced table entry is rejected with
  message `Diagram layout version 2 requires namespaced table IDs and no mode`;
  it is never migrated or guessed.
- Layout version 2 has no `mode` key. Groups and per-table column-display
  overrides use the same namespaced IDs as `tables`.
- Layout serialization writes version 2 and namespaced IDs only. Positions,
  notes, groups and column display settings otherwise retain their semantics.
- Layouts never serialize lineage edges. After tables are restored, current SQL
  parsing rebuilds valid `ref()` and `source()` arrows; missing relationships
  remove only arrows and never remove restored cards.
- Static generation emits one combined explorer. It reads the root
  `dbt_project.yml` package name and current model SQL, and reconstructs literal
  `ref()` and `source()` arrows by the same rules as the extension host.
- The static payload schema version becomes 2 and routes use `#/explore` plus
  saved-layout routes. Schema-version-1 generated output is not read by the new
  viewer and requires no compatibility path.
- Existing command IDs remain unchanged. Entity-file panel keys include the
  invoking domain, so opening the same physical YAML through different commands
  cannot alias accidentally; both panel instances still contain combined data.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/entityId.test.ts` | `keeps colliding entities distinct` | model/source/external named transactions | three distinct literal IDs |
| `test/unit/shared/entityId.test.ts` | `parses each namespaced entity kind` | one model, source and external literal ID | corresponding three parsed discriminated values |
| `test/unit/shared/entityId.test.ts` | `rejects ambiguous components` | empty or colon-containing identity components | constructors throw and parser returns `null` |
| `test/unit/shared/entityEdit.test.ts` | `routes model and source edits` | namespaced model description edit and source column description edit | raw model/source IDs plus corresponding domain |
| `test/unit/shared/entityEdit.test.ts` | `rejects cross-domain edits` | model-to-source FK and external edit | `Cannot edit across diagram entity domains` |
| `test/unit/dbt/sqlRefs.test.ts` | `finds a literal source call` | `{{ source('finops', 'transactions') }}` | `{source:'finops',table:'transactions'}` |
| `test/unit/dbt/sqlRefs.test.ts` | `ignores source calls in comments and SQL strings` | excluded forms plus one executable call | one occurrence |
| `test/unit/shared/filter.test.ts` | `filters model and source domains independently` | one selected model file and one unselected source file | model visible, source hidden |
| `test/unit/shared/filter.test.ts` | `scopes only the invoking domain` | model-file scope with both domains loaded | invoking model file selected; every source file unselected |
| `test/unit/diagram/graph.test.ts` | `builds a combined collision-safe graph` | colliding model/source names | both namespaced nodes present |
| `test/unit/webview/lineage.test.ts` | `adds source upstream lineage` | payments SQL source call | edge `source:finops:transactions -> model:sample:payments` |
| `test/unit/diagram/layoutFile.test.ts` | `round-trips namespaced model and source tables` | version-2 model/source entries with positions | identical IDs and positions after serialization and parse |
| `test/unit/diagram/layoutFile.test.ts` | `rejects a version-1 layout` | version-1 layout text | `DiagramLayoutParseError('Unsupported diagram layout version 1')` |
| `test/unit/diagram/layoutFile.test.ts` | `rejects the old mode-bearing version-2 format` | version 2, `mode: model`, raw table name | `Diagram layout version 2 requires namespaced table IDs and no mode` |
| `test/unit/diagram/layoutFile.test.ts` | `serializes tables without lineage edges` | combined graph with model/source lineage plus table positions | serialized YAML contains table entries and no lineage key |
| `test/unit/webview/lineage.test.ts` | `missing source relationship keeps layout cards` | restored source/model IDs and model SQL without the prior source call | both displayed IDs remain; source lineage edges `[]` |
| `test/unit/webview/openSource.test.ts` | `reveals namespaced source and model entities` | one ID of each domain | matching locator and defining file used |
| `test/unit/webview/layoutMessages.test.ts` | `opens a combined layout without a mode check` | namespaced model/source entries | one `layout:apply` with both entries and no error |
| `test/unit/static/site.test.ts` | `builds one combined static universe with current source lineage` | model SQL calling a fixture source | namespaced model/source nodes and source-to-model lineage edge |
| `test/unit/static/project.test.ts` | `loads package identity and model SQL` | temp project with dbt_project.yml and models/payments.sql | `packageName: sample` and SQL input `models/payments.sql` |
| `test/unit/fixture.test.ts` | `loads combined fixture source lineage` | sample project payments SQL and finops source | `source:finops:transactions -> model:sample:payments` |
| `test/integration/suite/extension.test.ts` | `both commands open combined panels` | invoke model then source commands | model-file and source-file titled diagram tabs both open successfully |

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
