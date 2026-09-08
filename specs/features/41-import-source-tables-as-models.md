---
id: 41
title: Import source tables as models
status: implemented
priority: high
created: 2026-09-08
owner: unassigned
depends_on: [29, 40]
---

# Import source tables as models

## Summary

As a dbt developer starting models from documented sources, I want to select one
or more tables from a source YAML file and import them into an existing model
YAML file, so that I can begin refining model definitions without manually
copying table metadata, columns, and diagram-only relationships. Imported models
receive collision-safe `_from_source` names, retain table/column properties and
keys as real dbt constraints, appear immediately in the model diagram, and produce a completion
report that identifies relationships whose targets are not present as models.

## Background

Source mode (spec 40) already parses source files and represents source tables,
columns, metadata, and virtual PK/FK definitions. It deliberately excluded
creating models from source tables. The common development workflow is now to
promote selected source tables into model definitions and then edit those models.

## Scope

**In scope**

- A model-mode-only toolbar button and empty-canvas context-menu item named
  **Import models from source yml**.
- A three-step VS Code selection flow: choose one discovered source YAML file,
  choose one or more tables from that file, then choose one discovered model YAML
  destination file.
- Importing selected source tables by appending model entries to the selected
  destination file and immediately showing them in the current model diagram.
- Naming the first available imported model `<table>_from_source`; when occupied,
  trying `<table>_from_source_1`, then `_2`, and so on until globally unique.
- Copying every table-level and column-level property represented in the source
  YAML, including descriptions, data types, tests, config, metadata, and unknown
  keys. Source-block and root properties, including source name, database, and
  schema, are not copied.
- Converting source virtual PKs and virtual FKs into real model constraints by
  default. A real imported PK also receives the model-level
  `dbt_utils.unique_combination_of_columns` test and column-level `not_null`
  tests; developers may explicitly convert imported keys to virtual afterward.
- Adding import provenance metadata: model `config.meta.source_table_name` stores
  the original source table name; every imported column stores its original name
  as `config.meta.source_name` and, when present, its source data type as
  `config.meta.source_datatype`.
- Prefixing every source column metadata key with `source_` during import.
  Existing keys that already begin with `source_` remain unchanged rather than
  receiving a second prefix. For example, `max_length` becomes
  `source_max_length`, `owner` becomes `source_owner`, and `source_system`
  remains `source_system`. Original unprefixed keys are not retained.
- Rewriting each imported virtual FK target from
  `source('<source>', '<table>')` to `ref('<imported-model-name>')`. If its exact
  target table is selected in the same operation, its allocated collision-safe
  name is used; otherwise the unsuffixed `<target-table>_from_source` name is
  used.
- A post-import report with the total successfully imported models, their final
  names, and every imported FK whose rewritten target does not exist after the
  import.
- Surgical write-back of the destination model YAML so its comments, order,
  unknown keys, and existing models remain intact.

**Out of scope**

- Creating a new model YAML file or importing into a source YAML file.
- Importing from more than one source YAML file in one operation.
- Importing source-level/root-level properties, or generating `.sql` files.
- Guessing, importing, or repairing an unselected FK target automatically.
- Automatically retaining imported keys as virtual; virtual storage is an
  explicit post-import developer choice.
- Editing or deleting the source YAML during import.
- Undoing an import as one atomic operation, or remembering previous picker
  selections.

## Scenarios

### Offer import only in model mode

```
Given a model-mode diagram is open
Then its top-left toolbar has an "Import models from source yml" button
And right-clicking empty canvas offers "Import models from source yml"
Given a source-mode diagram is open
Then neither import entry point is shown
```

### Select a source file, tables, and destination

```
Given the workspace contains valid source YAML and model YAML files
When the user starts "Import models from source yml"
Then the tool first lists the available source YAML files
When the user chooses one source YAML file
Then the tool lists only the qualified tables declared in that file with multi-select enabled
And at least one table must be selected to continue
When the user selects tables and confirms
Then the tool lists the available model YAML destination files
```

### Cancel without changing files

```
Given the import selection flow is open
When the user cancels any picker
Then no YAML file is written
And no import report is shown
```

### Import source properties but not source-level properties

```
Given source finops has database RAW, schema FINOPS, and table costs
And costs has description, identifier, tags, config, columns, column metadata, and unknown column keys
When costs is imported into models/staging.yml
Then staging.yml gains a model named costs_from_source
And the table description, identifier, tags, config, columns, column metadata, and unknown column keys are retained
And source name finops, database RAW, schema FINOPS, the sources key, and the tables key are not added to that model
And every pre-existing model and unrelated YAML detail in staging.yml is retained
```

### Add source provenance and rename profiling metadata

```
Given source table costs has column workspace_id with data type bigint
And its column config.meta contains max_length, sample_values, filled_percentage, owner, and source_system
When costs is imported
Then the model config.meta.source_table_name is costs
And workspace_id config.meta.source_name is workspace_id
And workspace_id config.meta.source_datatype is bigint
And max_length, sample_values, filled_percentage, and owner are stored respectively as source_max_length, source_sample_values, source_filled_percentage, and source_owner
And source_system remains source_system without a second prefix
And every original unprefixed metadata key is absent
```

### Allocate collision-safe model names

```
Given the workspace already contains models costs_from_source and costs_from_source_1
When source table costs is imported
Then its final model name is costs_from_source_2
Given none of those names exists
When source table costs is imported
Then its final model name is costs_from_source
```

### Import a source primary key as real

```
Given source table costs has virtual primary key [id]
When costs is imported
Then costs_from_source has a real primary-key constraint with columns [id]
And column id has a not_null data test
And the model has a dbt_utils.unique_combination_of_columns test for [id]
And no virtual primary key remains
```

### Rewrite an FK between tables imported together

```
Given finops.costs has a virtual FK to source('finops', 'workspaces')
And both finops.costs and finops.workspaces are selected
And workspaces_from_source is occupied before import
When both tables are imported
Then the imported costs model's FK is a real foreign-key constraint
And its to value is ref('workspaces_from_source_1')
And the report does not list that FK as broken
```

### Keep and report an FK to an unselected table

```
Given finops.costs has a virtual FK from workspace_id to source('finops', 'workspaces').id
And only finops.costs is selected
And no model named workspaces_from_source exists after import
When the import completes
Then costs_from_source keeps the FK as a real constraint with to: ref('workspaces_from_source')
And the model is still imported successfully
And the report lists "costs_from_source.workspace_id -> ref('workspaces_from_source').id"
```

### Do not report a rewritten target that already exists

```
Given only finops.costs is selected
And its source FK targets finops.workspaces
And model workspaces_from_source already exists
When the import completes
Then costs_from_source uses ref('workspaces_from_source')
And that FK is not listed as broken
```

### Report and show a successful import

```
Given two source tables are selected for import
When both are appended successfully
Then both final model names are checked and visible in the current diagram
And the destination model YAML file is checked in the filter
And a report says "Imported 2 models successfully."
And the report lists both final model names
And the report contains either "No broken foreign keys." or a list headed "Broken foreign keys"
```

### Handle unavailable import inputs

```
Given no valid source YAML files are available
When the user starts the import
Then the tool shows "No source yml files are available to import from."
And no file is written
Given source YAML files exist but no valid model YAML destination exists
When the user reaches destination selection
Then the tool shows "No model yml files are available as an import destination."
And no file is written
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/types.ts` | modify | Add column-level unknown-key storage so imported source column properties survive model serialization. |
| `src/dbt/parse.ts` | modify | Parse unknown model-column keys into the new typed storage. |
| `src/dbt/sourceParse.ts` | modify | Parse unknown source-column keys needed by import. |
| `src/dbt/merge/shape.ts` | modify | Emit preserved unknown column keys before modeled keys. |
| `src/dbt/importSource.ts` | modify | Convert imported source virtual keys to real PK/FK constraints and map table/column import provenance metadata while retaining naming, FK rewriting, append, and broken-FK reporting. |
| `src/shared/protocol.ts` | modify | Add the import request and import-result report messages. |
| `src/vscode/sourceImportPicker.ts` | create | Own the VS Code source-file, multi-table, and destination-file Quick Pick sequence plus unavailable-input warnings. |
| `src/webview/sourceImport.ts` | create | Testable host orchestration: load candidates, prompt, transform, persist, and return the result. |
| `src/webview/panel.ts` | modify | Handle model-mode import requests, refresh the model store, publish the updated diagram, and send the result. |
| `webview-ui/DiagramCanvas.tsx` | modify | Add the optional model-mode import toolbar action. |
| `webview-ui/App.tsx` | modify | Expose model-only toolbar/context-menu entry points, reveal imported models, and own report state. |
| `webview-ui/ImportReport.tsx` | create | Render the completion report with imported names and broken FK rows. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch import-result messages. |
| `webview-ui/hooks/useSourceImport.ts` | create | Own import request/report state and apply successful imports to the diagram filter. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Additively check imported model names and their explicit destination file. |
| `webview-ui/icons.ts` | modify | Re-export the import icon used by both entry points. |
| `webview-ui/styles.css` | modify | Style the import report overlay and lists. |
| `test/unit/dbt/importSource.test.ts` | create | Unit-test conversion, naming, property retention, virtual keys, rewrites, and broken-FK reporting. |
| `test/unit/dbt/parse.test.ts` | modify | Cover model-column unknown-key parsing and round-trip behavior. |
| `test/unit/dbt/sourceParse.test.ts` | modify | Cover source-column unknown-key parsing. |
| `test/unit/webview/sourceImport.test.ts` | create | Unit-test orchestration order, cancellation, warnings, write, and result. |
| `specs/ARCHITECTURE.md` | modify | Add the two new modules/component and update changed responsibilities/exports. |
| `specs/README.md` | modify | Add feature 41 as Draft, then track its lifecycle status. |

### Signatures

```ts
// src/dbt/types.ts (pure — changed; must not import `vscode`)
export interface ModelColumn {
  // existing fields unchanged
  extra?: Record<string, unknown>;
}
```

```ts
// src/dbt/importSource.ts (pure — must not import `vscode`)
import type { ModelDefinition, ModelYmlFile } from './types';
import type { QualifiedSourceTable } from './sourceTypes';

export interface BrokenImportedForeignKey {
  model: string;
  columns: string[];
  target: string;
  toColumns: string[];
  display: string;
}
export interface SourceImportResult {
  destination: ModelYmlFile;
  importedModels: string[];
  brokenForeignKeys: BrokenImportedForeignKey[];
}
export function nextImportedModelName(tableName: string, occupied: ReadonlySet<string>): string;
export function importSourceTables(
  destination: ModelYmlFile,
  selected: readonly QualifiedSourceTable[],
  workspaceModels: readonly ModelDefinition[],
): SourceImportResult;
```

```ts
// src/shared/protocol.ts (shared — changed; must not import `vscode`)
import type { BrokenImportedForeignKey } from '../dbt/importSource';
export interface SourceImportReport {
  destinationUri: string;
  importedModels: string[];
  brokenForeignKeys: BrokenImportedForeignKey[];
}
// Add to MessageToExtension:
// { type: 'sourceImport:start' }
// Add to MessageToWebview:
// { type: 'sourceImport:result'; report: SourceImportReport }
```

```ts
// src/vscode/sourceImportPicker.ts (vscode-facing)
import type { DiagramEntityFile } from '../shared/protocol';
import type { SourceImportSelection } from '../webview/sourceImport';
export async function pickSourceImport(
  sourceFiles: readonly DiagramEntityFile[],
  modelFiles: readonly DiagramEntityFile[],
): Promise<SourceImportSelection | undefined>;
```

```ts
// src/webview/sourceImport.ts (pure host orchestration — must not import `vscode`)
import type { ModelDefinition, ModelYmlFile } from '../dbt/types';
import type { SourceYmlFile } from '../dbt/sourceTypes';
import type { DiagramEntityFile, SourceImportReport } from '../shared/protocol';

export interface SourceImportCandidate<TFile> {
  uri: string;
  label: string;
  file: TFile;
}
export interface SourceImportSelection {
  sourceUri: string;
  tableIds: string[];
  destinationUri: string;
}
export interface SourceImportHost {
  loadSources(): Promise<readonly SourceImportCandidate<SourceYmlFile>[]>;
  modelFiles(): readonly SourceImportCandidate<ModelYmlFile>[];
  workspaceModels(): readonly ModelDefinition[];
  pick(sourceFiles: readonly DiagramEntityFile[], modelFiles: readonly DiagramEntityFile[]): Promise<SourceImportSelection | undefined>;
  writeDestination(uri: string, file: ModelYmlFile): Promise<void>;
}
export async function runSourceImport(host: SourceImportHost): Promise<SourceImportReport | undefined>;
```

```ts
// webview-ui/ImportReport.tsx (webview)
export interface ImportReportProps {
  report: SourceImportReport;
  onClose: () => void;
}
export function ImportReport(props: ImportReportProps): JSX.Element;
```

```ts
// webview-ui/hooks/useSourceImport.ts (webview)
import type { SourceImportReport } from '../../src/shared/protocol';
export interface SourceImportState {
  report: SourceImportReport | null;
  start: () => void;
  applyResult: (report: SourceImportReport) => void;
  dismiss: () => void;
}
export function useSourceImport(
  showImportedModels: (names: readonly string[], destinationUri: string) => void,
): SourceImportState;
```

```ts
// webview-ui/hooks/useDiagramFilter.ts (webview — changed)
export interface DiagramFilterState {
  // existing members unchanged
  showImportedModels: (names: readonly string[], destinationUri: string) => void;
}
```

`DiagramCanvasProps` adds optional `onImportSourceModels?: () => void`.
`HostMessageHandlers` adds
`onSourceImportResult: (report: SourceImportReport) => void`.

### Behavior notes

1. **Availability and labels.** Both entry points use the exact label
   `Import models from source yml` and the same import icon. The toolbar button
   is in the top-left group. The empty-canvas menu places the item after
   `Add note here`. `App` passes neither entry point in source mode.
2. **Picker sequence.** The host performs one single-select Quick Pick with
   place holder `Select a source yml file`, one `canPickMany` Quick Pick with
   place holder `Select one or more source tables`, and one single-select Quick
   Pick with place holder `Select a destination model yml file`. File labels use
   the existing disambiguated workspace labels; table labels are qualified
   `source_name.table_name` IDs in source-file order. The table picker cannot
   confirm an empty selection. Escape/cancel at any step returns `undefined`
   without writing or reporting.
3. **Fresh candidates.** Starting an import scans the configured source glob at
   that moment. Only successfully parsed source records are offered. Destination
   choices come from the model panel's current last-good model store. A source
   load failure is omitted from choices and remains governed by existing parse
   error behavior; this feature adds no partial-file import.
4. **Unavailable inputs.** Before the first picker, an empty source list calls
   `showWarningMessage` with exactly
   `No source yml files are available to import from.` An empty destination list
   after table selection calls it with exactly
   `No model yml files are available as an import destination.` These warnings
   are implemented by the VS Code picker adapter; no report is sent.
5. **Selection identity and order.** Selected table IDs are resolved only inside
   the chosen source file. Unknown/stale IDs abort before write with
   `Source table "<id>" is no longer available.` Imported models are appended in
   their original source-file order, regardless of Quick Pick return order.
6. **Name allocation.** Occupied names initially contain every model name in the
   model-mode workspace, not just the destination. For each selected table in
   source order, try `<table>_from_source`, then append `_1`, `_2`, ... to that
   exact base. Each allocation is immediately added to the occupied set. Matching
   is exact and case-sensitive.
7. **Property boundary.** Conversion starts from the selected table only. It
   deep-copies its `description`, `config`, `columns`, and `extra`; source-block
   `name`, `description`, `extra` (`database`, `schema`, etc.), root `version`,
   root `extra`, `sources`, and `tables` wrappers are discarded. Table unknown
   keys become model `extra`; column unknown keys become column `extra`. Modeled
   values win if an `extra` mapping contains the same key. Inputs are never
   mutated and copied nested arrays/maps do not alias the parsed source object.
8. **Imported keys are real by default.** Read the source table's virtual key
    block, remove that virtual block from the imported model, and convert its PK
    and FKs to real `constraints`. A non-empty PK also creates/updates the
    model-level `dbt_utils.unique_combination_of_columns` test and adds one
    column-level `not_null` data test to every PK column, using the existing real
    PK synchronization semantics. Each valid source FK becomes a real
    `foreign_key` constraint after target rewriting. No imported PK/FK remains
    virtual; the developer can explicitly toggle it to virtual after import.
    Other copied keys are not interpreted or normalized.
9. **Import metadata.** After deep-copying the source table, merge
   `source_table_name: <original table name>` into model `config.meta`; this
   modeled import value wins over a source value with the same key. For each
   column, merge `source_name: <original column name>` and, only when `dataType`
   exists, `source_datatype: <original data type>` into column `config.meta`.
   Prefix every existing column-meta key that does not already begin with
   `source_`; keys already beginning with `source_` remain unchanged. Thus
   `max_length` becomes `source_max_length`, while `source_system` remains
   `source_system`. Prefix-derived values and provenance values win on
   destination-key collisions. Do not emit `source_datatype` for a column with
   no source data type. All metadata objects are deep-copied.
10. **FK rewrite map.** Before converting models, allocate all selected model
   names and map each selected qualified source ID to its final name. A valid
   source FK targeting an ID in that map uses that final name. Any other valid
   source target uses `<target table name>_from_source` with no numeric suffix.
   The source name is deliberately dropped in the latter case. Invalid/non-
   canonical `to` strings are retained unchanged and are not included in the
   broken-target report because no model target can be derived safely.
11. **Broken definition and display.** After appending, build the available-name
    set from every pre-existing workspace model plus every imported model. A
    rewritten FK is broken exactly when its `ref(...)` target is absent from that
    set. Report only FKs belonging to imported models, in imported-model/FK order.
    `display` is exactly
    `<model>.<comma-separated columns> -> ref('<target>').<comma-separated to_columns>`;
    when either column list is empty, omit only that side's dot and column text.
12. **Persistence and model store.** Exactly one destination write occurs after
    successful conversion, through `writeModelYmlFile`, so merge spec 29 appends
    the new model nodes without rewriting existing nodes. After the write, the
    panel upserts the returned destination into its model store, publishes
    `diagram:update`, then sends `sourceImport:result`; no source store/file is
    mutated.
13. **Visibility.** On `sourceImport:result`, `showImportedModels` unions the
    report names into selected models and the explicit destination URI into
    selected files, increments `filterTick`, and changes no other selection.
    Thus imported cards appear even when the destination or new names were
    filtered out before import.
14. **Report UI.** The modal title is `Source import complete`. Its summary is
    exactly `Imported <N> model(s) successfully.` with singular grammar. It lists
    every final imported name. With no broken relationships it shows
    `No broken foreign keys.` Otherwise it shows heading
    `Broken foreign keys (<N>)` and every literal `display` row. A **Close**
    button, Escape, or backdrop click dismisses it. A later import replaces the
    previous report.
15. **Mode enforcement.** The host ignores `sourceImport:start` unless its
    immutable panel mode is `model`; source mode cannot trigger the flow even if
    a crafted webview message is received.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/importSource.test.ts` | `uses the default imported name` | table `costs`, empty workspace | imported name `costs_from_source` |
| `test/unit/dbt/importSource.test.ts` | `increments an occupied imported name` | occupied `costs_from_source`, `costs_from_source_1` | imported name `costs_from_source_2` |
| `test/unit/dbt/importSource.test.ts` | `copies table and column properties but drops source properties` | source with database/schema plus table description/config/identifier/tags and column meta/unknown key | imported model has every listed table/column value; no database/schema/source wrapper value |
| `test/unit/dbt/importSource.test.ts` | `deep copies imported properties` | mutate nested imported config after conversion | original source nested value remains unchanged |
| `test/unit/dbt/importSource.test.ts` | `adds source provenance and prefixes all column metadata` | table `costs`; column `workspace_id bigint`; meta with `max_length`, `sample_values`, `filled_percentage`, `owner`, `source_system`, and conflicting destination keys | model meta contains `source_table_name: costs`; column meta contains provenance, all formerly unprefixed keys under `source_`, unchanged `source_system`, no original unprefixed keys, and generated values win collisions |
| `test/unit/dbt/importSource.test.ts` | `omits source datatype metadata when absent` | source column without `data_type` | column meta has `source_name` and no `source_datatype` |
| `test/unit/dbt/importSource.test.ts` | `imports a source primary key as real with tests` | virtual PK `[id]` | real PK constraint, unique-combination test, and column `not_null` exist; virtual PK is absent |
| `test/unit/dbt/importSource.test.ts` | `rewrites an FK to the selected target's allocated name` | costs/workspaces selected; `workspaces_from_source` occupied | real FK constraint `to` is `ref('workspaces_from_source_1')`; virtual FK absent; broken list `[]` |
| `test/unit/dbt/importSource.test.ts` | `keeps and reports an unselected FK` | only costs selected; FK `workspace_id -> source('finops','workspaces').id`; target absent | `to` is `ref('workspaces_from_source')`; display `costs_from_source.workspace_id -> ref('workspaces_from_source').id` |
| `test/unit/dbt/importSource.test.ts` | `does not report an existing unselected target` | same FK plus existing `workspaces_from_source` model | broken list `[]` |
| `test/unit/dbt/importSource.test.ts` | `retains an invalid FK expression without reporting it` | virtual FK `to: custom_target` | unchanged `to`; broken list `[]` |
| `test/unit/dbt/importSource.test.ts` | `appends in source order` | picker IDs reversed for source tables costs/workspaces | destination model suffix is `costs_from_source`, `workspaces_from_source` in source order |
| `test/unit/dbt/parse.test.ts` | `round trips unknown model column keys` | column with `quote: true` and `policy_tags: [x]` | parsed `extra` contains both and serialized YAML retains both |
| `test/unit/dbt/sourceParse.test.ts` | `retains unknown source column keys for import` | source column with `quote: true` | column `extra` equals `{quote:true}` |
| `test/unit/webview/sourceImport.test.ts` | `runs the three-step import and writes once` | two source candidates, chosen IDs, one destination | picker receives source then table/destination metadata; one write; report has two imported names |
| `test/unit/webview/sourceImport.test.ts` | `returns without writing when selection is cancelled` | picker returns `undefined` | writes `0`; result `undefined` |
| `test/unit/webview/sourceImport.test.ts` | `rejects a stale selected table` | picker returns unknown `finops.missing` | rejects with `Source table "finops.missing" is no longer available.`; writes `0` |

The model/source-mode entry visibility, toolbar/context-menu placement, picker
presentation, panel message wiring, imported-card visibility, and report
dismissal are React/VS Code UI behaviors covered by Manual Verify because the
repository has no component test harness and VS Code Quick Picks are not
automatable reliably in the current integration setup. Import conversion and
the complete host workflow through persistence are covered by the pure unit
suites above.

### Verification

- `npm run verify` — strict typecheck and all unit suites must pass.
- `npm test` — unit and VS Code integration suites must pass before commit.
- Manual Verify (F5): open a model diagram; import one and then multiple source
  tables through both entry points; cancel each picker; force name collisions;
  inspect copied unknown metadata and virtual keys; verify selected/unselected FK
  rewrites and report rows; confirm cards become visible; confirm source mode has
  no import action and the source file remains byte-identical.

### Do not touch

- Source-mode edit, serialization, merge, reveal, graph, and layout behavior;
  source parsing changes only add column unknown-key retention.
- Existing model edit semantics, PK/FK creation controls, graph construction,
  relationship routing, layout algorithms, SQL discovery, and fields matrix.
- Source/root property schemas: no attempt to map source database/schema/name or
  source-block metadata into a model.
- Existing model YAML entries during import; only append imported entries through
  the surgical merge path.
- `package.json`, command registrations, settings, fixtures, and layout files.

## Acceptance Criteria

- [ ] Both import entry points appear only in model mode and start the same
      source-file → tables → destination selection flow.
- [ ] One or more selected tables are appended and immediately visible without
      changing the source file or existing destination content.
- [ ] Final names use `_from_source`, then `_from_source_1`, `_2`, etc. against
      all workspace model names.
- [ ] Table/column metadata and unknown keys survive while source/root properties
      are discarded.
- [ ] Imported models and columns record source names/data types, and every
      column metadata key is `source_`-prefixed exactly once.
- [ ] Source virtual PKs/FKs become real constraints by default, imported PKs
      include unique-combination and not-null tests, and valid source targets
      become collision-aware `ref(...)` targets.
- [ ] Unselected targets remain as refs and are reported only when absent after
      import.
- [ ] The completion report gives the successful count, final names, and broken
      FK details.
- [ ] Cancel and unavailable-input paths write nothing.
- [ ] No file outside the Implementation Plan Files table is modified.
- [ ] `npm test` and `npm run typecheck` are green after implementation.
