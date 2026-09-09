---
id: 42
title: Copy an AI column rename and type prompt
status: approved
priority: high
created: 2026-09-08
owner: unassigned
depends_on: [41]
---

# Copy an AI column rename and type prompt

## Summary

As a dbt developer refining an imported source model into a silver model, I
want to copy a compact, batched AI prompt containing a table's source
provenance and column evidence, so that I can obtain consistent suggested
column names and data types from my chosen AI chat without giving the
extension access to that service.

## Background

Feature 41 imports a source table as a model and records table provenance in
`config.meta.source_name` plus column provenance such as `source_name`,
`source_datatype`, `source_sample_values`, `source_length`, and
`source_max_length` in `config.meta`. This feature exports that already-known
evidence only; it does not query the warehouse or change model YAML. A later
feature will validate, preview, and apply the AI's clipboard JSON response.

## Scope

**In scope**

- A model-mode table context-menu submenu named **AI renaming**, containing an
  **Export prompt** action available for every model.
- A webview batch dialog that lets the user select a batch number and choose
  25, 50, or 100 eligible columns per batch, or enter a custom positive integer
  batch size.
- Generation of a compact JSON Lines (JSONL) prompt from column provenance and
  a source-table label, copied through the VS Code clipboard and confirmed with
  a VS Code information notification.
- A bundled, plain Markdown rules/instructions file whose initial content
  requires uppercase names and the `ID_`, `DES_`, and `TYP_` prefixes only.
- A strict JSON response contract intended for the later clipboard-import
  feature.

**Out of scope**

- Calling an AI service, storing credentials, or adding an AI-agent framework.
- Reading sample rows from a database, running dbt, or changing source/model
  YAML.
- Applying, validating, previewing, or importing an AI response from the
  clipboard.
- Exporting non-provenance columns, changing the rules at runtime, or adding a
  workspace setting for rules.
- CSV prompt input or an alternative output protocol.

## Scenarios

### Copy the first prompt batch for an imported model

```
Given model costs_from_source has config.meta.source_name "costs"
And its eligible id column has current name "id", current data type "integer",
  description "Raw cost identifier", and source metadata source_name "id",
  source_datatype "integer", source_sample_values [1, 2, 3], source_length 10,
  and source_max_length 3
When the user selects "AI renaming > Export prompt", chooses 25 columns per batch,
  and copies batch 1
Then the VS Code clipboard receives a prompt for costs_from_source batch 1 of 1
And that prompt contains the bundled naming rules, the JSONL legend, and the id evidence record
And VS Code shows "AI rename/type prompt for costs_from_source batch 1 of 1 copied to the clipboard."
```

### Exclude columns without required source provenance

```
Given imported model costs_from_source has one column with source_name "id" and source_datatype "integer"
And it has another column with no source_name or source_datatype metadata
When the user opens the prompt batch dialog
Then the dialog reports 1 eligible column and 1 batch for a batch size of 25
When the user copies that batch
Then the prompt contains only the provenance-backed id column
```

### Copy a selected batch from a long table

```
Given model costs_from_source has 101 eligible columns in model column order
When the user chooses 50 columns per batch and batch number 3
Then the dialog reports 3 batches
When the user copies batch 3
Then the prompt identifies itself as batch 3 of 3
And its JSONL input contains exactly the final eligible column
```

### Use a custom batch size and reject an invalid batch request

```
Given model costs_from_source has 60 eligible columns
When the user enters custom batch size 30
Then the dialog reports 2 batches
Given a crafted message requests batch size 0 or batch number 3
When the extension handles the copy request
Then it does not write to the clipboard
And it reports the invalid request as a diagram error
```

### Require a machine-readable AI response

```
Given the extension copies a prompt for costs_from_source batch 2 of 3
When the user reads the prompt's response instructions
Then it requires one JSON object only, without Markdown fences or commentary
And it requires model "costs_from_source" and batch number 2 of 3
And it requires exactly one result for every input column and no other columns, keyed by unchanged source_name
And each result has only source_name, new_name, and data_type
```

### Export an unimported model using its model name as the source table

```
Given a source-mode diagram is open
Then table context menus do not show "AI renaming"
Given a model-mode table has no non-blank config.meta.source_name
When the user copies an AI prompt for that model
Then its prompt identifies the model name as its source table
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/aiPromptRules.md` | create | Bundled, plainly editable initial AI task instructions and naming/type rules. |
| `esbuild.config.mjs` | modify | Configure the Markdown text loader so the bundled AI rules can be imported as a string. |
| `webview-ui/vscode.d.ts` | modify | Declare Markdown imports as strings for strict TypeScript. |
| `vitest.config.ts` | create | Load bundled Markdown rules as text in unit tests. |
| `src/dbt/aiPrompt.ts` | create | Pure eligibility, batching, JSON-safe evidence normalization, and deterministic prompt construction. |
| `src/shared/protocol.ts` | modify | Add the typed webview-to-host prompt-copy request. |
| `src/vscode/clipboard.ts` | create | Isolate VS Code clipboard writes and success information notification. |
| `src/webview/aiPromptExport.ts` | create | Pure host orchestration and validation against a narrow clipboard port. |
| `src/webview/panel.ts` | modify | Resolve a model from the panel store, generate the requested batch, and invoke the clipboard wrapper in model mode only. |
| `webview-ui/AiPromptExport.tsx` | create | Render the batch-size/batch-number dialog and post valid copy requests. |
| `webview-ui/App.tsx` | modify | Own prompt-dialog visibility, expose the model-mode table-menu action, and mount the dialog. |
| `webview-ui/icons.ts` | modify | Re-export the `PencilSparkles` icon for the AI renaming submenu and the clipboard-copy icon for Export prompt. |
| `webview-ui/styles.css` | modify | Style the AI prompt batch dialog. |
| `test/unit/dbt/aiPrompt.test.ts` | create | Unit-test eligibility, batch selection, JSONL evidence, rules, and response contract. |
| `test/unit/webview/aiPromptExport.test.ts` | create | Unit-test host-side model lookup, validation, clipboard call, and no-copy failure paths. |
| `specs/ARCHITECTURE.md` | modify | Add new modules/components and amend the changed panel/protocol responsibilities. |
| `specs/README.md` | modify | Track feature 42 lifecycle status. |

### Signatures

```ts
// src/dbt/aiPrompt.ts (pure — must not import `vscode`)
import type { ModelDefinition } from './types';

export interface AiPromptColumn {
  sourceName: string;
  currentName: string;
  currentDataType?: string;
  description?: string;
  sourceDataType: string;
  sampleValues?: unknown[];
  sourceLength?: unknown;
  sourceMaxLength?: unknown;
}
export interface AiPromptBatch {
  model: string;
  sourceTable: string;
  number: number;
  total: number;
  columns: AiPromptColumn[];
}
export interface AiPromptRequest {
  model: string;
  batchSize: number;
  batchNumber: number;
}
export function eligibleAiPromptColumns(model: ModelDefinition): AiPromptColumn[];
export function aiPromptBatch(model: ModelDefinition, request: AiPromptRequest): AiPromptBatch;
export function buildAiRenameTypePrompt(batch: AiPromptBatch): string;
```

```ts
// src/webview/aiPromptExport.ts (pure host orchestration — must not import `vscode`)
import type { ModelDefinition } from '../dbt/types';
import type { AiPromptRequest } from '../dbt/aiPrompt';

export interface AiPromptClipboard {
  copy(text: string): Promise<void>;
}
export interface AiPromptExportHost {
  findModel(name: string): ModelDefinition | undefined;
  clipboard: AiPromptClipboard;
}
export async function copyAiRenameTypePrompt(host: AiPromptExportHost, request: AiPromptRequest): Promise<void>;
```

```ts
// src/vscode/clipboard.ts (vscode-facing)
import type { AiPromptClipboard } from '../webview/aiPromptExport';

export const vscodeAiPromptClipboard: AiPromptClipboard;
export function showAiPromptCopied(model: string, batchNumber: number, totalBatches: number): Promise<string | undefined>;
```

```ts
// webview-ui/AiPromptExport.tsx (webview)
export interface AiPromptExportProps {
  model: string;
  eligibleColumnCount: number;
  onCopy: (batchSize: number, batchNumber: number) => void;
  onClose: () => void;
}
export function AiPromptExport(props: AiPromptExportProps): JSX.Element;
```

```ts
// src/shared/protocol.ts (shared — changed; must not import `vscode`)
// Add to MessageToExtension:
// { type: 'aiPrompt:copy'; model: string; batchSize: number; batchNumber: number }
```

### Behavior notes

1. **Entry point and availability.** Add an `AI renaming` submenu to the
   existing table/column context menu in model mode only. Its sole child is
   `Export prompt`; `AI renaming` uses the `PencilSparkles` icon and `Export
   prompt` uses the clipboard-copy icon. It operates on the containing table
   even when opened from a column row. `Export prompt` is
   enabled for every model. Source-mode menus contain no `AI renaming` submenu.
   Do not render
   an `Import JSON prompt output` item or any other placeholder. Selecting an
   enabled `Export prompt` item opens the batch dialog; it does not copy
   immediately.
2. **Eligible columns.** A column is eligible only when both
   `config.meta.source_name` and `config.meta.source_datatype` are non-blank
   strings. Preserve eligible columns in their model YAML order. Omit every
   other column completely, even if it has some source-prefixed metadata. The
   dialog reports the eligible count and derives the total batches as
   `ceil(count / batchSize)`. A model with zero eligible columns has a disabled
   Copy button and the exact message `No columns with source name and data type
   provenance are available to export.`
3. **Batch dialog.** The dialog title is `Copy AI rename/type prompt`. It shows
   `Eligible columns: <N>`. Its batch-size control has choices `25`, `50`,
   `100`, and `Custom`; `25` is initial. Choosing Custom reveals an integer
   input initially set to `25`. A batch-number integer input starts at `1` and
   is constrained to `1` through the currently displayed total. The dialog
   updates `Batches: <total>` as valid inputs change. **Copy prompt** posts
   `aiPrompt:copy` and closes; **Cancel**, Escape, and backdrop click close it
   without posting.
4. **Host validation.** The host processes `aiPrompt:copy` only in model mode.
   It finds the named model in the current last-good model store. A missing model
   throws `Model "<name>" is no longer available.` A non-integer or less-than-1
   batch size throws `Batch size must be a positive integer.` A non-integer,
   less-than-1, or greater-than-total batch number throws `Batch number must be
   between 1 and <total>.` A model with no eligible columns throws `Model
   "<name>" has no eligible columns to export.` Errors
   travel through the existing `diagram:error` message and never write the
   clipboard.
5. **Prompt form.** `aiPromptRules.md` is imported as bundled text, so editing
   that single plain Markdown file changes the fixed instructions in future
   extension builds. Its initial rules say exactly: proposed names must be
   uppercase; identifier columns use `ID_`; description/text columns use
   `DES_`; type/category columns use `TYP_`; and no other prefixes are allowed.
   The generated prompt appends: model, source table (the non-blank
   `config.meta.source_name` when present, otherwise the model name), `Batch
   <number> of <total>`, a one-time JSONL legend, one JSON object per eligible column in the
   selected batch, and the strict response schema/instructions below. The rules
   file must also tell the AI to infer semantic category from names,
   descriptions, types, and samples, and not from row position.
6. **JSONL evidence.** Every line is one object with compact keys:
   `s` source name, `n` current model name, `t` current model data type, `d`
   description, `st` source data type, `v` source sample values, `l` source
   length, and `m` source maximum observed length. `s`, `n`, and `st` always
   appear. Optional current type/description/provenance values are omitted when
   absent. Values from metadata are JSON-safe: null, boolean, finite number,
   and string values remain values; arrays/maps and other scalar values become
   compact JSON strings; non-finite numbers become strings. This prevents one
   unusual YAML metadata value from producing invalid JSONL. No source metadata
   other than the named evidence keys is included.
7. **Response contract.** The prompt ends by demanding exactly one valid JSON
   object, with no Markdown fence, prose, or extra keys. It must be:

   ```json
   {
     "model": "costs_from_source",
     "batch": { "number": 1, "total": 3 },
     "columns": [
       { "source_name": "id", "new_name": "ID_COST", "data_type": "INTEGER" }
     ]
   }
   ```

   The dynamic example values match the current model and selected batch. The
   instructions require exactly one result for every supplied JSONL line and no
   other column, preserve `source_name` byte-for-byte, and permit only
   `source_name`, `new_name`, and `data_type` inside each result. This feature
   does not parse that response.
8. **Clipboard and confirmation.** After successful construction, the host uses
   `vscode.env.clipboard.writeText` through `vscodeAiPromptClipboard`, then calls
   `showInformationMessage` with exactly `AI rename/type prompt for <model>
   batch <number> of <total> copied to the clipboard.` The information message
   follows a successful write only. No YAML, model store, filter, or layout state
   is changed.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/aiPrompt.test.ts` | `selects only columns with source name and data type provenance` | model `costs_from_source`, columns `id` with `source_name: id`, `source_datatype: integer`; `notes` without provenance | eligible result is exactly one column `{ sourceName: 'id', currentName: 'id', sourceDataType: 'integer' }` |
| `test/unit/dbt/aiPrompt.test.ts` | `builds compact JSONL evidence and strict response instructions` | one eligible `id` column with current type `integer`, description `Raw cost identifier`, samples `[1,2,3]`, length `10`, max `3`; source table `costs` | prompt contains legend, line `{"s":"id","n":"id","t":"integer","d":"Raw cost identifier","st":"integer","v":[1,2,3],"l":10,"m":3}`, and response fields `source_name`, `new_name`, `data_type` |
| `test/unit/dbt/aiPrompt.test.ts` | `selects the final partial batch in model order` | 101 eligible columns `c1` through `c101`; request `{ model: 'costs_from_source', batchSize: 50, batchNumber: 3 }` | batch is `{ number: 3, total: 3 }` and columns are exactly `[c101]` |
| `test/unit/dbt/aiPrompt.test.ts` | `normalizes non-JSON metadata without invalid JSONL` | samples `[{ code: 'A' }, Infinity]` and length `{ value: 10 }` | parsed JSONL has `v: ['{"code":"A"}', 'Infinity']` and `l: '{"value":10}'` |
| `test/unit/dbt/aiPrompt.test.ts` | `rejects invalid batch requests` | 60 eligible columns with batch sizes `0`, `1.5`, or batch number `3` at size `30` | throws respectively `Batch size must be a positive integer.` and `Batch number must be between 1 and 2.` |
| `test/unit/webview/aiPromptExport.test.ts` | `copies a generated prompt for a current model` | host finds provenance-backed `costs_from_source`; request `{ model: 'costs_from_source', batchSize: 25, batchNumber: 1 }` | clipboard `copy` is called once with a prompt containing `Batch 1 of 1` |
| `test/unit/webview/aiPromptExport.test.ts` | `uses the model name when model provenance is absent` | model `costs_from_source` with eligible columns and no table source name | clipboard prompt contains `Source table: costs_from_source` |
| `test/unit/webview/aiPromptExport.test.ts` | `does not copy an invalid batch` | 60 eligible columns; request batch size `30`, batch number `3` | rejects `Batch number must be between 1 and 2.` and copy calls `0` |

The context-menu placement/icon, dialog interaction/dismissal, native
clipboard behavior, and VS Code information notification are covered by Manual
Verify because the project has no webview component harness and the clipboard is
a VS Code API. The pure generator and host orchestration are unit-tested.

### Verification

- `npm run verify` — strict typecheck and all unit suites must pass.
- `npm test` — unit and VS Code integration suites must pass before commit.
- Manual Verify (F5): open an imported and unimported model table and column
  context menus; copy batches using 25, 50, 100, and a custom size; paste each
  result into a text editor and AI chat; confirm the AI-renaming
  `PencilSparkles` and export clipboard-copy icons, copied prompt,
  source-table fallback, notification, final partial batch,
  source-mode absence, and no YAML modifications.

### Do not touch

- Model/source parsing, import conversion/provenance semantics, YAML merge and
  serialization, edit application, graph/layout/filter behavior, and source
  mode beyond hiding this new model-only menu action.
- The existing source-import picker/report flow, SQL-file behavior, fields
  matrix, settings, command registration, package configuration, fixtures, and
  diagram layout format.
- Any clipboard-response parsing or model mutation; those belong exclusively to
  the later import/apply feature.

## Acceptance Criteria

- [ ] All models offer a batchable **AI renaming > Export prompt** action only
      in model mode; no import-output placeholder is shown.
- [ ] The copied prompt uses compact JSONL evidence, editable bundled Markdown
      rules, and the specified strict JSON response contract.
- [ ] Columns without both required source name and source data type provenance
      are excluded.
- [ ] Default and custom positive batch sizes select the requested model-order
      block and identify its batch number/total correctly.
- [ ] A successful copy writes the prompt to the VS Code clipboard and displays
      the exact success notification.
- [ ] Invalid/stale requests copy nothing and surface the specified error.
- [ ] No YAML file is changed by prompt export.
- [ ] No file outside the Implementation Plan Files table is modified.
- [ ] `npm test` and `npm run typecheck` are green after implementation.
