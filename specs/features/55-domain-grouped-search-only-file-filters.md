---
id: 55
title: Group sidebar filters by domain and make file selection search-only
status: implemented
priority: medium
created: 2026-10-01
owner: unassigned
depends_on: [53, 54]
---

# Group sidebar filters by domain and make file selection search-only

## Summary

As a dbt developer, I want the left filter sidebar grouped first into Models and
Sources, with file and entity controls inside each group, so that I can narrow
the list of entities I am searching without accidentally removing tables that
are already on the diagram. File checkboxes become a search/list scope; only
model and source checkboxes control diagram membership.

## Background

The combined diagram currently presents four sibling blocks: Model YAML files,
Models, Source YAML files, and Sources. A file checkbox both narrows the entity
list and has precedence over entity visibility, so clearing a file immediately
removes all of its tables from the canvas. This is surprising when the user only
wants to find another model declared in a particular YAML file.

The chosen design separates two concepts: file selection controls where the
sidebar searches, while entity selection controls what the diagram contains.
An alternative would be a single file tree with entities nested under each
file, but that makes entities declared in more than one file ambiguous and
couples navigation to diagram membership again. Another alternative is to keep
the current precedence and add a separate file-search dropdown; that adds a
fifth control without removing the destructive behavior.

## Scope

**In scope**

- Under the existing Filter section, render two collapsible domain groups in
  this order: Models, then Sources.
- Inside Models, render collapsible Files and Models subsections; inside
  Sources, render collapsible Files and Sources subsections.
- File checkbox selections scope only the entities listed in the corresponding
  Models or Sources subsection.
- Entity checkbox selections alone determine which local model/source cards are
  on the diagram.
- File and entity search boxes and All/None actions remain independent per
  domain and level.
- Opening a saved layout preserves its table membership when file scope changes.
- Existing initial scopes for model-YAML, source-YAML, and SQL-origin diagrams
  continue selecting the intended entities.

**Out of scope**

- Persisting sidebar expansion, search, or file-scope state across sessions.
- Replacing the subsection lists with a per-file entity tree.
- Changing lineage expansion, external lineage cards, saved-layout format, or
  model/source editing behavior.
- Changing the initial 20-model cap.

## Scenarios

### Group controls by entity domain

```
Given model and source YAML files are loaded
When the user opens the Filter section
Then a Models group appears before a Sources group
And Models contains Files and Models subsections
And Sources contains Files and Sources subsections
```

### Narrow the model list without changing the diagram

```
Given models from orders.yml and customers.yml are displayed
When the user clears orders.yml in Models > Files
Then models declared only by orders.yml disappear from Models > Models
And every displayed table remains on the diagram
```

### Add a model from one selected file

```
Given orders.yml is the only selected file in Models > Files
And an orders.yml model is not displayed
When the user checks that model in Models > Models
Then that model is added to the diagram
And tables from other files already on the diagram remain displayed
```

### Clear all file search scope

```
Given model tables are displayed
When the user chooses None in Models > Files
Then Models > Models shows "No files selected"
And the displayed model tables remain on the diagram
```

### Apply entity bulk actions only to the current file scope

```
Given orders.yml is the only selected model file
And displayed models also exist from customers.yml
When the user chooses None in Models > Models
Then models from orders.yml are removed from the diagram
And displayed models from customers.yml remain on the diagram
```

### Keep model and source scopes independent

```
Given model and source tables are displayed
When the user changes the file selection under Models
Then only the Models entity list is narrowed
And the Sources entity list and all diagram tables are unchanged
```

### Preserve a saved diagram while browsing files

```
Given a saved diagram has been opened with tables from several YAML files
When the user selects one file or chooses None in either Files subsection
Then no saved-layout table is removed from the diagram
And the corresponding entity subsection is narrowed or emptied
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/filter.ts` | modify | Replace file-precedence visibility with pure helpers for file-scoped entity availability and combined entity-only visibility. |
| `webview-ui/hooks/useDiagramFilter.ts` | modify | Keep file scope independent from diagram membership and avoid diagram refits for file-only changes. |
| `webview-ui/FilterSidebar.tsx` | modify | Render Models and Sources parent groups with nested Files and entity subsections. |
| `webview-ui/styles.css` | modify | Visually distinguish and indent the two domain groups and their nested subsections. |
| `test/unit/shared/filter.test.ts` | modify | Cover file-scoped entity lists and entity-only combined visibility. |
| `test/unit/webview/FilterSidebar.test.tsx` | create | Server-render the sidebar and verify the domain-first nested heading structure and empty-scope text. |
| `specs/ARCHITECTURE.md` | modify | Update filter helper, hook, and sidebar responsibilities. |

### Signatures

```ts
// src/shared/filter.ts (shared — must not import `vscode`)
export function entitiesInSelectedFiles(
  files: readonly DiagramEntityFile[],
  selectedFiles: ReadonlySet<string>,
): string[];

export function combineSelectedEntities(
  selections: Readonly<Record<DiagramDomain, ReadonlySet<string>>>,
): Set<string>;

// `computeVisibleModels` is removed.

// webview-ui/hooks/useDiagramFilter.ts (webview)
export function useDiagramFilter(
  initialSelectionLimit?: number,
): DiagramFilterState;

// webview-ui/FilterSidebar.tsx (webview)
export function FilterSidebar(props: FilterSidebarProps): JSX.Element;
```

No `FilterSidebarProps` or `DiagramFilterState` fields change.

### Behavior notes

- `entitiesInSelectedFiles` returns the unique entity IDs declared by selected
  files, preserving file order and declaration order. If no files are selected,
  it returns `[]`.
- `combineSelectedEntities` returns the union of model and source entity
  selections. It does not inspect file selections. This set is the local-table
  input to `filterGraph`; lineage-owned external nodes retain their existing
  handling in `App.tsx`.
- Toggling a file or using Files All/None changes only the available entity list
  and its count. It does not change either entity-selection set, increment
  `filterTick`, refit the canvas, clear selection, or mutate layout state.
- Toggling an entity and using entity All/None retain their current diagram
  behavior and increment `filterTick`. Entity All/None applies only to entities
  currently available through selected files; selected entities outside that
  scope are preserved.
- A selected entity remains displayed when all files declaring it are outside
  the current file scope. If it becomes available again, its checkbox is still
  checked.
- Initial file-origin and SQL-origin scope still explicitly sets both file scope
  and entity membership. Opening a layout still sets entity membership from the
  layout; its initial file scope remains all known files.
- The hierarchy is `Filter > Models > (Files, Models)` followed by
  `Filter > Sources > (Files, Sources)`. The Filter section, both domain groups,
  and all four nested subsections remain independently collapsible.
  Existing search labels, context menus, counts, and All/None labels remain
  domain-specific.
- An empty selected-file scope renders the existing literal text
  `No files selected` in its entity subsection. File-search misses and
  entity-search misses continue rendering `No matches`.
- An entity declared by more than one selected file appears once. It remains in
  the entity list while at least one selected file declares it.
- Existing reveal flows that add an entity (related tables, lineage, or source
  import) continue selecting its declaring file so the newly added entity is
  immediately present in the corresponding entity list.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/filter.test.ts` | `lists unique entities from selected files in declaration order` | orders file with `orders, items`, duplicate `orders` in a second selected file, and an unselected customers file | `['model:sample:orders', 'model:sample:items']` |
| `test/unit/shared/filter.test.ts` | `returns no available entities when no files are selected` | two model files and `new Set()` | `[]` |
| `test/unit/shared/filter.test.ts` | `combines diagram membership without consulting file scope` | model selection `{orders, customers}` and source selection `{finops.transactions}` | set `{orders, customers, finops.transactions}` |
| `test/unit/shared/filter.test.ts` | `keeps selected entities outside a scoped None bulk action` | selected `{orders, customers}`, available `{orders}`, then `removeModels` | `{customers}` |
| `test/unit/webview/FilterSidebar.test.tsx` | `renders domain groups before their nested subsections` | one model file/entity and one source file/entity | heading order `Filter, Models, Files, Models, Sources, Files, Sources`, with each Files/entity pair nested in its domain group |
| `test/unit/webview/FilterSidebar.test.tsx` | `shows the empty file-scope message without hiding selected entities` | selected model entity with no selected model files | markup contains `No files selected`; model checkbox list contains no model row while the supplied selected entity state remains unchanged |

The shared-filter tests cover file narrowing, entity addition/removal, domain
independence, and saved-layout membership because all use the same two pure
derivations. The component tests cover the observable hierarchy and empty state.

### Verification

- `npm run verify` — typecheck and unit suites must be green.
- `npm test` — unit and integration suites must be green.
- Manual: open a saved multi-file diagram, choose None under Models > Files,
  confirm no cards move or disappear, then select one file and add an unchecked
  model from that file.

### Do not touch

- `src/shared/protocol.ts` and the extension-host message contract; this remains
  webview-local state.
- `src/diagram/layoutFile.ts` and saved-layout serialization.
- `src/diagram/graph.ts`, lineage expansion, and external-node behavior.
- Details-sidebar editing, model/source write-back, and initial-cap behavior.
- Static documentation menu/filter behavior beyond the shared `FilterSidebar`
  presentation and hook semantics it already consumes.

## Acceptance Criteria

- [ ] Filter controls are grouped as Models > Files/Models and Sources > Files/Sources.
- [ ] File selections narrow entity lists but never directly add or remove diagram tables.
- [ ] Entity selections remain the sole local model/source diagram-membership control.
- [ ] Entity All/None affects only entities available in the current file scope.
- [ ] Model and source file scopes remain independent.
- [ ] Saved-layout tables remain displayed while the user changes file scope.
- [ ] Empty file scope displays `No files selected`.
- [ ] `npm run verify` is green.
