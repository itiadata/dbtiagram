---
id: 25
title: Reveal a specific column in model.yml
status: approved
priority: medium
created: 2026-08-28
owner: unassigned
depends_on: [15]
---

# Reveal a specific column in model.yml

## Summary

As a dbt developer inspecting a table's columns on the canvas, I want to
right-click a specific column row and get the table's usual context menu,
where `Reveal in model.yml` now jumps to that **column's** `name:` entry in
the model.yml instead of only the model's declaration line — so that I can
navigate from a column on the diagram to its exact YAML source without
hunting through the file, without losing access to the card's other actions.

## Background

Spec 15 added `Open in model.yml` to the sidebar's model rows and to a table
node's header context menu. Both resolve only the **model's** declaration line
via `findModelDeclaration`; there is no way to land on a specific column. The
table card already renders one row per column (`TableNode.tsx`) with hover and
click handlers, so a per-row context menu is a natural extension.

This feature also renames the action from `Open in model.yml` to
`Reveal in model.yml` everywhere it appears (sidebar rows and table header),
for consistency with the new column-level item and clearer wording — the
model-level behavior itself (which file opens, tab reuse, fallback to line 0)
is unchanged.

## Scope

**In scope**

- Right-clicking a **column row** opens the *same* context menu the table
  header already offers (`Reveal in model.yml`, the `Show columns` submenu,
  and any other existing header items), not a stripped-down menu.
- `Reveal in model.yml` behaves differently depending on where the menu was
  opened from: from a column row it selects that **column's** `name:` token;
  from the header (or anywhere else on the card that isn't a column row) it
  selects the **model's** `name:` token, exactly as spec 15 does today.
- A pure column locator, `findColumnDeclaration`, added to `src/dbt/locate.ts`,
  mapping (file text, model name, column name) to a `DeclarationPosition`.
- Extending `model:openSource` and `openModelSource` with an optional `column`
  so the same message/orchestration path serves both model-level and
  column-level reveals.
- Renaming the existing item label from `Open in model.yml` to
  `Reveal in model.yml` everywhere it appears: the sidebar's model rows, the
  table header menu, and the column-row menu (same label, different target).
- Graceful degradation: when the column cannot be located but the model can,
  fall back to the model's declaration line with a column-specific warning.

**Out of scope**

- Any change to the sidebar's `Reveal in diagram` item or reveal-in-diagram
  behavior.
- Any change to which file is chosen when duplicate model/column names exist
  (same store-order resolution as spec 15).
- A column-level entry in the sidebar's Models list (the sidebar list has no
  column rows).
- Any change to inline column editing, selection highlighting, or FK handles
  in `TableNode.tsx`.
- Any change to the `Show columns` submenu's own behavior — it is reused
  unchanged on the column-row menu.

## Scenarios

### Revealing a column from its row

```
Given the dbt Diagram is open showing the "orders" table with a "customer_id"
  column
When the user right-clicks the "customer_id" row
Then the same context menu as the table header appears, including
  "Reveal in model.yml" and the "Show columns" submenu
When the user chooses "Reveal in model.yml"
Then the model.yml declaring "orders" opens (reusing its tab if already open)
And "customer_id" is selected at its declaration line, scrolled into view
```

### The table header menu still reveals the model

```
Given the dbt Diagram is open
When the user right-clicks the "orders" table's header (not a column row)
Then a context menu appears including "Reveal in model.yml"
When the user chooses it
Then the model.yml declaring "orders" opens with the orders declaration line
  revealed (unchanged from spec 15, only the label changed)
```

### The column cannot be located but the model can

```
Given a model.yml that the parser accepts, where "orders" is declared but its
  "customer_id" column has no locatable name token (e.g. malformed columns list)
When the user chooses "Reveal in model.yml" for that column
Then the file opens with the cursor on the model's declaration line
And a warning names the column, the model, and the file
```

### The sidebar label is renamed

```
Given the dbt Diagram is open
When the user right-clicks "orders" in the sidebar's Models list
Then the context menu shows "Reveal in diagram" and "Reveal in model.yml"
```

### Other column-row menu items keep working

```
Given the dbt Diagram is open showing the "orders" table
When the user right-clicks the "customer_id" column row
And chooses an item from the "Show columns" submenu
Then it applies that column-display mode to the "orders" table exactly as it
  would from the header menu
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/dbt/locate.ts` | modify | Add `findColumnDeclaration`, sharing the parse/walk with `findModelDeclaration`. |
| `src/webview/openSource.ts` | modify | Accept an optional `column` and use `findColumnDeclaration` with the column-aware fallback/warning. |
| `src/shared/protocol.ts` | modify | Add optional `column?: string` to the `model:openSource` message. |
| `src/webview/panel.ts` | modify | Pass `message.column` through to `openModelSource`. |
| `webview-ui/diagram-interaction-context.ts` | modify | Add `onColumnContextMenu: (model: string, column: string, event: ReactMouseEvent) => void`. |
| `webview-ui/TableNode.tsx` | modify | Add `onContextMenu` on each column row calling `interaction?.onColumnContextMenu`, with `stopPropagation` so the node-level handler does not also fire. |
| `webview-ui/App.tsx` | modify | Extract the table card's context-menu item list into a shared builder parameterized by an optional `column`; call it from both `onNodeContextMenu` (header, no column) and the new `onColumnContextMenu` (with column); rename the `Reveal in model.yml` label in both. |
| `webview-ui/FilterSidebar.tsx` | modify | Rename the sidebar item label to `Reveal in model.yml`. |
| `test/unit/dbt/locate.test.ts` | modify | Unit tests for `findColumnDeclaration`. |
| `test/unit/webview/openSource.test.ts` | modify | Unit tests for the column-aware `openModelSource` path. |
| `specs/ARCHITECTURE.md` | modify | Update the `locate.ts` / `openSource.ts` responsibility rows to mention column support. |

### Signatures

```ts
// src/dbt/locate.ts  (pure — must not import `vscode`)
export function findColumnDeclaration(
  text: string,
  modelName: string,
  columnName: string,
): DeclarationPosition | null;
```

```ts
// src/webview/openSource.ts  (pure — must not import `vscode`)
export async function openModelSource(
  host: OpenSourceHost,
  model: string,
  column?: string,
): Promise<void>;
```

```ts
// src/shared/protocol.ts  (shared)
// MessageToExtension's model:openSource member becomes:
//   | { type: 'model:openSource'; model: string; column?: string }
```

```ts
// webview-ui/diagram-interaction-context.ts  (webview)
// added to DiagramInteractionContextValue:
onColumnContextMenu: (model: string, column: string, event: ReactMouseEvent) => void;
```

### Behavior notes

- **Locator.** `findColumnDeclaration` first locates the model's mapping item
  the same way `findModelDeclaration` does (root map → `models` seq → item with
  matching `name`), then reads that item's `columns` key, requires it to be a
  sequence, and walks its items the same way `findModelDeclaration` walks
  `models`: each item must be a mapping whose `name` scalar (via
  `item.get('name', true)`) has a range and equals `columnName`. Returns the
  **first** match in file order. Converts the scalar's range to a
  `DeclarationPosition` identically to `findModelDeclaration` (one-based
  `LineCounter.linePos` minus 1, `length = range[1] - range[0]`). To avoid
  duplicating the model-lookup logic in two functions, extract a private
  helper `findModelItem(root, modelName)` returning the matched `YAMLMap` item
  (or `null`) and have both `findModelDeclaration` and `findColumnDeclaration`
  call it.
- Returns `null` — never throws — whenever: the model itself cannot be located,
  `columns` is missing or not a sequence, an item is not a mapping, no item's
  `name` matches, or the matching scalar has no range. Same `try/catch`
  wrapping as `findModelDeclaration`.
- **`openModelSource` with a column** (extends spec 15's ordering, each step
  still short-circuits):
  1. `findModelFile` / `readFileText` unchanged from spec 15 (model-level
     errors: `Model "<model>" is no longer defined in any model.yml` /
     `Could not read <fsPath>`).
  2. When `column` is `undefined`, behavior is byte-identical to spec 15
     (`findModelDeclaration` only).
  3. When `column` is given, call `findColumnDeclaration(text, model, column)`.
     - Found → `reveal(fsPath, columnPosition)`, no warning.
     - Not found → fall back to `findModelDeclaration(text, model)` and
       `reveal(fsPath, modelPosition)` (which may itself be `null`, landing at
       the top exactly as spec 15 describes); then
       `showWarning('Could not locate column "<column>" on "<model>" in
       <fsPath>; revealed the model declaration instead.')`. When even the
       model can't be located, the existing spec-15 model-not-found warning
       text does **not** apply here — this is a distinct message naming the
       column, since the model itself was found (its file was resolved) even
       though its declaration line could not be pinpointed.
- **Column row context menu.** `TableNode`'s row `onContextMenu` calls
  `event.preventDefault()` and `event.stopPropagation()` (so the node-level
  `onNodeContextMenu` does not also fire for the same click) then
  `interaction?.onColumnContextMenu(id, column.name, event)`.
- **Shared item builder.** `App.tsx` extracts a `buildTableMenuItems(model:
  string, column?: string): ContextMenuItem[]` used by both handlers, so the
  column-row menu and the header menu are the same list of items (currently
  `Reveal in model.yml` and the `Show columns` submenu) except for what
  `Reveal in model.yml`'s `onSelect` does:
  - `column === undefined` (header, or any other card chrome) →
    `onOpenModelSource(model)`.
  - `column` given (a column row) → `onOpenModelSource(model, column)`.
  `onNodeContextMenu` calls `buildTableMenuItems(node.id)`;
  `onColumnContextMenu` calls `buildTableMenuItems(model, column)`. Both then
  call `openMenu(event.clientX, event.clientY, items)`. The `Show columns`
  submenu's own items and behavior are identical either way — it is not
  column-specific and this feature does not change it.
- **Table header menu — unchanged behavior, renamed label.** The header
  `onNodeContextMenu` path keeps calling `onOpenModelSource(node.id)` with no
  column; only the string `'Open in model.yml'` → `'Reveal in model.yml'`
  changes.
- **Sidebar — unchanged behavior, renamed label.** Same rename in
  `FilterSidebar.tsx`; `onOpenModelSource` is still called with no column.
- **Menu labels are exactly** `Reveal in model.yml` (model or column level) and
  `Reveal in diagram` (sidebar only, untouched).

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/dbt/locate.test.ts` | `finds a column on the matching model` | `"models:\n  - name: orders\n    columns:\n      - name: id\n      - name: customer_id\n"`, `'orders'`, `'customer_id'` | non-null position whose line/column point at the `customer_id` token |
| `test/unit/dbt/locate.test.ts` | `does not match a same-named column on a different model` | two models each with a `columns` list, one containing `id`, target model `'order_items'`, column `'id'` | position lands on `order_items`'s `id`, not `orders`'s |
| `test/unit/dbt/locate.test.ts` | `returns null when the model cannot be located` | text without the model | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null when columns is missing` | model with no `columns` key | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null when columns is not a sequence` | `columns: id` | `null` |
| `test/unit/dbt/locate.test.ts` | `returns null for an unknown column name` | valid columns list, unknown name | `null` |
| `test/unit/webview/openSource.test.ts` | `reveals a located column` | host resolving `orders.yml` with text `"models:\n  - name: orders\n    columns:\n      - name: customer_id\n"`, `model='orders'`, `column='customer_id'` | `reveal` called once with the column's position; no warning |
| `test/unit/webview/openSource.test.ts` | `falls back to the model line and warns when the column is not found` | text `"models:\n  - name: orders\n    columns:\n      - name: id\n"`, `column='customer_id'` | `reveal` called with the **model**'s position; warning `Could not locate column "customer_id" on "orders" in <fsPath>; revealed the model declaration instead.` |
| `test/unit/webview/openSource.test.ts` | `omitting column preserves spec 15 behavior` | same fixtures as spec 15's existing tests, no `column` argument | identical `reveal`/warning/error calls as before this feature |

### Verification

1. `npm run verify` — typecheck + unit suites, must be green.
2. `npm test` — before the commit, must be green.
3. Manual (F5 on `fixtures/sample-dbt`): right-click a column row and confirm
   it selects that column's line; right-click a table header and the sidebar
   row and confirm both still reveal the model and show the renamed label.

### Do not touch

- `src/dbt/parse.ts`, `src/dbt/serialize.ts`, `src/dbt/edit/*` — this feature
  remains read-only.
- `src/vscode/project.ts`'s `revealInEditor` — no change; it already takes a
  `DeclarationPosition | null` and needs nothing column-specific.
- `webview-ui/ContextMenu.tsx`, `webview-ui/context-menu-position.ts`,
  `webview-ui/hooks/useContextMenu.ts` — reused as-is.
- Column selection, hover, and inline-edit handlers in `TableNode.tsx` —
  additive `onContextMenu` only, no change to `onClick`/`onDoubleClick`/hover.
- The sidebar's `Reveal in diagram` item and `useRevealModel` — untouched.

## Acceptance Criteria

- [ ] Right-clicking a column row opens the same context menu as the table
      header (including the `Show columns` submenu), where
      `Reveal in model.yml` reveals that column's declaration line in its
      model.yml (reusing an existing tab per spec 15's rule).
- [ ] Right-clicking a table header still reveals the model's declaration line,
      unchanged in behavior, under the renamed label `Reveal in model.yml`.
- [ ] The sidebar's model-row item is renamed to `Reveal in model.yml`;
      `Reveal in diagram` is untouched.
- [ ] When the column cannot be located but the model can, the file opens at
      the model's declaration line with a column-specific warning naming the
      column, model, and file.
- [ ] `findColumnDeclaration` and the column-aware `openModelSource` are pure
      (no `vscode` import) and covered by sub-second Vitest unit tests.
- [ ] Omitting `column` from `openModelSource` reproduces spec 15's behavior
      exactly (model-not-found error, unreadable-file error, top-of-file
      fallback with its original warning).
- [ ] `specs/ARCHITECTURE.md` reflects the extended responsibilities.
- [ ] `npm run verify` is green.

## Confirm at Approval — resolved

- **(a) Label rename — everywhere.** Confirmed.
- **(b) Column-not-found fallback — falls back to the model's declaration
  line.** Confirmed.
- **(c) Row menu scope — full menu, context-dependent behavior.** Confirmed:
  the column row's menu shows the same items as the header menu (
  `Reveal in model.yml` and `Show columns`); only `Reveal in model.yml`'s
  target changes (column vs. model) depending on where the menu was opened.
