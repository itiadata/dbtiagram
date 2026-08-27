# Architecture Map

One line per module under `src/` and `webview-ui/`, so a planning pass can cite
real paths — and real exports — without exploring the codebase.

Keep this file current: when a module is added, split, or removed, update the
matching row in the same commit.

## Layer rules

| Layer | Meaning |
|-------|---------|
| `pure` | Domain logic. **Must not import `vscode`.** Unit-tested with Vitest. |
| `shared` | Types/helpers used by both the extension host and the webview. **Must not import `vscode`.** |
| `vscode-facing` | Isolated wrapper around VS Code APIs. Keep logic thin; push decisions into `pure` modules. |
| `webview` | React front-end. Runs in the webview sandbox; talks to the host only via `src/shared/protocol.ts`. |

Soft size cap: **400 lines** per file under `src/` and `webview-ui/`, **600
lines** under `test/unit/` (see `specs/features/17-modular-source-layout.md`).

## `src/dbt/` — dbt model.yml domain (pure)

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/dbt/types.ts` | pure | The dbt model.yml data model shared across parsing, editing and diagramming. | `ModelYmlFile`, `ModelDefinition`, `ModelColumn`, `ModelConfig`, `ModelConstraint`, `DataTestEntry`, `ForeignKeyDescriptor`, `VirtualPrimaryKey`, `VirtualForeignKey`, `VirtualConstraintsBlock` |
| `src/dbt/parse.ts` | pure | Parse model.yml text into `ModelYmlFile`, raising a typed error on malformed YAML. | `parseModelYml`, `ModelYmlParseError` |
| `src/dbt/serialize.ts` | pure | Serialize a `ModelYmlFile` back to YAML text for write-back. | `serializeModelYml` |
| `src/dbt/locate.ts` | pure | Locate a model's `name:` declaration in model.yml text via the yaml package's node ranges (spec 15). | `findModelDeclaration`, `DeclarationPosition` |
| `src/dbt/refs.ts` | pure | Parse and rewrite `ref('…')` targets inside model properties. | `parseRef`, `renameRefTarget`, `RefTarget` |
| `src/dbt/virtual.ts` | pure | Read/write the dbtiagram-managed virtual constraints block (PKs/FKs not expressed as dbt constraints). | `readVirtualConstraints`, `writeVirtualConstraints` |
| `src/dbt/modelStore.ts` | pure | In-memory set of loaded model.yml files: upsert, text change, delete, rename, and redistribution of edited models. | `createModelStore`, `ModelStore`, `upsertRecord`, `applyTextChange`, `applyFileDeleted`, `applyFileRenamed`, `distributeEditedModels`, `replaceModelStore`, `ModelFileRecord`, `LoadedModelFile`, `FailedModelFile` |
| `src/dbt/edit/index.ts` | pure | Single entry point that dispatches a `ModelEdit` to the right handler. **All mutations go through here.** | `applyEdit` |
| `src/dbt/edit/types.ts` | pure | The discriminated union of every supported edit. | `ModelEdit` |
| `src/dbt/edit/internal.ts` | pure | Shared helpers and the result/error shape used by the edit handlers. | `applyEdit` result types `ApplyEditResult`, `EditError`, `mapModel`, `mapNames`, `blankToUndefined`, `arraysEqual`, `isRecord` |
| `src/dbt/edit/model.ts` | pure | Model-level edits: rename, description. | `renameModel`, `applyDescription` |
| `src/dbt/edit/column.ts` | pure | Column-level edits: rename, data type, description. | `renameColumn`, `setColumnDataType`, `setColumnDescription`, `mapColumn` |
| `src/dbt/edit/primaryKey.ts` | pure | Primary key edits, including de-duplication of column names. | `setPrimaryKeyOnModel`, `dedupeTrimmed` |
| `src/dbt/edit/foreignKey.ts` | pure | Foreign key creation, retargeting, column pairing, virtual-flag and removal. | `createForeignKey`, `applyForeignKeyTarget`, `applyForeignKeyColumns`, `setFkVirtualOnModel`, `removeFkFromModel` |

## `src/diagram/` — graph and layout (pure)

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/diagram/graph.ts` | pure | Turn model definitions into an abstract diagram graph of table nodes and relation edges. | `buildDiagram`, `DiagramGraph`, `TableNode`, `TableNodeColumn`, `RelationEdge` |
| `src/diagram/layout.ts` | pure | Automatic node placement and the node geometry constants the webview mirrors. | `layoutDiagram`, `DiagramLayout`, `NodePlacement`, `nodeHeight`, `columnRowCenterY`, `NODE_WIDTH`, `HEADER_HEIGHT`, `ROW_HEIGHT` |
| `src/diagram/positions.ts` | pure | Position bookkeeping: overlap avoidance and merging user-moved positions into freshly built nodes. | `avoidOverlap`, `mergeFlowNodes`, `rectsOverlap`, `NodePosition`, `NodeRect`, `OVERLAP_PADDING`, `OVERLAP_STEP_Y` |
| `src/diagram/routing.ts` | pure | Obstacle-aware orthogonal edge routing with free side choice. | `routeEdge`, `Route`, `RouteRequest`, `RouteEndpoint`, `RouteSide`, `Point`, `STUB_PX`, `ROUTE_MARGIN`, `OBSTACLE_PENALTY`, `BEND_PENALTY`, `ROUTING_NODE_LIMIT` |
| `src/diagram/flow.ts` | pure | Convert the diagram graph into React Flow nodes/edges and route them; owns handle-id conventions; anchors FKs naming a missing column to the card and marks them `unresolved` (spec 20). | `buildFlowElements`, `routeEdges`, `columnSourceHandle`, `columnTargetHandle`, `columnRowIndexLookup`, `FlowNode`, `FlowEdge`, `FlowElements`, `HandleSide`, `FK_EDGE_TYPE`, `EDGE_INTERACTION_WIDTH`, `CARD_ANCHOR` |
| `src/diagram/layoutFile.ts` | pure | The saved `.dbtiagram` layout file format: build, serialize, parse, apply, including sticky notes (spec 16). | `buildLayout`, `serializeDiagramLayout`, `parseDiagramLayout`, `applyLayout`, `createNote`, `isLayoutFilePath`, `defaultLayoutName`, `stripLayoutSuffix`, `DiagramLayout`, `DiagramLayoutTable`, `DiagramNote`, `AppliedLayout`, `DiagramLayoutParseError`, `LAYOUT_FILE_SUFFIX`, `LAYOUT_VERSION`, `NOTE_DEFAULT_WIDTH`, `NOTE_DEFAULT_HEIGHT`, `NOTE_MIN_WIDTH`, `NOTE_MIN_HEIGHT` |

## `src/shared/` — host ↔ webview shared code

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/shared/protocol.ts` | shared | The **only** message contract between extension host and webview. | `MessageToWebview`, `MessageToExtension`, `DiagramModelFile`, `DiagramPendingError` |
| `src/shared/filter.ts` | shared | File/model filtering and selection reconciliation for the filter sidebar. | `filterGraph`, `computeVisibleModels`, `reconcileSelection`, `scopeSelectionToFile`, `matchesSearch` |
| `src/shared/glob.ts` | shared | Minimal glob matching used for model file discovery patterns. | `matchesGlob`, `globToRegExp`, `normalizePathForGlob` |
| `src/shared/labels.ts` | shared | Disambiguate display labels for files that share a base name. | `disambiguateFileLabels`, `FileLabelMap` |

## `src/vscode/` — VS Code API wrappers

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/vscode/project.ts` | vscode-facing | Discover, read and write model.yml files in the workspace, and reveal a declaration in an editor. | `loadModelYmlFiles`, `readFileText`, `writeModelYmlFile`, `revealInEditor`, `ModelYmlRecord`, `ModelYmlFailure`, `ModelYmlLoadResult` |
| `src/vscode/modelWatcher.ts` | vscode-facing | File-system watcher that pushes create/change/delete events to the panel. | `registerModelWatcher`, `ModelWatcherCallbacks` |
| `src/vscode/editorButton.ts` | pure | Decision logic for whether the editor-title button shows for a document. | `shouldShowButton`, `isDiagramLayoutFile`, `modelFileContextKey`, `layoutFileContextKey` |
| `src/vscode/editorButtonContext.ts` | vscode-facing | Registers the editor-title button and keeps its `when`-clause context keys in sync. | `registerEditorTitleButton` |
| `src/vscode/layoutFiles.ts` | vscode-facing | Read/write `.dbtiagram` layout files and prompt the user for a save path. | `readLayoutFile`, `writeLayoutFile`, `promptForLayoutPath` |

## `src/webview/` — extension-host side of the panel

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/webview/panel.ts` | vscode-facing | The diagram panel: lifecycle, message pump, model store wiring, write-back. | `DiagramPanel` |
| `src/webview/html.ts` | vscode-facing | Build the webview HTML shell (CSP, nonce, asset URIs). | `buildWebviewHtml` |
| `src/webview/panelKey.ts` | pure | One panel per source file: key and title derivation. | `diagramPanelKey`, `diagramPanelTitle`, `DiagramSource`, `defaultCaseInsensitive` |
| `src/webview/openSource.ts` | pure | Orchestrates "Open in model.yml" against a host port: resolve, read, locate, reveal or report (spec 15). | `openModelSource`, `OpenSourceHost` |
| `src/webview/layoutMessages.ts` | pure | Layout-related message handling against a small `LayoutHost` port, so it stays testable. | `publishActiveLayout`, `openLayout`, `sendActiveLayout`, `saveLayout`, `writeActiveLayout`, `ActiveLayout`, `LayoutHost` |
| `src/extension.ts` | vscode-facing | `activate` / `deactivate` only — command registration and disposal. | `activate`, `deactivate` |

## `webview-ui/` — React front-end (webview)

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `webview-ui/index.tsx` | webview | Mount point: renders `App` into the webview document. | — |
| `webview-ui/App.tsx` | webview | Top-level composition: state hooks, sidebars, canvas. | `App` |
| `webview-ui/DiagramCanvas.tsx` | webview | React Flow canvas: nodes, edges, pan/zoom, node drag. | `DiagramCanvas`, `DiagramCanvasProps` |
| `webview-ui/TableNode.tsx` | webview | Custom React Flow node rendering a table with its column rows and handles. | `TableNode` |
| `webview-ui/NoteNode.tsx` | webview | Custom React Flow node rendering a sticky note: resizable rectangle, textarea, or collapsed icon (spec 16). | `NoteNode`, `NoteNodeData` |
| `webview-ui/FkEdge.tsx` | webview | Custom FK edge renderer with hover-friendly interaction width. | `FkEdge`, `roundedPath` |
| `webview-ui/ContextMenu.tsx` | webview | Reusable portal-rendered context menu with disabled and checkable items (spec 15). | `ContextMenu`, `ContextMenuItem`, `ContextMenuProps` |
| `webview-ui/context-menu-position.ts` | webview (pure) | Viewport flip/clamp geometry for the context menu (spec 15). | `placeMenu`, `MenuBox`, `MenuPoint`, `MenuPlacement` |
| `webview-ui/details-visibility.ts` | webview (pure) | Details sidebar visibility policy: opens/closes with the selection, manual collapse sticks until it next changes (spec 19). | `selectionKey`, `nextDetailsVisible`, `SelectionKey` |
| `webview-ui/FilterSidebar.tsx` | webview | Left sidebar: file/model filtering, search, locate. | `FilterSidebar` |
| `webview-ui/DetailsSidebar.tsx` | webview | Right sidebar: edit the selected model or column. | `DetailsSidebar`, `SelectedEntity` |
| `webview-ui/PrimaryKeySection.tsx` | webview | Primary key editing UI inside the details sidebar. | `PrimaryKeySection` |
| `webview-ui/ForeignKeySection.tsx` | webview | Foreign key editing UI, including draft (incomplete) FKs. | `ForeignKeySection`, `DraftForeignKey`, `sameFkContent` |
| `webview-ui/SearchSelect.tsx` | webview | Reusable searchable dropdown. | `SearchSelect` |
| `webview-ui/SidebarChrome.tsx` | webview | Collapsed sidebar rail and drag-to-resize handle. | `SidebarRail`, `SidebarResizer` |
| `webview-ui/sidebar-constants.ts` | webview | Sidebar width defaults, bounds and clamping. | `clampSidebarWidth`, `SIDEBAR_DEFAULT_WIDTH`, `SIDEBAR_MIN_WIDTH`, `SIDEBAR_MAX_WIDTH` |
| `webview-ui/diagram-interaction-context.ts` | webview | React context carrying interaction callbacks down to custom nodes/edges. | `DiagramInteractionContext`, `DiagramInteractionContextValue` |
| `webview-ui/host.ts` | webview | Typed `postMessage` to the extension host. | `postToHost` |
| `webview-ui/vscode-api.ts` | webview | Acquire and memoize the webview VS Code API handle. | `VsCodeApi` |
| `webview-ui/vscode.d.ts` | webview | Ambient declaration for `acquireVsCodeApi`. | — |
| `webview-ui/styles.css` | webview | Webview styling, themed from VS Code CSS variables. | — |
| `webview-ui/hooks/useHostMessages.ts` | webview | Subscribe to host → webview messages and dispatch to handlers. | `useHostMessages`, `HostMessageHandlers`, `DiagramUpdateMessage`, `LayoutApplyMessage`, `LayoutActiveMessage` |
| `webview-ui/hooks/useSelection.ts` | webview | Current model/column selection state. | `useSelection`, `Selection`, `SelectionState` |
| `webview-ui/hooks/useContextMenu.ts` | webview | Open/close state (point + items) for the shared context menu (spec 15). | `useContextMenu`, `ContextMenuState` |
| `webview-ui/hooks/useRevealModel.ts` | webview | "Reveal in diagram" target state and callback (spec 15). | `useRevealModel`, `RevealTarget`, `RevealModelState` |
| `webview-ui/hooks/useNotes.ts` | webview | Sticky note state: persisted notes, runtime collapse map, node projection, mutations (spec 16). | `useNotes`, `NotesState` |
| `webview-ui/hooks/useDiagramFilter.ts` | webview | Filter sidebar state on top of `src/shared/filter.ts`. | `useDiagramFilter`, `DiagramFilterState` |
| `webview-ui/hooks/useDraftForeignKeys.ts` | webview | Track in-progress FK edits that are not yet persistable. | `useDraftForeignKeys`, `DraftForeignKeysState` |
| `webview-ui/hooks/useEdgeHighlighting.ts` | webview | Hover/selection highlighting of FK edges and handle dots. | `useEdgeHighlighting`, `EdgeHighlightingState` |
| `webview-ui/hooks/useLayoutPersistence.ts` | webview | Node positions ↔ layout file messages, including the write-back arming guard. | `useLayoutPersistence`, `LayoutPersistenceState` |

## Tests

| Path | Purpose |
|------|---------|
| `test/unit/` | Vitest suites mirroring the `src/` tree; must run in under a second with no Electron host. |
| `test/unit/helpers/models.ts` | Shared fixtures/builders for unit tests. |
| `test/unit/fixture.test.ts` | Exercises `fixtures/sample-dbt/` end-to-end through the pure pipeline. |
| `test/integration/` | Mocha + `@vscode/test-electron` suites that launch a real VS Code host. |
| `fixtures/sample-dbt/` | Minimal dbt workspace used as the F5 debug target. |
