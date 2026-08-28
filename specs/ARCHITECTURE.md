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
| `src/dbt/locate.ts` | pure | Locate a model's `name:` declaration, or a specific column's `name:` entry within it, in model.yml text via the yaml package's node ranges (spec 15, extended by spec 25). | `findModelDeclaration`, `findColumnDeclaration`, `DeclarationPosition` |
| `src/dbt/refs.ts` | pure | Parse and rewrite `ref('…')` targets inside model properties. | `parseRef`, `renameRefTarget`, `RefTarget` |
| `src/dbt/virtual.ts` | pure | Read/write the dbtiagram-managed virtual constraints block (PKs/FKs not expressed as dbt constraints). | `readVirtualConstraints`, `writeVirtualConstraints` |
| `src/dbt/modelStore.ts` | pure | In-memory set of loaded model.yml files: upsert, text change, delete, rename, and redistribution of edited models. | `createModelStore`, `ModelStore`, `upsertRecord`, `applyTextChange`, `applyFileDeleted`, `applyFileRenamed`, `distributeEditedModels`, `replaceModelStore`, `ModelFileRecord`, `LoadedModelFile`, `FailedModelFile` |
| `src/dbt/edit/index.ts` | pure | Single entry point that dispatches a `ModelEdit` to the right handler. **All mutations go through here.** | `applyEdit` |
| `src/dbt/edit/types.ts` | pure | The discriminated union of every supported edit. | `ModelEdit` |
| `src/dbt/edit/internal.ts` | pure | Shared helpers and the result/error shape used by the edit handlers. | `applyEdit` result types `ApplyEditResult`, `EditError`, `mapModel`, `mapNames`, `blankToUndefined`, `arraysEqual`, `isRecord` |
| `src/dbt/edit/model.ts` | pure | Model-level edits: rename, description. | `renameModel`, `applyDescription` |
| `src/dbt/edit/column.ts` | pure | Column-level edits: rename, data type, description. | `renameColumn`, `setColumnDataType`, `setColumnDescription`, `mapColumn` |
| `src/dbt/edit/primaryKey.ts` | pure | Primary key edits, including de-duplication of column names. | `setPrimaryKeyOnModel`, `dedupeTrimmed` |
| `src/dbt/edit/foreignKey.ts` | pure | Foreign key creation, retargeting, column pairing, virtual-flag and removal. | 
`createForeignKey`, `applyForeignKeyTarget`, `applyForeignKeyColumns`, `setFkVirtualOnModel`, `removeFkFromModel` |
| `src/dbt/edit/column.ts` | pure | Column-level edits: rename (with FK re-pointing), data type, description, and 
one `config.meta` key at a time (spec 27). | `mapColumn`, `setColumnDataType`, `setColumnDescription`, 
`setColumnMetaValue`, `renameColumn` |

## `src/diagram/` — graph and layout (pure)

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/diagram/graph.ts` | pure | Turn model definitions into an abstract diagram graph of table nodes and relation edges. | `buildDiagram`, `DiagramGraph`, `TableNode`, `TableNodeColumn`, `RelationEdge` |
| `src/diagram/layout.ts` | pure | Automatic node placement and the node geometry constants the webview mirrors; accepts an optional per-node displayed-column-count override so cards size by what they actually show (spec 24). | `layoutDiagram`, `DiagramLayout`, `NodePlacement`, `nodeHeight`, `columnRowCenterY`, `NODE_WIDTH`, `HEADER_HEIGHT`, `ROW_HEIGHT` |
| `src/diagram/positions.ts` | pure | Position bookkeeping: overlap avoidance and merging user-moved positions into freshly built nodes. | `avoidOverlap`, `mergeFlowNodes`, `rectsOverlap`, `NodePosition`, `NodeRect`, `OVERLAP_PADDING`, `OVERLAP_STEP_Y` |
| `src/diagram/routing.ts` | pure | Obstacle-aware orthogonal edge routing with free side choice; `chooseSide` also picks the FK-draw preview line's anchor side (spec 26). | `routeEdge`, `Route`, `RouteRequest`, `RouteEndpoint`, `RouteSide`, `Point`, `STUB_PX`, `ROUTE_MARGIN`, `OBSTACLE_PENALTY`, `BEND_PENALTY`, `ROUTING_NODE_LIMIT`, `chooseSide` |
| `src/diagram/columnDisplay.ts` | pure | The four per-table column display modes and which columns each mode shows (spec 24). | `ColumnDisplayMode`, `DEFAULT_COLUMN_DISPLAY`, `ColumnDisplayOption`, `COLUMN_DISPLAY_OPTIONS`, `isColumnDisplayMode`, `displayedColumns` |
| `src/diagram/flow.ts` | pure | Convert the diagram graph into React Flow nodes/edges and route them; owns handle-id conventions; anchors FKs naming a missing column to the card and marks them `unresolved` (spec 20); anchors a hidden-but-existing FK column at the header instead, without `unresolved` (spec 24). | `buildFlowElements`, `routeEdges`, `columnSourceHandle`, `columnTargetHandle`, `columnRowIndexLookup`, `displayedColumnRowIndexLookup`, `FlowNode`, `FlowEdge`, `FlowElements`, `HandleSide`, `FK_EDGE_TYPE`, `EDGE_INTERACTION_WIDTH`, `CARD_ANCHOR`, `HEADER_ANCHOR` |
| `src/diagram/layoutFile.ts` | pure | The saved `.dbtiagram` layout file format: build, serialize, parse, apply, 
including sticky notes (spec 16) and per-table/diagram-wide column-display modes (spec 24). | `buildLayout`, 
`serializeDiagramLayout`, `parseDiagramLayout`, `applyLayout`, `createNote`, `isLayoutFilePath`, `defaultLayoutName`, 
`stripLayoutSuffix`, `DiagramLayout`, `DiagramLayoutTable`, `DiagramNote`, `AppliedLayout`, `DiagramLayoutParseError`, 
`LAYOUT_FILE_SUFFIX`, `LAYOUT_VERSION`, `NOTE_DEFAULT_WIDTH`, `NOTE_DEFAULT_HEIGHT`, `NOTE_MIN_WIDTH`, 
`NOTE_MIN_HEIGHT` |
| `src/diagram/matrix.ts` | pure | Derives "fields matrix" rows (spec 27) from a `DiagramGraph`'s nodes: one row per 
`(model, column)` pair, plus meta-key discovery. | `MatrixRow`, `discoverMetaKeys`, `buildMatrixRows` |

## `src/shared/` — host ↔ webview shared code

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/shared/protocol.ts` | shared | The **only** message contract between extension host and webview. | `MessageToWebview`, `MessageToExtension`, `DiagramModelFile`, `DiagramPendingError` |
| `src/shared/filter.ts` | shared | File/model filtering and selection reconciliation for the filter sidebar. | `filterGraph`, `computeVisibleModels`, `reconcileSelection`, `scopeSelectionToFile`, `matchesSearch` |
| `src/shared/glob.ts` | shared | Minimal glob matching used for model file discovery patterns. | `matchesGlob`, `globToRegExp`, `normalizePathForGlob` |
| `src/shared/labels.ts` | shared | Disambiguate display labels for files that share a base name. | `disambiguateFileLabels`, `FileLabelMap` |
| `src/shared/openBehavior.ts` | shared | The "Open new diagrams" setting's type, default and UI option text (spec 23). | `OpenBehavior`, `DEFAULT_OPEN_BEHAVIOR`, `OpenBehaviorOption`, `OPEN_BEHAVIOR_OPTIONS` |
| `src/shared/openBehaviorPlacement.ts` | shared (pure) | Pure four-way placement decision for a new diagram panel, 
given the setting and whether a reusable separate-window tab group was found (spec 23). | `decidePlacement`, 
`PlacementDecision`, `ReuseTarget` |
| `src/shared/matrixColumns.ts` | shared | Grid column definitions for the "fields matrix" (spec 27): defaults, 
show/hide, reorder, and merging with stored preferences. Used by both the webview and the extension host. | 
`MatrixScope`, `MatrixColumnId`, `MatrixColumnDef`, `StoredMatrixColumnPref`, `defaultMatrixColumns`, 
`toggleColumnVisible`, `reorderColumn`, `applyStoredPrefs`, `toStoredPrefs` |

## `src/vscode/` — VS Code API wrappers

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/vscode/project.ts` | vscode-facing | Discover, read and write model.yml files in the workspace, and reveal a declaration in an editor. | `loadModelYmlFiles`, `readFileText`, `writeModelYmlFile`, `revealInEditor`, `ModelYmlRecord`, `ModelYmlFailure`, `ModelYmlLoadResult` |
| `src/vscode/modelWatcher.ts` | vscode-facing | File-system watcher that pushes create/change/delete events to the panel. | `registerModelWatcher`, `ModelWatcherCallbacks` |
| `src/vscode/editorButton.ts` | pure | Decision logic for whether the editor-title button shows for a document. | `shouldShowButton`, `isDiagramLayoutFile`, `modelFileContextKey`, `layoutFileContextKey` |
| `src/vscode/editorButtonContext.ts` | vscode-facing | Registers the editor-title button and keeps its `when`-clause context keys in sync. | `registerEditorTitleButton` |
| `src/vscode/layoutFiles.ts` | vscode-facing | Read/write `.dbtiagram` layout files and prompt the user for a save path. | `readLayoutFile`, `writeLayoutFile`, `promptForLayoutPath` |
| `src/vscode/openBehaviorWindows.ts` | vscode-facing | Resolves where a new diagram panel should be created for the current `OpenBehavior`, and tracks this extension's separate-window tab groups for "Separate window (reuse)" (spec 23). | `resolvePlacement`, `untrackPanel`, `PanelPlacement` |
| `src/vscode/matrixColumnPrefs.ts` | vscode-facing | Reads/writes matrix grid column preferences per `MatrixScope` 
via `ExtensionContext.workspaceState` (spec 27). | `readMatrixColumnPrefs`, `writeMatrixColumnPrefs` |

## `src/webview/` — extension-host side of the panel

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `src/webview/panel.ts` | vscode-facing | The diagram panel: lifecycle, message pump, model store wiring, write-back, in-memory pending-layout cache and close-time save prompt (spec 22). | `DiagramPanel` |
| `src/webview/html.ts` | vscode-facing | Build the webview HTML shell (CSP, nonce, asset URIs). | `buildWebviewHtml` |
| `src/webview/panelKey.ts` | pure | One panel per source file: key and title derivation. | `diagramPanelKey`, `diagramPanelTitle`, `DiagramSource`, `defaultCaseInsensitive` |
| `src/webview/openSource.ts` | pure | Orchestrates "Reveal in model.yml" against a host port: resolve, read, locate (model or a specific column, falling back to the model), reveal or report (spec 15, extended by spec 25). | `openModelSource`, `OpenSourceHost` |
| `src/webview/layoutMessages.ts` | pure | Layout-related message handling against a small `LayoutHost` port, so it stays testable. Manual save (spec 22): `cachePendingLayout` only caches the webview's latest layout in host memory, never writes to disk. | `publishActiveLayout`, `openLayout`, `sendActiveLayout`, `saveLayout`, `cachePendingLayout`, `ActiveLayout`, `LayoutHost` |
| `src/extension.ts` | vscode-facing | `activate` / `deactivate` only — command registration and disposal. | `activate`, `deactivate` |

## `webview-ui/` — React front-end (webview)

| Path | Layer | Responsibility | Key exports |
|------|-------|----------------|-------------|
| `webview-ui/index.tsx` | webview | Mount point: renders `App` into the webview document. | — |
| `webview-ui/App.tsx` | webview | Top-level composition: state hooks, sidebars, canvas; routes column clicks through the mouse-drawn FK gesture (spec 26). | `App` |
| `webview-ui/DiagramCanvas.tsx` | webview | React Flow canvas: nodes, edges, pan/zoom, node drag; top-right toolbar groups Auto-layout with the diagram-wide column-display selector (spec 24); top-left toolbar hosts Add note/Add foreign key, plus the FK-draw mouse-follow preview line and crosshair cursor (spec 26). | `DiagramCanvas`, `DiagramCanvasProps` |
| `webview-ui/TableNode.tsx` | webview | Custom React Flow node rendering a table with its column rows and handles, including the header-positioned `HEADER_ANCHOR` handle for a hidden FK column (spec 24). | `TableNode` |
| `webview-ui/NoteNode.tsx` | webview | Custom React Flow node rendering a sticky note: resizable rectangle, textarea, or collapsed icon (spec 16). | `NoteNode`, `NoteNodeData` |
| `webview-ui/FkEdge.tsx` | webview | Custom FK edge renderer with hover-friendly interaction width. | `FkEdge`, `roundedPath` |
| `webview-ui/ContextMenu.tsx` | webview | Reusable portal-rendered context menu with disabled/checkable items and submenu flyouts (spec 15, spec 24). | `ContextMenu`, `ContextMenuItem`, `ContextMenuProps` |
| `webview-ui/SettingsPanel.tsx` | webview | "Open new diagrams" settings overlay: option list with descriptions, radio selection, dismiss conventions matching `ContextMenu` (spec 23). | `SettingsPanel`, `SettingsPanelProps` |
| `webview-ui/context-menu-position.ts` | webview (pure) | Viewport flip/clamp geometry for the context menu and its submenu flyouts (spec 15, spec 24). | `placeMenu`, `placeSubmenu`, `MenuBox`, `MenuPoint`, `MenuPlacement`, `SubmenuAnchor` |
| `webview-ui/details-visibility.ts` | webview (pure) | Details sidebar visibility policy: opens/closes with the selection, manual collapse sticks until it next changes (spec 19); `{visible,key}` transition that keeps the policy safe inside a React state updater (spec 21). | `selectionKey`, `nextDetailsVisible`, `SelectionKey`, `DetailsVisibility`, `initialDetailsVisibility`, `advanceDetailsVisibility` |
| `webview-ui/initial-fit.ts` | webview (pure) | Whether the one-off post-measurement corrective `fitView` should still run — skipped once fitted or once the user has touched the canvas (spec 21). | `shouldRunInitialFit` |
| `webview-ui/layout-dirty.ts` | webview (pure) | Compares a current layout snapshot against the last-saved one to drive the manual-save header button's dirty state (spec 22), including the diagram-wide default and per-table column-display modes (spec 24). | `isLayoutDirty`, `LayoutSnapshot` |
| `webview-ui/column-display-state.ts` | webview (pure) | The diagram-wide default column-display mode and per-table overrides; setting the default clears every override (spec 24). | `ColumnDisplayState`, `seedColumnDisplay`, `setTableOverride`, `setDefaultMode`, `effectiveMode` |
| `webview-ui/fk-create-state.ts` | webview (pure) | Two-click gesture state machine for the mouse-drawn foreign key (spec 26): idle -> source-picked -> completed/cancelled. | `ColumnRef`, `FkCreateState`, `FK_CREATE_IDLE`, `startFkCreate`, `cancelFkCreate`, `FkClickOutcome`, `clickColumnForFk` || `webview-ui/settings-state.ts` | webview (pure) | Pure reducer applying a `settings:current` value without forcing the settings overlay open (spec 23). | `applySettingsCurrent`, `SettingsPanelState` |
| `webview-ui/FilterSidebar.tsx` | webview | Left sidebar: file/model filtering, search, locate. | `FilterSidebar` |
| `webview-ui/DetailsSidebar.tsx` | webview | Right sidebar: edit the selected model or column; renders the "Columns shown" section between Description and Primary key for a table (spec 24). | `DetailsSidebar`, `SelectedEntity` |
| `webview-ui/PrimaryKeySection.tsx` | webview | Primary key editing UI inside the details sidebar. | `PrimaryKeySection` |
| `webview-ui/ColumnDisplaySection.tsx` | webview | "Columns shown" radio section of the details pane (spec 24). | `ColumnDisplaySection`, `ColumnDisplaySectionProps` |
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
| `webview-ui/hooks/useSettings.ts` | webview | Settings overlay state: current `OpenBehavior`, open/close, and posting `settings:setOpenBehavior` (spec 23). | `useSettings`, `SettingsState` |
| `webview-ui/hooks/useSelection.ts` | webview | Current model/column selection state. | `useSelection`, `Selection`, `SelectionState` |
| `webview-ui/hooks/useContextMenu.ts` | webview | Open/close state (point + items) for the shared context menu (spec 15). | `useContextMenu`, `ContextMenuState` |
| `webview-ui/hooks/useRevealModel.ts` | webview | "Reveal in diagram" target state and callback (spec 15). | `useRevealModel`, `RevealTarget`, `RevealModelState` |
| `webview-ui/hooks/useNotes.ts` | webview | Sticky note state: persisted notes, runtime collapse map, node projection, mutations (spec 16). | `useNotes`, `NotesState` |
| `webview-ui/hooks/useDiagramFilter.ts` | webview | Filter sidebar state on top of `src/shared/filter.ts`. | `useDiagramFilter`, `DiagramFilterState` |
| `webview-ui/hooks/useDraftForeignKeys.ts` | webview | Track in-progress FK edits that are not yet persistable. | `useDraftForeignKeys`, `DraftForeignKeysState` |
| `webview-ui/hooks/useEdgeHighlighting.ts` | webview | Hover/selection highlighting of FK edges and handle dots. | `useEdgeHighlighting`, `EdgeHighlightingState` |
| `webview-ui/hooks/useColumnDisplay.ts` | webview | React state wrapper around `column-display-state.ts`: the diagram default, per-table overrides, effective-mode lookup, and seeding from an opened layout (spec 24). | `useColumnDisplay`, `ColumnDisplayHookState` |
| `webview-ui/hooks/useLayoutPersistence.ts` | webview | Node positions ↔ layout file messages: seeding on open, the explicit save, and a debounced sync of the pending (unsaved) layout to the host's in-memory cache, plus the dirty flag driving the header button (spec 22); threads the column-display state into every save/sync (spec 24). | `useLayoutPersistence`, `LayoutPersistenceState` |
| `webview-ui/hooks/useFkCreateMode.ts` | webview | React wrapper around `fk-create-state.ts`: window-level Escape 
cancellation and the hint banner text (spec 26). | `useFkCreateMode`, `FkCreateModeState` |
| `webview-ui/matrix-selection.ts` | webview (pure) | Rectangular multi-cell selection over a `(rowIndex, 
columnIndex)` grid (spec 27). | `CellRef`, `MatrixSelection`, `startSelection`, `extendSelection`, 
`cellsInSelection` |
| `webview-ui/FieldsMatrix.tsx` | webview | The "fields matrix" modal (spec 27): grid over one model's columns or 
every model's, with filter, column show/hide + reorder, editable cells, and batch-apply. | `FieldsMatrix`, 
`FieldsMatrixProps` |
| `webview-ui/hooks/useFieldsMatrix.ts` | webview | Open/close state, column-prefs round trip, and the always-reset 
filter text for the fields matrix (spec 27). | `useFieldsMatrix`, `FieldsMatrixState`, `MatrixTarget` |

## Tests

| Path | Purpose |
|------|---------|
| `test/unit/` | Vitest suites mirroring the `src/` tree; must run in under a second with no Electron host. |
| `test/unit/helpers/models.ts` | Shared fixtures/builders for unit tests. |
| `test/unit/fixture.test.ts` | Exercises `fixtures/sample-dbt/` end-to-end through the pure pipeline. |
| `test/integration/` | Mocha + `@vscode/test-electron` suites that launch a real VS Code host. |
| `fixtures/sample-dbt/` | Minimal dbt workspace used as the F5 debug target. |
