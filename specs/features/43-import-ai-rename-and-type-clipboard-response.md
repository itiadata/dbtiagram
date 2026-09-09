---
id: 43
title: Import an AI rename and type clipboard response
status: approved
priority: high
created: 2026-09-09
owner: unassigned
depends_on: [42]
---

# Import an AI rename and type clipboard response

## Summary

As a dbt developer who has received an AI response to an exported rename/type
prompt, I want to import the response from my clipboard, so that valid column
names and data types are written back to the current model while invalid
results are clearly reported without blocking valid results.

## Background

Feature 42 exports provenance-backed column evidence and requires an AI to
return one JSON object with a model, batch metadata, and per-column proposed
names/types. This feature consumes that contract locally; it never contacts an
AI service. Clipboard content is untrusted, so malformed content and every
invalid response item must be reported clearly and must never corrupt YAML.

## Scope

**In scope**

- A model-mode **AI renaming → Import clipboard response** table/column
  context-menu action using the `ClipboardPaste` icon.
- Reading clipboard text through a VS Code wrapper, parsing the feature-42 JSON
  response contract, and validating it against the selected current model and
  its provenance-backed columns.
- Applying each independently valid proposed column rename and data type,
  preserving foreign-key references through the existing mutation funnel and
  persisting changed model YAML.
- A visible, unambiguous completion notification reporting success/failure,
  updated-column count, and rejected-result count; malformed clipboard content
  produces a visible failure report and no YAML changes.

**Out of scope**

- AI calls, credentials, prompt generation changes, clipboard copying, or
  remembering/exporting batch state.
- Preview, confirmation, undo, or manual editing of AI proposals before apply.
- Applying descriptions, provenance metadata, tests, constraints, or any keys
  other than column name and data type.
- Source-mode availability or imports for source tables.

## Scenarios

### Import a valid response for the current model

```
Given model costs_from_source has columns id and category with config.meta.source_name values "id" and "category"
And the clipboard contains valid JSON for model "costs_from_source", batch 1 of 1, with results { source_name: "id", new_name: "ID_COST", data_type: "INTEGER" } and { source_name: "category", new_name: "TYP_COST_CATEGORY", data_type: "VARCHAR" }
When the user selects "AI renaming > Import clipboard response" for costs_from_source
Then id is renamed to ID_COST and its data type is INTEGER
And category is renamed to TYP_COST_CATEGORY and its data type is VARCHAR
And VS Code shows "AI rename/type import completed: 2 columns updated; 0 results rejected."
```

### Reject malformed clipboard content without changing YAML

```
Given model costs_from_source has an id column
And the clipboard contains "not JSON"
When the user selects "AI renaming > Import clipboard response"
Then no model YAML is written
And VS Code shows "AI rename/type import failed: clipboard content is not valid JSON."
```

### Reject a response for a different or malformed contract

```
Given model costs_from_source has an id column with config.meta.source_name "id"
And the clipboard JSON has model "other_model" and otherwise valid response fields
When the user imports it for costs_from_source
Then no model YAML is written
And VS Code shows "AI rename/type import failed: response model \"other_model\" does not match current model \"costs_from_source\"."
Given the clipboard JSON lacks a positive-integer batch.number, batch.total, or columns array
When the user imports it for costs_from_source
Then no model YAML is written
And VS Code shows a failure notification that identifies the malformed response field
```

### Apply valid results while reporting individually invalid results

```
Given model costs_from_source has id and category columns with source_name values "id" and "category"
And the clipboard response has a valid id result plus results with unknown source_name "missing", blank new_name, and duplicate source_name "category"
When the user imports the response
Then only id is renamed and typed
And no invalid result changes a model column
And VS Code shows "AI rename/type import completed with issues: 1 column updated; 3 results rejected."
```

### Avoid unsafe or conflicting rename results

```
Given model costs_from_source has columns id and category with source_name values "id" and "category"
And the clipboard response proposes new_name "category" for id and a valid result for category
When the user imports the response
Then the conflicting id result is rejected
And the non-conflicting category result is applied
And the completion notification reports 1 updated column and 1 rejected result
```

### Limit the action to model-mode tables

```
Given a source-mode diagram is open
When the user opens a source table or source column context menu
Then it does not show "AI renaming"
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/aiPromptImport.ts` | create | Pure decoder, current-model/provenance validation, conflict filtering, and ordered import-result planning. |
| `src/dbt/edit/types.ts` | modify | Add the bulk AI rename/type mutation edit to the discriminated edit union. |
| `src/dbt/edit/index.ts` | modify | Dispatch the bulk import mutation through the sole model-edit funnel. |
| `src/dbt/edit/aiPromptImport.ts` | create | Apply accepted rename/type results while retaining FK-reference consistency and object identity for untouched models. |
| `src/shared/protocol.ts` | modify | Add the typed clipboard-import request from webview to host. |
| `src/vscode/clipboard.ts` | modify | Add the isolated clipboard reader and native success/failure import notifications. |
| `src/webview/aiPromptImport.ts` | create | Pure host orchestration that reads, validates, plans, and reports a clipboard import against narrow ports. |
| `src/webview/panel.ts` | modify | Handle the model-mode import message, persist accepted edits, and surface unexpected errors to the webview. |
| `webview-ui/App.tsx` | modify | Add the model-only context-menu import action and post its request. |
| `webview-ui/icons.ts` | modify | Re-export the `ClipboardPaste` icon. |
| `test/unit/dbt/aiPromptImport.test.ts` | create | Test response decoding, current-model/provenance matching, individual rejection, and collision filtering. |
| `test/unit/dbt/edit/aiPromptImport.test.ts` | create | Test accepted bulk rename/type application and FK reference maintenance. |
| `test/unit/webview/aiPromptImport.test.ts` | create | Test orchestration, clipboard reads, report selection, persistence edit request, and zero-change malformed/stale paths. |
| `specs/ARCHITECTURE.md` | modify | Record the new domain/edit/orchestration modules and amended responsibilities. |
| `specs/README.md` | modify | Track feature 43 lifecycle status. |

### Signatures

```ts
// src/dbt/aiPromptImport.ts (pure — must not import `vscode`)
import type { ModelDefinition } from './types';

export interface AiPromptImportColumn { sourceName: string; newName: string; dataType: string; }
export interface AiPromptImportPlan { accepted: AiPromptImportColumn[]; rejected: string[]; }
export function planAiRenameTypeImport(model: ModelDefinition, clipboardText: string): AiPromptImportPlan;
```

```ts
// src/dbt/edit/types.ts (pure — must not import `vscode`)
import type { AiPromptImportColumn } from '../aiPromptImport';
// Add to ModelEdit:
// { kind: 'applyAiPromptImport'; model: string; columns: AiPromptImportColumn[] }
```

```ts
// src/dbt/edit/aiPromptImport.ts (pure — must not import `vscode`)
import type { AiPromptImportColumn } from '../aiPromptImport';
import type { ApplyEditResult } from './internal';
import type { ModelDefinition } from '../types';
export function applyAiPromptImport(models: ModelDefinition[], model: string, columns: AiPromptImportColumn[]): ApplyEditResult;
```

```ts
// src/webview/aiPromptImport.ts (pure host orchestration — must not import `vscode`)
import type { ModelEdit } from '../dbt/edit';
import type { ModelDefinition } from '../dbt/types';
export interface AiPromptImportClipboard { paste(): Promise<string>; }
export interface AiPromptImportNotifier { completed(updated: number, rejected: number): Promise<void>; failed(message: string): Promise<void>; }
export interface AiPromptImportHost { findModel(name: string): ModelDefinition | undefined; clipboard: AiPromptImportClipboard; notifier: AiPromptImportNotifier; applyAndPersist(edit: ModelEdit): Promise<void>; }
export async function importAiRenameTypeClipboardResponse(host: AiPromptImportHost, model: string): Promise<void>;
```

```ts
// src/vscode/clipboard.ts (vscode-facing)
import type { AiPromptImportClipboard, AiPromptImportNotifier } from '../webview/aiPromptImport';
export const vscodeAiPromptImportClipboard: AiPromptImportClipboard;
export const vscodeAiPromptImportNotifier: AiPromptImportNotifier;
```

```ts
// src/shared/protocol.ts (shared — changed; must not import `vscode`)
// Add to MessageToExtension:
// { type: 'aiPrompt:import'; model: string }
```

### Behavior notes

1. **Entry point.** In model mode only, the existing `AI renaming` submenu has
   `Export prompt` followed by `Import clipboard response`. The import item uses
   `ClipboardPaste`, operates on its containing table when invoked from a column,
   and immediately reads the clipboard. Source-mode menus retain no AI submenu.
2. **Required top-level contract.** Clipboard text must parse as one JSON object
   (leading/trailing whitespace allowed), with exactly the keys `model`, `batch`,
   and `columns`. `model` is a non-blank string. `batch` has exactly positive
   integer `number` and `total` keys, and `number <= total`. `columns` is an
   array. A JSON parse failure reports exactly `AI rename/type import failed:
   clipboard content is not valid JSON.` A top-level violation reports `AI
   rename/type import failed: malformed response: <reason>.` and applies no
   changes. A mismatching model reports exactly `AI rename/type import failed:
   response model "<response>" does not match current model "<current>".`
3. **Result items and current-model matching.** Each item must be an object with
   exactly non-blank string `source_name`, `new_name`, and `data_type` keys.
   `source_name` must identify exactly one current column whose
   `config.meta.source_name` is the same non-blank string. No export state is
   persisted; `batch` is contract-validated but cannot be matched to a prior
   clipboard export. Each bad item is rejected independently, with no YAML
   mutation for it. Duplicate response `source_name` values reject the second
   and later entries.
4. **Conflict filtering and applying.** Before editing, reject a proposed
   `new_name` that duplicates another accepted proposal or an existing current
   column name not being renamed away by an accepted proposal. Accepted entries
   are applied as one bulk `applyAiPromptImport` mutation: each targets its
   current column by source provenance, changes its name and data type, and
   updates real and virtual FK column references exactly as existing rename
   behavior does. A valid item that would make no name/type change counts as
   updated. Empty `columns` is a valid completed import with zero updates.
5. **Reports and persistence.** If the response is structurally valid, persist
   once only when there is at least one accepted item. Then notify exactly
   `AI rename/type import completed: <updated> columns updated; 0 results
   rejected.` when rejected is zero, otherwise `AI rename/type import completed
   with issues: <updated> columns updated; <rejected> results rejected.` The
   notification must be native VS Code information for a clean completion and
   native VS Code warning for an issues completion or failure. Unexpected
   read/write errors travel through `diagram:error`; no success report is shown.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/aiPromptImport.test.ts` | `plans provenance-matched valid response items` | current `costs_from_source` columns `id`/`category` with matching source names; response has both valid results | `accepted` exactly `[{ sourceName: 'id', newName: 'ID_COST', dataType: 'INTEGER' }, { sourceName: 'category', newName: 'TYP_COST_CATEGORY', dataType: 'VARCHAR' }]`; `rejected` is `[]` |
| `test/unit/dbt/aiPromptImport.test.ts` | `rejects malformed JSON and mismatching response model` | `not JSON`; then valid shape with model `other_model` | throws exact parse message; then exact model mismatch message |
| `test/unit/dbt/aiPromptImport.test.ts` | `retains valid items while rejecting unknown blank and duplicate results` | valid `id`; unknown `missing`; blank `new_name`; two `category` items | one accepted `id`; exactly three rejection messages |
| `test/unit/dbt/aiPromptImport.test.ts` | `filters proposals that collide with an unchanged column` | columns `id` and `category`; `id → category`, `category → TYP_CATEGORY` | accepted only `category → TYP_CATEGORY`; rejected count `1` |
| `test/unit/dbt/edit/aiPromptImport.test.ts` | `applies accepted names types and FK references together` | model `orders` `id → ID_ORDER`, type `INTEGER`; another model FK `toColumns: ['id']` targeting orders | orders column is `ID_ORDER`/`INTEGER`; FK target column is `ID_ORDER` |
| `test/unit/webview/aiPromptImport.test.ts` | `persists accepted results and reports clean completion` | clipboard valid one-item response; current matching model | `applyAndPersist` receives `{ kind: 'applyAiPromptImport', model: 'costs_from_source', columns: [{ sourceName: 'id', newName: 'ID_COST', dataType: 'INTEGER' }] }`; notifier completed `(1, 0)` |
| `test/unit/webview/aiPromptImport.test.ts` | `reports partial completion without applying rejected results` | one valid and one unknown source result | persisted edit has only valid result; notifier completed `(1, 1)` |
| `test/unit/webview/aiPromptImport.test.ts` | `reports invalid clipboard without persisting` | clipboard `not JSON` | `applyAndPersist` calls `0`; notifier failed receives `clipboard content is not valid JSON.` |

The context-menu placement/icon, native clipboard behavior, notifications, and
on-disk YAML result are covered by Manual Verify because the project has no
webview component harness and clipboard/notifications require VS Code APIs.

### Verification

- `npm run verify` — strict typecheck and all unit suites must pass.
- `npm test` — unit and VS Code integration suites must pass before commit.
- Manual Verify (F5): in model mode, import a valid response, a partly invalid
  response, malformed JSON, a wrong-model response, and a rename collision;
  confirm `ClipboardPaste`, report wording/severity/counts, changed YAML and FK
  references for accepted entries, unchanged YAML for rejected-only imports,
  and source-mode submenu absence.

### Do not touch

- Feature-42 prompt rules, eligibility, batch generation, export behavior, and
  clipboard-copy notification wording.
- Model/source parsing, YAML merge and serialization semantics, source import,
  graph/layout/filter behavior, fields matrix, settings, command registration,
  package configuration, fixtures, and diagram layout format.
- Any persistent export/batch history, AI calls, preview/confirmation UI, or
  mutation outside the existing `applyEdit` funnel.

## Acceptance Criteria

- [ ] Model-mode AI menus offer `Import clipboard response` with `ClipboardPaste`;
      source-mode menus do not offer AI renaming.
- [ ] Valid contract results matching current provenance-backed columns rename
      and type columns, persist YAML, and maintain FK references.
- [ ] Malformed, wrong-model, stale, duplicate, blank, and conflicting results
      cannot mutate a column they do not validly describe.
- [ ] Valid results apply even when other items are rejected.
- [ ] Native completion/failure reporting clearly states whether the import
      succeeded, how many columns updated, and how many results were rejected.
- [ ] `npm test` and `npm run typecheck` are green after implementation.
