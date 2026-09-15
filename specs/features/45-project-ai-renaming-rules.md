---
id: 45
title: Configure AI renaming rules per dbt project
status: done
priority: high
created: 2026-09-15
owner: unassigned
depends_on: [42, 43]
---

# Configure AI renaming rules per dbt project

## Summary

As a dbt developer, I want each dbt project to provide its own AI renaming
rules in `.dbtiagram/ai_renaming_rules.md`, so that exported prompts follow the
project's naming conventions and AI rename actions are unavailable when the
project has not explicitly configured them.

## Background

Feature 42 bundles one fixed rules file inside the extension. Those rules apply
to every workspace and can only be changed by rebuilding the extension. A dbt
workspace may instead contain one or more projects with different naming
standards. This feature moves only the user-configurable naming instructions to
each dbt project while retaining dbtiagram's evidence format and strict response
contract.

## Scope

**In scope**

- Resolve a model's dbt project as its nearest ancestor directory containing
  `dbt_project.yml`, bounded by that model's VS Code workspace folder.
- Read that project's `.dbtiagram/ai_renaming_rules.md` as the naming/type rules
  used by prompt export.
- Always include dbtiagram-owned task context explaining that columns are being
  renamed and typed from current model and source metadata; the project file
  supplies only the rules for choosing new names and data types.
- Keep the model-mode **AI renaming** submenu visible but grey it out when the
  file is missing, blank, unreadable, or no dbt project root can be resolved.
- Explain the disabled state with a tooltip and refresh availability after
  saved project/rules-file changes without restarting VS Code.
- Re-read the rules from disk for every export and before every import, so a
  stale or crafted webview request cannot bypass availability.
- Support models belonging to different dbt projects in a multi-root or nested
  project workspace.

**Out of scope**

- A default/fallback rules prompt, a settings-based rules path, or creating the
  `.dbtiagram` directory/file from the extension.
- Allowing a project rules file to replace dbtiagram's model context, JSONL
  evidence, or strict JSON response contract.
- Changing AI response validation, rename/type application, batching,
  provenance eligibility, or source-mode behavior.
- Watching unsaved editor contents; availability and exports use saved files.

## Scenarios

### Export with project-specific rules

```
Given model orders is declared below a dbt project root containing dbt_project.yml
And that root contains a non-blank .dbtiagram/ai_renaming_rules.md with "Use ACME vocabulary."
When the user exports an AI rename prompt for orders
Then the copied prompt starts with "Rename each input column and choose its data type. The JSONL input describes the current dbt model columns and their source metadata. Apply the project-specific naming and data-type rules below."
And "Use ACME vocabulary." follows that task context
And dbtiagram appends the model context, JSONL evidence, and strict JSON response contract
And the former bundled uppercase and prefix rules are absent unless the project file contains them
```

### Disable AI renaming when rules are unavailable

```
Given model orders has no non-blank readable .dbtiagram/ai_renaming_rules.md in its nearest dbt project root
When the user opens the table or column context menu for orders
Then the AI renaming submenu remains visible and is greyed out
And its tooltip is "AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root."
And neither export nor import can be invoked
```

### Refresh availability after a saved rules-file change

```
Given the AI renaming submenu for orders is disabled
When the user creates and saves a non-blank .dbtiagram/ai_renaming_rules.md in orders' dbt project root
Then the open diagram enables the AI renaming submenu without being restarted
When the user deletes the file or saves only whitespace into it
Then the open diagram disables the submenu again
```

### Use the nearest project in nested and multi-root workspaces

```
Given the workspace contains multiple dbt_project.yml files
And a model file has more than one dbt_project.yml ancestor
When dbtiagram resolves that model's AI renaming rules
Then it uses .dbtiagram/ai_renaming_rules.md from the nearest ancestor project
And it never searches above the VS Code workspace folder containing the model
```

### Reject stale or crafted AI requests

```
Given the webview previously learned that AI renaming was available for orders
And the project's rules file is then removed or made blank
When a stale export or import request reaches the extension host
Then no clipboard export, clipboard import, or YAML mutation occurs
And the diagram reports "AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root."
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/aiPromptRules.md` | delete | Remove the extension-bundled fallback rules so projects must opt in explicitly. |
| `src/dbt/aiPrompt.ts` | modify | Accept caller-supplied project rules while retaining deterministic evidence and response-contract generation. |
| `src/shared/aiRenaming.ts` | create | Hold the cross-layer rules path, unavailable tooltip/error text, and pure non-blank-rules predicate. |
| `src/shared/protocol.ts` | modify | Publish the model names whose project rules are currently available. |
| `src/webview/aiPromptProjectRules.ts` | create | Purely orchestrate nearest-project marker discovery and rules loading through a URI/file host port. |
| `src/vscode/aiRenamingRules.ts` | create | Resolve the nearest dbt project root, read its saved rules file, and watch saved marker/rules changes through VS Code APIs. |
| `src/webview/aiPromptExport.ts` | modify | Load and require current project rules before building/copying a prompt, and return copied batch metadata. |
| `src/webview/aiPromptImport.ts` | modify | Require current project rules before reading or applying a clipboard response. |
| `src/webview/aiPromptAvailability.ts` | create | Purely derive available model names from model-file records through a narrow asynchronous rules-loader port. |
| `src/webview/panel.ts` | modify | Wire model files to project rules, publish availability, refresh it after watched changes, and guard both export and import using fresh rules. |
| `webview-ui/App.tsx` | modify | Track host-published availability and render the always-visible AI submenu enabled or greyed out per model. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch AI-renaming availability messages to React state. |
| `test/unit/dbt/aiPrompt.test.ts` | modify | Verify caller-provided rules replace the former bundled rules while the generated contract remains intact. |
| `test/unit/webview/aiPromptExport.test.ts` | modify | Verify current rules loading, unavailable rejection, clipboard behavior, and returned batch metadata. |
| `test/unit/webview/aiPromptImport.test.ts` | modify | Verify unavailable rules stop import before clipboard access or mutation. |
| `test/unit/webview/aiPromptAvailability.test.ts` | create | Verify per-file asynchronous rules availability, unique model names, and mixed-project results. |
| `test/unit/shared/aiRenaming.test.ts` | create | Verify blank/non-blank rules classification and exact shared path/message constants. |
| `test/unit/webview/aiPromptProjectRules.test.ts` | create | Verify nearest-root selection, workspace-boundary handling, missing markers/rules, blank rules, and read failures. |
| `specs/ARCHITECTURE.md` | modify | Remove the bundled rules responsibility and document the new shared and VS Code wrapper modules plus changed prompt/panel responsibilities. |
| `specs/README.md` | modify | Add feature 45 and track its lifecycle status. |

### Signatures

```ts
// src/dbt/aiPrompt.ts (pure — must not import `vscode`)
export function buildAiRenameTypePrompt(batch: AiPromptBatch, rules: string): string;
```

```ts
// src/shared/aiRenaming.ts (shared/pure — must not import `vscode`)
export const AI_RENAMING_RULES_RELATIVE_PATH: '.dbtiagram/ai_renaming_rules.md';
export const AI_RENAMING_UNAVAILABLE_REASON: 'AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.';
export function hasAiRenamingRules(rules: string | undefined): rules is string;
```

```ts
// src/shared/protocol.ts (shared — must not import `vscode`)
// Add to MessageToWebview:
// { type: 'aiPrompt:availability'; models: string[] }
```

```ts
// src/webview/aiPromptProjectRules.ts (pure — must not import `vscode`)
export interface AiPromptProjectRulesHost {
  parent(uri: string): string | undefined;
  join(base: string, ...segments: string[]): string;
  sameUri(left: string, right: string): boolean;
  isFile(uri: string): Promise<boolean>;
  readText(uri: string): Promise<string | undefined>;
}
export async function loadAiRenamingRulesFromProject(
  host: AiPromptProjectRulesHost,
  modelFileUri: string,
  workspaceFolderUri: string,
): Promise<string | undefined>;
```

```ts
// src/vscode/aiRenamingRules.ts (vscode-facing)
export async function readAiRenamingRules(modelFileUri: vscode.Uri): Promise<string | undefined>;
export function registerAiRenamingRulesWatcher(onChanged: () => void): vscode.Disposable[];
```

```ts
// src/webview/aiPromptExport.ts (pure host orchestration — must not import `vscode`)
export interface AiPromptExportHost {
  findModel(name: string): ModelDefinition | undefined;
  loadRules(model: string): Promise<string | undefined>;
  clipboard: AiPromptClipboard;
}
export async function copyAiRenameTypePrompt(
  host: AiPromptExportHost,
  request: AiPromptRequest,
): Promise<AiPromptBatch>;
```

```ts
// src/webview/aiPromptImport.ts (pure host orchestration — must not import `vscode`)
export interface AiPromptImportHost {
  findModel(name: string): ModelDefinition | undefined;
  loadRules(model: string): Promise<string | undefined>;
  clipboard: AiPromptImportClipboard;
  notifier: AiPromptImportNotifier;
  applyAndPersist(edit: ModelEdit): Promise<void>;
}
```

```ts
// src/webview/aiPromptAvailability.ts (pure — must not import `vscode`)
export interface AiPromptModelFile {
  uri: string;
  models: string[];
}
export interface AiPromptRulesLoader {
  load(modelFileUri: string): Promise<string | undefined>;
}
export async function availableAiRenamingModels(
  files: readonly AiPromptModelFile[],
  loader: AiPromptRulesLoader,
): Promise<string[]>;
```

```ts
// webview-ui/hooks/useHostMessages.ts (webview)
// Add to HostMessageHandlers:
// onAiPromptAvailability: (models: string[]) => void;
```

### Behavior notes

1. **Project resolution.** Starting at the directory containing a model YAML
   file, inspect that directory and each parent for a regular
   `dbt_project.yml`. Stop at and include the containing VS Code workspace
   folder; never inspect its parent. The first marker found is the model's dbt
   project root. If no containing workspace folder or marker exists, rules are
   unavailable. Nested projects therefore override outer projects. Each model
   is resolved independently, including in multi-root workspaces. The pure
   traversal stops immediately after inspecting the workspace root and never
   asks its host for that directory's parent.
2. **Rules loading.** At the resolved root, read exactly
   `.dbtiagram/ai_renaming_rules.md` as UTF-8. A missing file, directory in place
   of the file, read failure, or content whose `trim()` is empty is unavailable.
   Preserve the file text as authored except that prompt construction trims
   leading/trailing whitespace before concatenation.
3. **Prompt ownership.** The project Markdown replaces only the former contents
   of `src/dbt/aiPromptRules.md`. Every prompt starts with the dbtiagram-owned
   text `Rename each input column and choose its data type. The JSONL input
   describes the current dbt model columns and their source metadata. Apply the
   project-specific naming and data-type rules below.`, followed by the trimmed
   project rules. `buildAiRenameTypePrompt` then appends the model/source/batch
   headers, JSONL legend and evidence, and exact strict response instructions
   defined by feature 42. There is no bundled fallback. The project Markdown is
   responsible only for rules governing new names and data types; it cannot
   remove or replace dbtiagram's task context, evidence, or response contract.
4. **Availability protocol and UI.** In model mode, the host publishes
   `aiPrompt:availability` with unique model names having non-blank readable
   rules. It publishes on `webview:ready`, after model refreshes that can change
   model-to-file association, and after saved creation/change/deletion of any
   `dbt_project.yml` or `.dbtiagram/ai_renaming_rules.md`. The webview starts
   with no available models and replaces its set on every message. The existing
   **AI renaming** submenu remains present in model mode. For an unavailable
   model its parent item has `disabled: true`, has the exact shared unavailable
   reason as `title`, appears grey through existing context-menu disabled
   styling, and cannot open either child. Source mode remains unchanged with no
   AI submenu.
5. **Fresh host guard.** Export reads rules once for the current model at request
   time and passes that exact text to the prompt builder. Import also re-reads
   and validates rules before reading the clipboard. If unavailable, either
   path throws the exact shared unavailable reason through `diagram:error` and
   performs no clipboard operation or mutation. This guard applies even to
   crafted/stale messages. Successful import behavior otherwise remains feature
   43 behavior.
6. **Export notification.** `copyAiRenameTypePrompt` returns the batch it copied,
   allowing the panel to show the existing notification without independently
   rebuilding the batch. All feature-42 validation errors and notification text
   remain unchanged.
7. **Watcher scope.** Watch saved file-system and saved text-document changes for
   `**/dbt_project.yml` and `**/.dbtiagram/ai_renaming_rules.md`. Coalescing is
   not required; every relevant callback may trigger a complete availability
   recomputation. Rules are not written by dbtiagram.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/aiRenaming.test.ts` | `defines the project rules path and unavailable reason` | exported constants | path equals `.dbtiagram/ai_renaming_rules.md`; reason equals `AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.` |
| `test/unit/shared/aiRenaming.test.ts` | `accepts only non-blank rules` | `undefined`, `''`, `' \r\n '`, and `'Use ACME names.\n'` | respectively `false`, `false`, `false`, `true` |
| `test/unit/webview/aiPromptProjectRules.test.ts` | `uses rules from the nearest dbt project root` | model `/workspace/outer/nested/models/orders.yml`; marker/rules under both `/workspace/outer` and `/workspace/outer/nested` | returns the nested rules text and never reads outer rules |
| `test/unit/webview/aiPromptProjectRules.test.ts` | `stops after inspecting the workspace root` | model `/workspace/models/orders.yml`, workspace `/workspace`, no marker | returns `undefined` and never calls `parent('/workspace')` or checks `/dbt_project.yml` |
| `test/unit/webview/aiPromptProjectRules.test.ts` | `treats missing blank and unreadable rules as unavailable` | nearest project marker exists; rules respectively missing, `' \n '`, and read returns `undefined` | returns `undefined` for all three |
| `test/unit/dbt/aiPrompt.test.ts` | `uses caller-provided project rules and retains the generated contract` | one-column batch plus rules `Use ACME vocabulary.` | prompt starts with the exact dbtiagram task context, places `Use ACME vocabulary.` immediately after it, contains JSONL evidence and `Respond with exactly one valid JSON object`, and does not contain the former `ID_`, `DES_`, or `TYP_` rules |
| `test/unit/webview/aiPromptExport.test.ts` | `loads project rules and returns the copied batch` | current model, loader resolves `Use ACME vocabulary.`, batch 1 of 1 | loader receives the current model once; clipboard receives one prompt starting with those rules; result matches `{ model: 'costs_from_source', number: 1, total: 1 }` |
| `test/unit/webview/aiPromptExport.test.ts` | `rejects missing or blank project rules before copying` | loader resolves `undefined`, then whitespace | each call rejects exact unavailable reason and clipboard call count remains `0` |
| `test/unit/webview/aiPromptExport.test.ts` | `does not load rules for a stale model` | model lookup returns `undefined` | rejects `Model "costs_from_source" is no longer available.`, loader and clipboard are not called |
| `test/unit/webview/aiPromptImport.test.ts` | `rejects unavailable rules before reading the clipboard` | current model and rules loader resolves `undefined` | rejects exact unavailable reason; clipboard, persistence, and notifier calls remain `0` |
| `test/unit/webview/aiPromptAvailability.test.ts` | `reports unique models only from files with rules` | outer-project file with models `orders`, `customers` and rules; nested-project file with `payments` and blank rules; second file repeats `orders` with rules | result is exactly `['orders', 'customers']` in first-seen model order; each file URI is loaded once |

Nearest-root discovery, saved-file watcher behavior, disabled submenu rendering
and tooltip behavior, and the import host guard are covered by Manual Verify
because they depend on VS Code workspace/file-system APIs or the webview DOM.

### Verification

- `npm run verify` — strict typecheck and all unit suites must pass.
- `npm test` — unit and VS Code integration suites must pass before commit.
- `npm run typecheck` — final explicit strict TypeScript check must pass.
- Manual Verify (F5): open models in a single project, nested projects, and two
  workspace roots; confirm nearest-project rules appear in copied prompts;
  confirm missing/blank rules leave **AI renaming** visible, grey, and showing
  the exact tooltip; create, edit, blank, and delete the saved rules file while
  the panel remains open; confirm availability refreshes; remove the file after
  opening the export dialog and confirm export/import requests perform no
  clipboard/YAML operation and show the exact error.

### Do not touch

- AI response schema/validation, accepted-result conflict filtering, rename/type
  mutation semantics, FK updates, YAML parsing/serialization/merge, and source
  import provenance.
- Batch-dialog controls, eligible-column rules, JSONL evidence fields, existing
  success/failure notification wording, source-mode menus, layouts, filters,
  fields matrix, settings, package configuration, fixtures, and update behavior.
- `esbuild.config.mjs`, `vitest.config.ts`, and `webview-ui/vscode.d.ts`; their
  generic Markdown loader/declaration may remain even though the bundled rules
  import is removed.

## Acceptance Criteria

- [ ] Every model resolves rules from its nearest ancestor dbt project, bounded
      by its containing VS Code workspace folder.
- [ ] A non-blank project rules file replaces the bundled naming rules while
      dbtiagram retains its task context, evidence, and strict response contract.
- [ ] Missing, blank, or unreadable rules keep **AI renaming** visible but greyed
      out with the exact explanatory tooltip.
- [ ] Saved project/rules changes update open-panel availability without restart.
- [ ] Export and import re-check current rules and cannot operate after they
      become unavailable.
- [ ] Nested and multi-root dbt projects use their own nearest rules files.
- [ ] No fallback naming rules are bundled.
- [ ] No file outside the Implementation Plan Files table is modified.
- [ ] `npm test` and `npm run typecheck` are green after implementation.
