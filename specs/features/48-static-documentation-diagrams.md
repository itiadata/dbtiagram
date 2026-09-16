---
id: 48
title: Generate static documentation diagrams
status: done
priority: high
created: 2026-09-16
owner: unassigned
depends_on: [13, 16, 24, 31, 40]
---

# Generate static documentation diagrams

## Summary

As a dbt developer, I want to run dbtiagram from CI against one dbt project and
produce an offline static website containing a searchable menu, general model
and source explorers, and every saved `*.dbtiagram.yml` diagram, so that readers
of the project's generated documentation can inspect the same diagrams without
VS Code and without being able to modify project files.

## Background

The extension already has pure parsers, graph/layout/routing logic, and React
Flow presentation components. Its top-level application and several controls
are coupled to VS Code messaging and editing, however. The static exporter must
reuse the existing domain and visual implementation rather than create a second
table-card or edge renderer that can drift from the extension.

The organisation does not rely on npm publication. CI can clone this repository
and run npm commands, so the generator is delivered in this repository and the
existing private npm package rather than as another published package.

## Scope

**In scope**

- A Node 18+ command, run from this repository as
  `npm run generate -- --project <dbt-project> --output <directory>`, which
  builds the static viewer and generates one website for one dbt project.
- Model and source discovery from plain YAML using the extension's fixed
  `**/models/**/*.yml` default and existing parsers. No dbt invocation or
  manifest/catalog input is required.
- Saved-layout discovery through a configurable glob, defaulting to
  `**/*.dbtiagram.yml`.
- Optional `dbtiagram.config.yml` configuration plus CLI overrides for the
  layout glob and initial explorer limit.
- An offline output directory containing `index.html` and content-hashed local
  JavaScript/CSS assets. It works through both `file://` and HTTP and loads no
  CDN or other network resource. Direct `file://` use targets browsers that
  permit local subresource loading, including current Chromium-based browsers.
- A searchable landing menu shown initially, with available **Model explorer**
  and **Source explorer** entries followed by separate **Model diagrams** and
  **Source diagrams** sections.
- Stable hash URLs for linking to an explorer or saved diagram.
- Read-only interactive diagrams with pan, zoom, fit-view, temporary table
  dragging, automatic layout, temporary column-display changes, filtering,
  search, reveal-in-diagram, table/column selection, hover highlighting, and a
  read-only details sidebar.
- Saved positions, visible tables, notes, groups, and diagram-wide/per-table
  column-display settings from each valid layout.
- Shared table, edge, note, group, filter, details, canvas, icons, and styling
  implementations. The extension remains visually and behaviorally unchanged.
- Deterministic data, HTML, asset names, menu order, and generated output for
  identical source and repository inputs.
- Windows, Linux, and macOS support.

**Out of scope**

- Publishing a second npm package or requiring access to an npm registry after
  the repository and its dependencies are available.
- Multiple dbt projects in one invocation or grouping multiple projects in one
  website.
- Overriding model/source discovery globs.
- Reading `manifest.json`, `catalog.json`, compiled SQL, or rendered Jinja.
- Links from diagram entities to dbt Docs pages.
- Modifying or injecting navigation into dbt's generated `index.html`; the
  generated site is placed beside documentation and linked or framed by the
  caller.
- Editing models, sources, columns, constraints, notes, groups, or saved
  layouts; source import; fields matrix; AI actions; VS Code source/SQL actions;
  extension settings; update controls; or persistence of browser interactions.
- Configurable branding, project title, or logo.
- Markdown rendering in descriptions; descriptions remain plain text.
- Docker images and deployment-provider-specific integration.
- A no-JavaScript rendering mode.

## Configuration and output contract

The optional project-root `dbtiagram.config.yml` has this versioned shape:

```yaml
version: 1
layoutGlob: "**/*.dbtiagram.yml"
initialSelectionLimit: 100
```

- Missing configuration uses exactly those defaults.
- `--layout-glob <glob>` and `--initial-selection-limit <positive-integer>`
  override the corresponding file values. `--config <path>` selects another
  config file relative to the project root. The required `--project` and
  `--output` paths are resolved from the process working directory.
- Unknown configuration keys are rejected. The resolved output directory is
  always excluded from discovery, including when it is inside the dbt project.
- Generation owns `index.html` and files named `assets/dbtiagram-app-*`. It
  replaces those files and removes stale assets with that prefix, but preserves
  every other existing output file.
- Warnings exit `0`; errors exit non-zero. Successful output reports the
  generated `index.html` path and counts for model explorers, source explorers,
  model layouts, source layouts, and warnings.

The page embeds its project data in `index.html`; it does not fetch JSON. Script
and stylesheet URLs are relative to `index.html`, which permits direct `file://`
use. Asset names contain the first twelve lowercase hexadecimal characters of
their SHA-256 content hash.

## Navigation and presentation contract

- The initial route is `#/` and shows the menu, not a diagram.
- `#/models` and `#/sources` address the general explorers. An explorer entry is
  omitted when that domain has no entities.
- A saved layout route is `#/diagram/<encoded-relative-layout-path>`, where the
  path is project-relative, slash-normalised, includes `.dbtiagram.yml`, and
  each path segment is URI encoded. The path, not the display name, supplies
  identity, so duplicate display names remain linkable.
- Saved diagrams are sorted by case-insensitive display name and then relative
  path. When a display name occurs more than once, each duplicate also shows
  its relative path. Menu search is a case-insensitive substring match over the
  display name and relative path and does not hide explorer entries.
- The page follows the OS light/dark preference on first load and offers a
  session-only theme toggle. It uses the existing diagram appearance with
  browser fallbacks for VS Code colour variables.
- Desktop and tablet are supported. On narrow/mobile viewports the menu and
  sidebars stack without horizontal page overflow; manipulating a large canvas
  on mobile is only a graceful fallback, not a separately optimised experience.
- Interactive controls are keyboard reachable, labelled, visibly focused, and
  use the existing accessible contrast palette.

## Input and validation contract

- Candidate YAML paths and layout paths are sorted by normalized project-relative
  path before parsing, producing deterministic file/entity ordering.
- A valid file with a top-level `models` key is model input. Otherwise a valid
  file with a top-level `sources` key is source input. A file containing both is
  model input only. Other valid YAML files are ignored.
- Any malformed candidate YAML, malformed model/source structure, malformed
  layout, unsupported layout version, unreadable input, invalid configuration,
  duplicate model ID, or duplicate qualified source-table ID fails generation
  without replacing existing generated output.
- A valid layout whose mode has no loaded entities is still listed. Missing
  referenced tables are omitted from its canvas and produce both a CLI warning
  and a visible page warning naming them. Warnings do not fail generation.
- A project with no model or source entities generates a menu containing
  `No model or source definitions found.` Saved layouts can still be listed and
  display their missing-table warnings.

## Read-only component contract

- `TableNode` remains the sole table-card renderer. Read-only mode suppresses
  inline editors, column transfer/drop behavior, and mutation context menus;
  selection, tooltips, key/test icons, handles, and hover behavior remain.
- `FkEdge` and `GroupNode` remain the sole edge and group renderers.
- `NoteNode` remains the sole note renderer. Static notes retain their saved
  size/text and may be temporarily collapsed/expanded, but cannot be edited,
  resized, selected for deletion, or moved.
- `DiagramCanvas` remains the shared React Flow canvas. Read-only mode hides
  add-note, create-group, add-FK, fields-matrix, and source-import actions and
  ignores delete/context-menu mutation paths. Auto-layout, column-display,
  React Flow controls, routing, fit behavior, and temporary table movement
  remain.
- `FilterSidebar` remains the shared filter renderer. Static mode keeps file and
  entity filters, search, bulk selection, and reveal-in-diagram, while omitting
  reveal-source, open-SQL, and action-menu controls.
- `DetailsSidebar` remains the shared details renderer. Static mode uses the same
  shell and field styles and presents the same properties as the extension:
  table name/description/column-display/PK/FK information and column
  name/data-type/description/PK membership. Project-backed values are read-only;
  column-display controls remain session-only. It omits every edit and VS Code
  action. Existing test icons and tooltips remain on table cards.
- Extension mode is the default for every changed shared component, preserving
  existing call sites and behavior unless an explicit read-only mode is passed.

## Scenarios

### Generate an offline site

```
Given a dbt project contains valid model YAML, source YAML, and saved layouts
When CI runs npm run generate -- --project <project> --output <output>
Then the command exits successfully and writes index.html plus content-hashed local JavaScript and CSS assets
And opening index.html through file:// or HTTP shows the same initial menu without a network request
```

### Browse the initial menu

```
Given generated data contains models, sources, model layouts, and source layouts
When the generated index opens at #/
Then it shows Model explorer and Source explorer
And it shows separate Model diagrams and Source diagrams sections
And saved diagrams are ordered by display name then relative path
And entering any item updates the stable hash route and opens its read-only diagram
```

### Search and disambiguate saved diagrams

```
Given two layouts have the display name "Orders" at diagrams/a.dbtiagram.yml and archive/a.dbtiagram.yml
When the user searches the menu for "archive"
Then only the second saved layout remains among the saved-layout results
And both duplicate entries display their project-relative paths
And their hash routes remain distinct
```

### Explore all models and sources

```
Given the project has model and source entities from several YAML files
When the user opens Model explorer or Source explorer
Then that domain is automatically laid out
And at most the configured initialSelectionLimit entities begin selected
And the shared file/entity filter can reveal, hide, search, and center entities
And the other domain is not mixed into the graph
```

### View a saved layout faithfully

```
Given a saved layout contains selected tables, positions, notes, groups, and column-display settings
When the user opens that saved diagram
Then all existing referenced tables use the saved positions and visibility
And its notes, groups, and column-display settings match the extension rendering
And table dragging, note collapsing, and column-display changes remain temporary browser state
```

### Inspect without editing

```
Given a table or column is selected in a generated diagram
When the details sidebar opens
Then it uses the existing details appearance and shows names, descriptions, data types, primary keys, foreign keys, and column-display controls
And only column-display controls can change, with changes limited to the current browser session
And no edit, reveal-file, SQL, import, AI, settings, update, save, note, group, or foreign-key creation action is available
And double-clicking table and column text never opens an inline editor
```

### Warn about missing layout tables

```
Given a valid saved layout references tables named orders and deleted_model
And only orders exists in the matching project domain
When the site is generated and that layout is opened
Then generation exits zero and prints a warning naming deleted_model and the layout path
And the canvas contains orders but not deleted_model
And the page displays a warning naming deleted_model
```

### Reject invalid input atomically

```
Given an existing generated site and a candidate YAML, configuration, or layout file is invalid
When generation is attempted
Then the command exits non-zero with the failing project-relative path and parser message
And no owned file in the existing output is replaced or removed
```

### Preserve unrelated output files

```
Given the output contains a caller-owned file and stale dbtiagram generated assets
When generation succeeds
Then index.html and dbtiagram-owned assets are replaced
And stale assets named assets/dbtiagram-app-* are removed
And the caller-owned file remains byte-identical
```

### Produce deterministic output

```
Given project inputs and repository sources have not changed
When the generator runs twice
Then every generated path and byte is identical between runs
```

### Preserve extension presentation and editing

```
Given the VS Code extension is built after the shared components are made mode-aware
When a normal model or source diagram is opened in VS Code
Then its table cards, edges, notes, groups, filters, details, layout interactions, and editing actions behave as before
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `specs/features/48-static-documentation-diagrams.md` | create | Product contract and implementation plan. |
| `specs/README.md` | modify | Add feature 48 to the feature index and advance its lifecycle status. |
| `specs/ARCHITECTURE.md` | modify | Register the static generator/viewer modules and updated shared UI responsibilities. |
| `package.json` | modify | Add `build:static` and `generate` scripts; keep one private package and existing dependencies. |
| `esbuild.config.mjs` | modify | Bundle the Node generator and browser viewer as deterministic intermediate artifacts without changing extension outputs. |
| `tsconfig.json` | modify | Include `static-ui/` in strict typechecking. |
| `src/shared/staticSite.ts` | create | Browser-safe generated-site schema, route IDs, menu derivation, duplicate-label disambiguation, and safe deterministic JSON serialization. |
| `src/static/config.ts` | create | Strict CLI/config decoding and resolved generator options. |
| `src/static/project.ts` | create | Node filesystem discovery/read adapter for one project, with deterministic paths and model-wins classification. |
| `src/static/site.ts` | create | Pure conversion from loaded project inputs to model/source universes, file metadata, parsed layouts, warnings, and duplicate-ID validation. |
| `src/static/generate.ts` | create | Atomic site generation, HTML construction, asset hashing/copying, and owned-file cleanup. |
| `src/static/cli.ts` | create | Thin process adapter: arguments, console reporting, and exit code. |
| `static-ui/index.tsx` | create | Browser entry point that reads embedded data and mounts `StaticApp`. |
| `static-ui/StaticApp.tsx` | create | Hash routing, theme state, landing menu, and selected-diagram composition. |
| `static-ui/DiagramMenu.tsx` | create | Searchable explorer/model-layout/source-layout menu. |
| `static-ui/StaticDiagram.tsx` | create | Read-only diagram state: graph filtering, selection, layout seeding, notes/groups, and shared canvas/sidebar composition. |
| `static-ui/static-data.ts` | create | Decode and validate the embedded JSON script element before rendering. |
| `static-ui/styles.css` | create | Menu/responsive/theme-toggle styles and browser colour fallbacks; imports shared diagram styles. |
| `webview-ui/presentation-mode.tsx` | create | Shared default-edit presentation context used to suppress mutations in the static viewer without changing component APIs. |
| `webview-ui/TableNode.tsx` | modify | Add explicit read-only rendering behavior without duplicating the table card. |
| `webview-ui/DiagramCanvas.tsx` | modify | Add an explicit read-only mode that retains navigation/layout controls and suppresses mutations. |
| `webview-ui/DetailsSidebar.tsx` | modify | Add shared read-only property rendering, including PK/FK/test/meta summaries. |
| `webview-ui/FilterSidebar.tsx` | modify | Add an explicit browser/static mode that omits VS Code-only actions while preserving filtering/reveal. |
| `webview-ui/NoteNode.tsx` | modify | Add read-only note rendering with temporary collapse only. |
| `webview-ui/ForeignKeySection.tsx` | modify | Reuse the existing FK card layout in read-only mode while replacing editors and mutation controls with styled values. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Accept an initial selection limit while retaining the extension's current default. |
| `webview-ui/styles.css` | modify | Add shared read-only details/card/note states without changing extension-mode selectors. |
| `test/unit/shared/staticSite.test.ts` | create | Deterministic menu, route, duplicate-name, and safe serialization tests. |
| `test/unit/static/config.test.ts` | create | CLI/config/default/validation tests. |
| `test/unit/static/project.test.ts` | create | Cross-platform discovery, classification, and read-failure tests using temporary directories. |
| `test/unit/static/site.test.ts` | create | Model/source graph, layouts, duplicates, ordering, warnings, and failure tests. |
| `test/unit/static/generate.test.ts` | create | Atomic output, hashing, cleanup, preservation, determinism, and offline-shell tests. |
| `test/unit/webview/readOnlyComponents.test.ts` | create | Server-render shared components in read-only mode and assert editing controls/handlers are absent. |

### Signatures

```ts
// src/shared/staticSite.ts (shared — must not import `vscode` or Node APIs)
export const STATIC_SITE_SCHEMA_VERSION = 1;
export type StaticDiagramRoute = 'models' | 'sources' | `diagram/${string}`;
export interface StaticDiagramUniverse {
  mode: DiagramMode;
  graph: DiagramGraph;
  files: DiagramEntityFile[];
}
export interface StaticLayoutEntry {
  route: StaticDiagramRoute;
  relativePath: string;
  title: string;
  layout: DiagramLayout;
  missing: string[];
}
export interface StaticSiteData {
  schemaVersion: typeof STATIC_SITE_SCHEMA_VERSION;
  initialSelectionLimit: number;
  model?: StaticDiagramUniverse;
  source?: StaticDiagramUniverse;
  layouts: StaticLayoutEntry[];
}
export interface StaticMenuEntry {
  route: StaticDiagramRoute;
  title: string;
  detail?: string;
  mode: DiagramMode;
  kind: 'explorer' | 'layout';
}
export function staticLayoutRoute(relativePath: string): StaticDiagramRoute;
export function parseStaticDiagramHash(hash: string): StaticDiagramRoute | null;
export function buildStaticMenu(data: StaticSiteData, query?: string): StaticMenuEntry[];
export function serializeStaticSiteData(data: StaticSiteData): string;
```

```ts
// src/static/config.ts (Node-facing — must not import `vscode`)
export interface StaticGeneratorOptions {
  project: string;
  output: string;
  config: string;
  layoutGlob: string;
  initialSelectionLimit: number;
}
export interface StaticCliArguments {
  project: string;
  output: string;
  config?: string;
  layoutGlob?: string;
  initialSelectionLimit?: number;
}
export const DEFAULT_LAYOUT_GLOB = '**/*.dbtiagram.yml';
export const DEFAULT_STATIC_INITIAL_SELECTION_LIMIT = 100;
export function parseStaticCliArguments(argv: readonly string[]): StaticCliArguments;
export function resolveStaticGeneratorOptions(
  args: StaticCliArguments,
  readText: (path: string) => Promise<string | null>,
): Promise<StaticGeneratorOptions>;
```

```ts
// src/static/project.ts (Node-facing — must not import `vscode`)
export const STATIC_MODEL_SOURCE_GLOB = '**/models/**/*.yml';
export interface StaticInputFile { relativePath: string; text: string }
export interface StaticProjectInputs {
  projectRoot: string;
  yamlFiles: StaticInputFile[];
  layoutFiles: StaticInputFile[];
}
export async function loadStaticProjectInputs(options: StaticGeneratorOptions): Promise<StaticProjectInputs>;
```

```ts
// src/static/site.ts (pure — must not import `vscode` or Node APIs)
export interface StaticSiteWarning {
  code: 'missing-layout-tables';
  path: string;
  tables: string[];
}
export interface BuiltStaticSite {
  data: StaticSiteData;
  warnings: StaticSiteWarning[];
}
export function buildStaticSite(
  inputs: StaticProjectInputs,
  initialSelectionLimit: number,
): BuiltStaticSite;
```

```ts
// src/static/generate.ts (Node-facing — must not import `vscode`)
export interface GenerateStaticSiteResult {
  indexPath: string;
  modelExplorerCount: 0 | 1;
  sourceExplorerCount: 0 | 1;
  modelLayoutCount: number;
  sourceLayoutCount: number;
  warnings: StaticSiteWarning[];
}
export async function generateStaticSite(
  options: StaticGeneratorOptions,
): Promise<GenerateStaticSiteResult>;
```

```ts
// webview-ui/presentation-mode.tsx (webview)
export type DiagramPresentationMode = 'edit' | 'readonly';
export interface DiagramPresentationProviderProps {
  mode: DiagramPresentationMode;
  children: ReactNode;
}
export function DiagramPresentationProvider(
  props: DiagramPresentationProviderProps,
): JSX.Element;
export function useDiagramPresentationMode(): DiagramPresentationMode;
```

```ts
// webview-ui/hooks/useDiagramFilter.ts (webview)
export function useDiagramFilter(
  initialSelectionLimit?: number,
): DiagramFilterState;
```

```ts
// static-ui/static-data.ts (webview/browser — must not import `vscode` or Node APIs)
export function readStaticSiteData(document: Document): StaticSiteData;

// static-ui/DiagramMenu.tsx (webview/browser)
export interface DiagramMenuProps {
  data: StaticSiteData;
  onOpen: (route: StaticDiagramRoute) => void;
}
export function DiagramMenu(props: DiagramMenuProps): JSX.Element;

// static-ui/StaticDiagram.tsx (webview/browser)
export interface StaticDiagramProps {
  data: StaticSiteData;
  route: StaticDiagramRoute;
  onBack: () => void;
}
export function StaticDiagram(props: StaticDiagramProps): JSX.Element;

// static-ui/StaticApp.tsx (webview/browser)
export interface StaticAppProps { data: StaticSiteData }
export function StaticApp(props: StaticAppProps): JSX.Element;
```

### Behavior notes

- **Generation transaction:** discover, read, parse, validate, build data,
  bundle/read assets, and construct every output byte before touching output.
  Write to a sibling temporary directory; only after success replace owned
  files. On failure, remove temporary files and leave existing output intact.
- **Classification:** parse YAML syntax once to inspect the root mapping. A
  `models` key selects `parseModelYml`; otherwise a `sources` key selects
  `parseSourceYml`; a mapping with neither key and any non-mapping valid YAML are
  ignored. Syntax errors and errors from the selected domain parser are fatal.
  This preserves model-wins behavior for mixed files while avoiding false
  failures for unrelated YAML.
- **Paths:** data and diagnostics expose slash-normalized project-relative paths,
  never machine-specific absolute paths. Discovery excludes `node_modules`,
  `.git`, the resolved output directory, and layout files from model/source
  parsing.
- **Duplicates:** fail with
  `Duplicate model id "<id>" in <first> and <second>` or
  `Duplicate source table id "<id>" in <first> and <second>`.
- **Layouts:** parse with `parseDiagramLayout`, select the universe matching
  `layout.mode`, and reconcile through `applyLayout`. Missing names remain in
  `StaticLayoutEntry.missing`; only existing names enter the rendered graph.
- **Explorers:** use all files in their domain and automatic layout. Initial
  selection is the first `initialSelectionLimit` identities in deterministic
  file/declaration order. Saved layouts ignore this cap and select exactly their
  existing table entries.
- **Route changes:** changing routes remounts diagram-local state. Temporary
  drags, filters, column modes, note collapse, selection, and viewport therefore
  reset whenever the user leaves a diagram or reloads the page.
- **Presentation mode:** the context defaults to `edit`, so the extension needs
  no wrapper or changed props. `StaticApp` wraps its content in mode `readonly`.
  The existing exports of `TableNode`, `NoteNode`, `DiagramCanvas`,
  `FilterSidebar`, and `DetailsSidebar` do not change signature.
- **Read-only table:** presentation mode `readonly` prevents setting `editing`, makes column
  rows non-draggable, does not invoke transfer/drop callbacks, and does not open
  mutation context menus. Header/column selection and hover callbacks remain.
- **Read-only canvas:** table nodes remain draggable. Note and group nodes are
  not draggable. Delete/Backspace and right-click do not mutate anything. The
  top-left editing toolbar is absent; the top-right Auto-layout and column-mode
  controls remain.
- **Read-only details:** missing descriptions/data types use `—`. PK columns and
  FK cards preserve graph order. Each FK shows
  `<source columns> → <target id>.<target columns>` plus `Virtual`/`Real`.
  Column-display radio controls remain enabled because they alter only the
  current rendering; every project-backed field/control is non-editable.
- **Manual verification addendum — browser theme:** static light/dark mode sets
  every shared colour token used by table headers and React Flow controls. Table
  headers and the bottom-left zoom, fit-view, and lock buttons therefore switch
  immediately with the session theme and never retain a hard-coded light
  background in dark mode.
- **Manual verification addendum — FK interaction:** the static viewer uses the
  shared `useEdgeHighlighting` behavior. Hovering an FK edge or either endpoint
  column highlights the relationship and animates its direction exactly as in
  the extension; leaving it stops the animation.
- **Manual verification addendum — FK details:** read-only table details reuse
  `ForeignKeySection` and its existing `fk-card` / `fk-pair` structure and
  styles. Read-only mode renders target, source/target pairs, and Real/Virtual
  state as non-editable values while omitting Add, Remove, picker, checkbox, and
  mutation handlers. It does not use a separate plain-text FK presentation.
- **Theme:** theme selection is held in browser memory only. Initial value comes
  from `prefers-color-scheme`; the control switches between light and dark and
  is labelled `Use light theme` or `Use dark theme` for its destination.
- **Safe embedding:** JSON serialization escapes `<`, U+2028, and U+2029 so
  project text cannot terminate the data script or execute HTML/JavaScript.
  React continues to escape all rendered text.
- **Atomic ownership:** stale `assets/dbtiagram-app-*` files are removed only in
  the successful replacement phase. No other file is deleted.
- **Build:** `npm run build` keeps producing the existing extension/webview and
  also builds static artifacts. `npm run build:static` builds only the static
  generator/viewer intermediates. `npm run generate -- ...` runs
  `build:static` before invoking the bundled generator, so a cloned repository
  needs only `npm ci` followed by the generate command.
- **Extension compatibility:** the presentation context defaults to `edit`.
  Existing extension call sites, protocol, persisted YAML, commands, and
  extension behavior do not change.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/staticSite.test.ts` | `builds deterministic grouped menu entries and routes` | Model/source universes and unsorted layouts | Explorer entries plus layouts sorted by case-insensitive title/path; routes `models`, `sources`, and encoded relative paths. |
| `test/unit/shared/staticSite.test.ts` | `shows paths for duplicate display names` | Two `Orders` layouts at `diagrams/a.dbtiagram.yml` and `archive/a.dbtiagram.yml` | Both entries have their respective `detail`; unique names omit `detail`. |
| `test/unit/shared/staticSite.test.ts` | `filters saved layouts by title or path` | Query `archive` and duplicate Orders inputs | Only `archive/a.dbtiagram.yml` remains among layout entries; explorers remain. |
| `test/unit/shared/staticSite.test.ts` | `parses stable hashes` | `#/`, `#/models`, `#/sources`, encoded layout route, unknown route | `null`, `models`, `sources`, decoded layout route, `null`. |
| `test/unit/shared/staticSite.test.ts` | `escapes embedded JSON script breakers` | Text containing `</script>`, U+2028 and U+2029 | Serialized text contains none of those literal sequences and parses to the original values. |
| `test/unit/static/config.test.ts` | `uses documented defaults` | `--project p --output o`, no config file | Absolute project/output/config paths, layout glob `**/*.dbtiagram.yml`, limit `100`. |
| `test/unit/static/config.test.ts` | `applies config then CLI overrides` | Config limit `40`, glob `diagrams/**`; CLI limit `12` | Limit `12`, glob `diagrams/**`. |
| `test/unit/static/config.test.ts` | `rejects invalid arguments and config` | Missing required flag, unknown key, version `2`, limit `0` | Each rejects with a specific argument/config error and no generation begins. |
| `test/unit/static/project.test.ts` | `discovers sorted project-relative inputs` | Temporary project with Windows/Unix-safe nested YAML/layout paths and excluded dirs | Model/source candidates use fixed glob; layouts use configured glob; arrays are slash-normalized and sorted; excluded paths absent. |
| `test/unit/static/site.test.ts` | `classifies model source mixed and unrelated YAML` | One model, one source, one mixed, one unrelated valid YAML | Model universe includes model + mixed models; source universe includes only source; unrelated file absent. |
| `test/unit/static/site.test.ts` | `builds model and source explorers` | Multiple valid files in unsorted input order | Graphs and `DiagramEntityFile[]` match existing parser/graph behavior in sorted file and declaration order. |
| `test/unit/static/site.test.ts` | `fails duplicate identities` | Duplicate model IDs and duplicate qualified source IDs | Literal duplicate errors name both project-relative files. |
| `test/unit/static/site.test.ts` | `reconciles missing layout tables as warnings` | Layout containing `orders` and `deleted_model`; only `orders` exists | Entry missing is `['deleted_model']`; one warning names path/table; build succeeds. |
| `test/unit/static/site.test.ts` | `fails malformed and unsupported inputs` | Malformed candidate YAML, malformed layout, unsupported layout version | Each throws with project-relative path and existing parser message. |
| `test/unit/static/generate.test.ts` | `writes an offline content-hashed site` | Valid temporary project and static intermediates | `index.html` embeds data, references only relative hashed JS/CSS, and contains no `http://`, `https://`, `fetch(`, or absolute input path. |
| `test/unit/static/generate.test.ts` | `preserves prior output when generation fails` | Existing owned files plus invalid project input | Promise rejects and every prior byte remains unchanged. |
| `test/unit/static/generate.test.ts` | `replaces only owned output` | Existing index, stale prefixed asset, and `caller.txt` | New index/assets exist, stale prefixed asset absent, `caller.txt` unchanged. |
| `test/unit/static/generate.test.ts` | `is byte deterministic` | Two runs over unchanged input | Relative file lists and bytes are deeply equal. |
| `test/unit/webview/readOnlyComponents.test.ts` | `renders table cards without edit affordances` | `TableNode` under a read-only interaction context | Labels/icons/handles render; no input or draggable column row renders. |
| `test/unit/webview/readOnlyComponents.test.ts` | `renders read-only details` | Table and column entities with description, type, PK and FK | Values, key relation text, and column-display radios render; no project-backed input, textarea, select, reveal, add, remove, or edit button renders. |
| `test/unit/webview/readOnlyComponents.test.ts` | `renders static filter actions only` | Read-only filter with one file/entity | Search, checkboxes and reveal-in-diagram render; source/SQL/action-menu controls do not. |
| `test/unit/webview/readOnlyComponents.test.ts` | `renders a non-editable note` | Expanded read-only note | Saved text renders without textarea or resize grip; collapse control remains. |
| `test/unit/webview/readOnlyComponents.test.ts` | `renders foreign keys with the shared card structure` | Read-only table with one real FK | `fk-card` and `fk-pair` render with target, paired columns and `Real`; no combobox, checkbox, Add, or Remove control renders. |
| `test/unit/webview/readOnlyComponents.test.ts` | `keeps static FK hover animation behavior` | Static flow containing one FK and its shared highlighting hook | Hover marks that edge active and animated; leave restores its inactive state. |
| `test/unit/fixture.test.ts` | `generates static site data from the sample dbt project` | Existing sample fixture and its committed layouts | Model/source universes and layouts build with no error; all referenced fixture entities resolve. |

Every UI scenario also has a manual check because Node-only unit tests do not
attempt to emulate React Flow pointer/viewport behavior.

### Verification

- `npm run verify` — strict typecheck and all unit suites are green.
- `npm run build:static` — generator and browser viewer bundles are produced.
- `npm run generate -- --project fixtures/sample-dbt --output <temporary-directory>` — exits zero and produces the documented site shape.
- Open the generated `index.html` directly with `file://` — menu, both explorers,
  saved diagrams, search, theme, filtering, selection, details, pan/zoom,
  temporary drag, notes/groups, and stable hash links work without network use.
- Serve the same directory with a local HTTP server and repeat the smoke test.
- `npm test` — unit and VS Code integration suites are green before commit.
- `npm run typecheck` — strict TypeScript is green before commit.
- Manual final verification embeds or links the generated directory from the
  user's real dbt documentation pipeline.

### Do not touch

- `src/dbt/edit/**`, merge/serialization modules, source import, AI features,
  VS Code file writers/watchers, and `src/shared/protocol.ts`: static generation
  is read-only and has no host message protocol.
- `src/diagram/graph.ts`, `src/diagram/layout.ts`, `src/diagram/flow.ts`, and
  `src/diagram/routing.ts`: consume these existing implementations without
  creating a competing graph/layout/routing pipeline.
- Existing `.dbtiagram.yml` schema, parsing, serialization, and extension save
  behavior.
- Existing extension commands, settings, panel placement, and default initial
  selection limit (`20`). The static default (`100`) is passed explicitly.
- `fixtures/sample-dbt/` contents unless a later approved plan amendment names
  a deliberate fixture addition; incidental F5 edits are never committed.

## Acceptance Criteria

- [ ] One repository-local npm command generates an offline static site for one dbt project.
- [ ] The initial page is a searchable menu with available model/source explorers and grouped saved diagrams.
- [ ] Model/source data comes from the existing YAML parsers and graph builders, with model-wins classification.
- [ ] Saved diagrams preserve tables, positions, notes, groups, and column-display settings and visibly warn about missing tables.
- [ ] General explorers auto-layout and use the shared filter with the configurable default cap of 100.
- [ ] Static diagrams support navigation and inspection but expose no persistence or project-editing action.
- [ ] Table cards, edges, notes, groups, canvas, filters, details styling, and icons have one shared implementation with the extension.
- [ ] Output is deterministic, content-hashed, offline, `file://` compatible, and preserves non-owned output files.
- [ ] Invalid inputs fail atomically and warnings exit successfully.
- [ ] The existing extension remains visually and behaviorally unchanged.
- [ ] `npm run verify`, `npm test`, and `npm run typecheck` are green.
