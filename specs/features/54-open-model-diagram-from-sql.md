---
id: 54
title: Open a single-model diagram from SQL
status: approved
priority: high
created: 2026-09-30
owner: unassigned
depends_on: [14, 23, 38, 39, 52]
---

# Open a single-model diagram from SQL

## Summary

As a dbt developer, I want the diagram button to become available immediately
while startup update checking continues independently, and I want the same
button on a dbt model `.sql` file to open a new diagram containing only that
model, so that updates do not delay navigation and I can move directly from SQL
to a focused diagram.

## Background

The startup update check is already launched without awaiting its result, so it
does not logically block command registration. However, activation currently
starts that check before registering the editor-title context manager, and the
model-YAML button context waits for a workspace-wide discovery/read pass. A
modal update prompt can therefore become visible before the button context has
been established. SQL files currently have no diagram editor-title action.

## Scope

**In scope**

- Register commands and editor-title context tracking before launching the
  non-awaited startup update check.
- Derive button visibility immediately from the active editor path and text,
  without waiting for a workspace-wide YAML scan.
- Show `Open dbt Model Diagram` on `.sql` files matching the SQL glob derived
  from `dbtiagram.modelFileGlob`.
- Resolve the SQL basename to the one model YAML file that declares that model.
- Open a new SQL-keyed diagram through the existing `dbtiagram.openBehavior`
  placement setting and initially show only the resolved model.
- Fail visibly, without opening a diagram, when no YAML definition exists or
  when more than one YAML file declares the model.
- Preserve the current viewport when tables are added to or removed from the
  diagram, whether through the sidebar, canvas actions, or lineage actions.
- Continue to fit the diagram automatically after Auto-layout.

**Out of scope**

- Inferring a model name from SQL contents, dbt artifacts, aliases, or config.
- Choosing among ambiguous YAML definitions.
- Changing update prompts, release lookup, installation, or update frequency.
- Changing SQL lineage expansion, YAML editing, or saved-layout behavior.
- Reusing the diagram tab opened from the corresponding YAML file; a SQL open
  has its own panel identity.
- Changing the initial fit, manual Fit View control, or saved-layout fit.

## Scenarios

### Editor buttons do not wait for the update check

```
Given VS Code activates dbt Diagram with a model YAML or model SQL editor active
When the private-release update check is still running or shows its prompt
Then the matching diagram button context has already been initialized
And command registration and button visibility did not await the update result
```

### Open a focused diagram from model SQL

```
Given models/marts/orders.sql is active
And exactly one discovered model YAML file declares model "orders"
When the user clicks Open dbt Model Diagram
Then a new diagram opens according to dbtiagram.openBehavior
And only model "orders" is shown
And its declaring YAML file is the only checked Model YAML file
And other models in that same YAML file remain unchecked
```

### SQL and YAML opens have independent diagrams

```
Given a diagram opened from the YAML file declaring orders is already open
When the user opens the diagram from orders.sql
Then a separate orders.sql — dbt Diagram panel is created
And reopening orders.sql reveals that SQL-keyed panel without creating a duplicate
```

### Fail when no YAML definition exists

```
Given orphan.sql is active
And no discovered model YAML file declares model "orphan"
When the user clicks Open dbt Model Diagram
Then no diagram opens
And VS Code shows "Cannot open dbt Diagram for \"orphan\": no model YAML definition was found."
```

### Fail when YAML resolution is ambiguous

```
Given duplicate.sql is active
And /repo/a/schema.yml and /repo/b/schema.yml both declare model "duplicate"
When the user clicks Open dbt Model Diagram
Then no diagram opens
And VS Code shows "Cannot open dbt Diagram for \"duplicate\": multiple model YAML files define it: /repo/a/schema.yml, /repo/b/schema.yml."
```

### Adding or removing a table preserves the viewport

```
Given the user has manually panned or zoomed a diagram
When a table is added or removed through the sidebar, canvas, or lineage actions
Then the viewport does not automatically fit or otherwise move
```

### Auto-layout still fits the view

```
Given the user has manually panned or zoomed a diagram
When the user runs Auto-layout
Then the tables are automatically arranged
And the viewport fits the arranged tables after their cards are measured
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Contribute the SQL-open command, activation event and editor-title menu item using the existing diagram icon. |
| `src/extension.ts` | modify | Register SQL-open behavior and editor contexts before launching the non-awaited update check. |
| `src/shared/sqlFiles.ts` | modify | Purely resolve a SQL basename against model declarations and format deterministic resolution errors. |
| `src/shared/protocol.ts` | modify | Allow initial file scope to name the exact entities that should be selected. |
| `src/shared/filter.ts` | modify | Scope a selection to an explicit subset of models in one YAML file. |
| `src/vscode/editorButton.ts` | modify | Add the SQL context key and pure immediate active-editor classification from path, content and configured globs. |
| `src/vscode/editorButtonContext.ts` | modify | Set active-editor contexts immediately and react to active-document text/configuration changes without a workspace scan. |
| `src/vscode/sqlDiagram.ts` | create | Resolve an invoked SQL resource through loaded model YAML and open the SQL-keyed panel or show the exact error. |
| `src/webview/panelKey.ts` | modify | Add SQL-origin panel identity, title and model mode. |
| `src/webview/panel.ts` | modify | Publish SQL-origin initial scope with the declaring YAML URI and only the SQL model name. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Apply an optional exact-entity subset from the initial scope message. |
| `webview-ui/initial-fit.ts` | modify | Add a pure policy limiting change-triggered pending fits to Auto-layout and saved-layout application. |
| `webview-ui/DiagramCanvas.tsx` | modify | Stop requesting pending fits for table additions and filter changes while retaining Auto-layout and saved-layout fits. |
| `test/unit/shared/sqlFiles.test.ts` | modify | Cover unique, missing and ambiguous SQL-to-YAML resolution and exact errors. |
| `test/unit/shared/filter.test.ts` | modify | Cover one-model scoping within a multi-model YAML file. |
| `test/unit/vscode/editorButton.test.ts` | modify | Cover immediate YAML, SQL, layout and unrelated-file context classification. |
| `test/unit/webview/panelKey.test.ts` | modify | Cover SQL panel key independence, reuse and title. |
| `test/unit/webview/initialFit.test.ts` | modify | Cover the pending-fit trigger policy, including no fit for table additions/removals and retained Auto-layout fit. |
| `test/integration/suite/extension.test.ts` | modify | Verify SQL command/menu registration and focused SQL-open panel creation. |
| `specs/ARCHITECTURE.md` | modify | Register the SQL-diagram adapter and update changed module responsibilities/exports. |
| `specs/README.md` | modify | Add feature 54 to the feature index and track its lifecycle status. |

### Signatures

```ts
// src/shared/sqlFiles.ts (shared — must not import `vscode`)
export interface SqlDiagramModelFile {
  uri: string;
  models: readonly string[];
}

export type SqlDiagramResolution =
  | { kind: 'resolved'; modelName: string; modelYmlPath: string }
  | { kind: 'invalidSqlPath' }
  | { kind: 'notFound'; modelName: string }
  | { kind: 'ambiguous'; modelName: string; modelYmlPaths: string[] };

export function resolveSqlDiagram(
  sqlPath: string,
  files: readonly SqlDiagramModelFile[],
): SqlDiagramResolution;

export function sqlDiagramResolutionError(resolution: Exclude<
  SqlDiagramResolution,
  { kind: 'resolved' }
>): string;
```

```ts
// src/vscode/editorButton.ts (pure — must not import `vscode`)
export const sqlFileContextKey = 'dbtiagram.isModelSql';

export interface EditorButtonContexts {
  model: boolean;
  source: boolean;
  sql: boolean;
  layout: boolean;
}

export function editorButtonContexts(
  activePath: string | undefined,
  activeText: string | undefined,
  modelGlob: string,
  sourceGlob: string,
): EditorButtonContexts;
```

```ts
// src/vscode/editorButtonContext.ts (vscode-facing)
export function registerEditorTitleButton(): vscode.Disposable[];
```

```ts
// src/vscode/sqlDiagram.ts (vscode-facing)
export async function openSqlDiagram(
  context: vscode.ExtensionContext,
  installedVersion: string,
  resource?: vscode.Uri,
): Promise<void>;
```

```ts
// src/webview/panelKey.ts (pure — must not import `vscode`)
export type DiagramSource =
  | { kind: 'layout'; fsPath: string }
  | { kind: 'entityFile'; domain: DiagramDomain; fsPath: string }
  | { kind: 'sql'; fsPath: string; modelYmlPath: string; modelName: string }
  | { kind: 'adhoc'; id: string };
```

```ts
// src/shared/protocol.ts (shared — must not import `vscode`)
// Replaces the existing filter:scope variant in MessageToWebview:
| { type: 'filter:scope'; domain: DiagramDomain; uri: string; entities?: DiagramEntityId[] }
```

```ts
// src/shared/filter.ts (shared — must not import `vscode`)
export function scopeSelectionToFile(
  files: readonly DiagramEntityFile[],
  domain: DiagramDomain,
  uri: string,
  entities?: readonly DiagramEntityId[],
): DomainSelection | null;
```

```ts
// webview-ui/hooks/useDiagramFilter.ts (webview)
// Existing DiagramFilterState member gains the optional exact subset:
applyScope: (domain: DiagramDomain, uri: string, entities?: readonly DiagramEntityId[]) => void;
```

```ts
// webview-ui/initial-fit.ts (webview — pure)
export function shouldRequestPendingFit(
  autoLayoutChanged: boolean,
  savedLayoutApplied: boolean,
): boolean;
```

### Behavior notes

1. `activate` registers all four commands and calls
   `registerEditorTitleButton()` before `runUpdateCheck()`. The update promise is
   still not awaited. No diagram command or context update depends on its result.
2. Editor context calculation uses only the active document's `uri.fsPath`,
   `document.getText()`, and current glob strings. It performs no `findFiles` or
   workspace file reads. It runs initially, on active-editor changes, relevant
   active-document text changes, and model/source glob changes.
3. YAML context is true only when the path matches its configured glob and the
   active text classifies to that domain. Layout files retain their path-only
   classification. SQL context is true only when the active path matches
   `sqlGlobForModelGlob(modelGlob)` and has a non-empty `.sql` basename.
4. The SQL editor-title item invokes the new `dbtiagram.openFromSql` command and
   uses the same title and icon as `dbtiagram.open`. Existing YAML/source/layout
   commands and menu conditions remain unchanged.
5. SQL resolution loads the current model YAML workspace using
   `dbtiagram.modelFileGlob`, derives the model name only from the SQL basename,
   and compares model names exactly and case-sensitively. Matching is by distinct
   declaring YAML path. One path resolves; zero or more than one fail before a
   panel is created. Ambiguous paths are sorted lexicographically in the message.
6. Invocation without a file-backed `.sql` resource shows
   `Open a dbt model SQL file first.` and opens no panel.
7. A resolved source is `{ kind: 'sql', fsPath, modelYmlPath, modelName }`.
   Its registry key is `sql:<normalized SQL path>`, independent of the YAML
   panel key. Its title is `<SQL basename>.sql — dbt Diagram`; reopening the same
   SQL path reveals the existing panel without resetting user changes.
8. A newly created SQL-origin panel uses the unified diagram with model-domain
    initial scope and the existing placement
   resolver, so `dbtiagram.openBehavior` alone determines tab/split/window
   placement. On initial ready it publishes `filter:scope` with domain `model`,
   the resolved YAML path and the one namespaced model entity ID derived from
   that file's dbt package plus `modelName`.
9. Explicit scope entities are intersected with the entities actually declared
   by that file. If the file or requested model is absent by the time the webview
   receives the message, the scope is ignored rather than showing a blank graph.
   Existing YAML-origin scope calls omit `entities` and retain current behavior.
10. Feature 53's unified diagram behavior is preserved: SQL opens use a distinct
    SQL source while YAML opens retain `{ kind: 'entityFile', domain, fsPath }`,
    and exact scope entities are namespaced `DiagramEntityId` values.
11. The `DiagramCanvas` adopt effect must not request a pending fit because the
    node count grew or `filterTick` changed. This preserves pan and zoom for all
    table additions/removals, including model, source and external-lineage
    tables and all sidebar/canvas/lineage entry points.
12. Auto-layout (`layoutTick` changed) and saved-layout application (`seedTick`
    changed) remain the only adopt-effect triggers for the existing deferred
    post-measurement fit. The initial corrective fit and manual Fit View control
    remain unchanged.
13. `shouldRequestPendingFit(reset, seeded)` returns `reset || seeded` and is the
    sole policy used by the adopt effect to set `pendingFitRef`. The existing
    node merge, placement, measurement wait and `fitView()` call are unchanged.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/sqlFiles.test.ts` | `resolves a SQL path to its one declaring YAML file` | `C:/repo/models/orders.sql`; files `a.yml:[customers]`, `b.yml:[orders,items]` | `{kind:'resolved',modelName:'orders',modelYmlPath:'b.yml'}` |
| `test/unit/shared/sqlFiles.test.ts` | `reports a missing YAML definition` | `orphan.sql`; no file declares `orphan` | `{kind:'notFound',modelName:'orphan'}` and exact message `Cannot open dbt Diagram for "orphan": no model YAML definition was found.` |
| `test/unit/shared/sqlFiles.test.ts` | `rejects multiple declaring YAML files deterministically` | `duplicate.sql`; `/repo/b/schema.yml` and `/repo/a/schema.yml` declare `duplicate` | sorted paths `['/repo/a/schema.yml','/repo/b/schema.yml']` and exact message `Cannot open dbt Diagram for "duplicate": multiple model YAML files define it: /repo/a/schema.yml, /repo/b/schema.yml.` |
| `test/unit/shared/sqlFiles.test.ts` | `rejects a non-SQL path` | `orders.py` | `{kind:'invalidSqlPath'}` and exact message `Open a dbt model SQL file first.` |
| `test/unit/shared/filter.test.ts` | `checks one requested model in its declaring file` | model file `schema.yml:[model:sample:orders,model:sample:items]`, domain `model`, URI `schema.yml`, entities `[model:sample:orders]` | selected files `{schema.yml}` and entities `{model:sample:orders}` |
| `test/unit/shared/filter.test.ts` | `ignores a stale requested model scope` | model file `schema.yml:[model:sample:items]`, domain `model`, URI `schema.yml`, entities `[model:sample:orders]` | `null` |
| `test/unit/vscode/editorButton.test.ts` | `classifies model SQL immediately from its derived glob` | path `C:/repo/models/marts/orders.sql`, text `select 1`, model glob `**/models/**/*.yml` | `{model:false,source:false,sql:true,layout:false}` |
| `test/unit/vscode/editorButton.test.ts` | `classifies active YAML text without discovery` | matching YAML path with `models: []`, then `sources: []` | model context true in first result; source context true in second |
| `test/unit/vscode/editorButton.test.ts` | `rejects SQL outside the configured model tree` | path `C:/repo/analysis/orders.sql`, model glob `**/models/**/*.yml` | `sql:false` |
| `test/unit/webview/panelKey.test.ts` | `keeps SQL and YAML panel identities independent` | SQL source and model source for orders | keys differ; SQL key is stable across repeated calls |
| `test/unit/webview/panelKey.test.ts` | `titles a SQL-origin panel from its SQL file` | `C:/repo/models/orders.sql` | `orders.sql — dbt Diagram` |
| `test/unit/webview/initialFit.test.ts` | `does not request a fit for an ordinary table-set change` | `shouldRequestPendingFit(false, false)` | `false` |
| `test/unit/webview/initialFit.test.ts` | `requests a fit after Auto-layout` | `shouldRequestPendingFit(true, false)` | `true` |
| `test/unit/webview/initialFit.test.ts` | `requests a fit after applying a saved layout` | `shouldRequestPendingFit(false, true)` | `true` |
| `test/integration/suite/extension.test.ts` | `registers and contributes SQL diagram opening` | activated extension and `package.json` | command list contains `dbtiagram.openFromSql`; editor-title item is gated by `dbtiagram.isModelSql` |
| `test/integration/suite/extension.test.ts` | `opens a SQL-keyed diagram for a uniquely declared model` | fixture `order_summary.sql` and its unique YAML declaration | a panel labelled `order_summary.sql — dbt Diagram` appears |

### Verification

- `npm run verify` — typecheck and all unit suites must be green.
- `npm test` — unit and real VS Code integration suites must be green.
- `npm run typecheck` — strict TypeScript must be green after the full suite.
- Manual: reload VS Code with a model YAML active while an update is available;
  confirm the editor-title icon appears without waiting for or dismissing the
  update prompt.
- Manual: open a uniquely declared model SQL file, click the icon, and confirm
  placement follows each `dbtiagram.openBehavior` choice and only that model is
  visible.
- Manual: create a second YAML declaration for the same SQL basename and confirm
  the exact ambiguity error appears and no panel opens.
- Manual: pan and zoom, then add/remove model, source and lineage tables through
  sidebar and canvas actions; confirm the viewport stays fixed. Run Auto-layout
  and confirm the resulting diagram is automatically fitted.

### Do not touch

- Update lookup, prompt modality/text, download/install logic and release status
  UI; only activation ordering changes.
- `src/dbt/`, `src/diagram/`, SQL lineage parsing/expansion and persisted layout
  formats.
- Existing command IDs and YAML/source/layout editor-title behavior.
- Fixture contents, dependencies and extension/package version.
- Initial fitting, manual Fit View, saved-layout fitting, fit measurement timing,
  node positioning and Auto-layout itself.

## Acceptance Criteria

- [ ] Editor-title contexts are initialized from the active document without a
      workspace scan and do not await update checking.
- [ ] A matching model SQL editor shows the diagram icon.
- [ ] A unique SQL-to-YAML match opens a separately keyed diagram, placed by the
      existing setting, with only that model visible.
- [ ] Missing and ambiguous definitions show the exact errors and open no panel.
- [ ] Reopening the same SQL file reveals its panel without resetting its state.
- [ ] Adding or removing tables never automatically fits or moves the viewport.
- [ ] Auto-layout still automatically fits the arranged tables after measurement.
- [ ] Existing YAML/source/layout opens and update behavior remain unchanged.
- [ ] `npm run verify`, `npm test`, and `npm run typecheck` are green.
