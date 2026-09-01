/**
 * The file/model filter (spec 05), its scoping to a single file (spec 14), and
 * the layout-driven visible set (spec 13).
 *
 * `filterTick` bumps on every explicit filter change so the canvas re-fits.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  capInitialSelection,
  computeVisibleModels,
  INITIAL_MODEL_SELECTION_LIMIT,
  reconcileSelection,
  removeModels,
  scopeSelectionToFile,
} from '../../src/shared/filter';
import type { DiagramModelFile } from '../../src/shared/protocol';

/** Spec 35: the one-time popup naming how many models were initially shown. */
export interface InitialCapNotice {
  shown: number;
  total: number;
}

export interface DiagramFilterState {
  modelFiles: DiagramModelFile[];
  selectedFiles: Set<string>;
  selectedModels: Set<string>;
  availableModelNames: string[];
  visibleModels: Set<string>;
  fileSearch: string;
  modelSearch: string;
  setFileSearch: (value: string) => void;
  setModelSearch: (value: string) => void;
  filterTick: number;
  toggleFile: (uri: string, checked: boolean) => void;
  toggleModel: (name: string, checked: boolean) => void;
  selectAllFiles: () => void;
  clearFiles: () => void;
  selectAllModels: () => void;
  clearModels: () => void;
  /** Unchecks these models, exactly as the sidebar checkbox would (spec 36). */
  removeModels: (names: readonly string[]) => void;
  /** Adopts new host metadata, keeping the user's checked state (spec 05). */
  applyModelFiles: (files: DiagramModelFile[]) => void;
  /** Scopes to one model.yml unless a layout already won (spec 14). */
  applyScope: (uri: string) => void;
  /** A saved layout's table list becomes the exact visible set (spec 13). */
  applyLayoutTables: (names: string[]) => void;
  /** Spec 35: set once when the first load capped the model selection. */
  initialCapNotice: InitialCapNotice | null;
  /** Dismisses the initial-cap popup (auto-timer or manual close). */
  dismissInitialCapNotice: () => void;
}

export function useDiagramFilter(): DiagramFilterState {
  const [modelFiles, setModelFiles] = useState<DiagramModelFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [fileSearch, setFileSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [filterTick, setFilterTick] = useState(0);
  const [initialCapNotice, setInitialCapNotice] = useState<InitialCapNotice | null>(null);
  // Universes from the previous diagram:update, used to tell brand-new
  // files/models (default checked) apart from ones the user unchecked.
  const previousFileUrisRef = useRef<string[]>([]);
  const previousModelNamesRef = useRef<string[]>([]);
  // Spec 35: the initial model-selection cap applies only to the panel's
  // very first diagram:update — this flips true after that first call.
  const hasLoadedOnceRef = useRef(false);
  // Spec 14: the freshest file metadata, readable synchronously by the
  // `filter:scope` handler (which arrives as its own message event), and a
  // latch making `layout:apply` win over any later scope message.
  const modelFilesRef = useRef<DiagramModelFile[]>([]);
  const layoutAppliedRef = useRef(false);

  // Models held by files that are currently checked: the Models filter only
  // lists these (spec 05, reactive model list). Models of unchecked files are
  // hidden from the list but keep their checked state, so re-checking a file
  // restores them exactly (file precedence already hides them from the graph).
  const availableModelNames = useMemo(() => {
    const names = new Set<string>();
    for (const file of modelFiles) {
      if (!selectedFiles.has(file.uri)) continue;
      for (const model of file.models) names.add(model);
    }
    return [...names];
  }, [modelFiles, selectedFiles]);

  // Spec 05: the diagram is the full graph filtered by the checked files
  // (with precedence) and checked models. Search boxes never enter this memo —
  // they only narrow the sidebar checkbox lists.
  const visibleModels = useMemo(
    () => computeVisibleModels(modelFiles, selectedFiles, selectedModels),
    [modelFiles, selectedFiles, selectedModels],
  );

  const applyModelFiles = useCallback((files: DiagramModelFile[]): void => {
    setModelFiles(files);
    modelFilesRef.current = files;

    const fileUris = files.map((file) => file.uri);
    const previousUris = previousFileUrisRef.current;
    setSelectedFiles((current) => reconcileSelection(previousUris, fileUris, current));
    previousFileUrisRef.current = fileUris;

    const modelNames = files.flatMap((file) => file.models);
    const previousNames = previousModelNamesRef.current;
    // Spec 35: only the panel's very first load caps the model selection;
    // every later call reconciles normally, uncapped.
    const isInitialLoad = !hasLoadedOnceRef.current;
    hasLoadedOnceRef.current = true;
    if (isInitialLoad && modelNames.length > INITIAL_MODEL_SELECTION_LIMIT) {
      setSelectedModels(capInitialSelection(modelNames));
      setInitialCapNotice({ shown: INITIAL_MODEL_SELECTION_LIMIT, total: modelNames.length });
    } else {
      setSelectedModels((current) => reconcileSelection(previousNames, modelNames, current));
    }
    previousModelNamesRef.current = modelNames;
  }, []);

  // Spec 14: this tab was opened from a single model.yml, so it starts showing
  // only that file's models. A layout always wins, and an unknown file leaves
  // spec 05's all-checked default alone.
  //
  // Spec 35: this always runs strictly after `applyModelFiles` in the startup
  // sequence and unconditionally overwrites the model selection, so whatever
  // cap decision `applyModelFiles` made a moment earlier is about to be
  // replaced regardless. The cap must therefore be re-decided here, against
  // the scoped file's own model count (not the workspace total) — and the
  // notice explicitly set or cleared, rather than leaving `applyModelFiles`'s
  // (possibly now-irrelevant) notice on screen.
  const applyScope = useCallback((uri: string): void => {
    if (layoutAppliedRef.current) return;
    const scoped = scopeSelectionToFile(modelFilesRef.current, uri);
    if (scoped === null) return;
    setSelectedFiles(scoped.files);
    const scopedNames = [...scoped.models];
    if (scopedNames.length > INITIAL_MODEL_SELECTION_LIMIT) {
      setSelectedModels(capInitialSelection(scopedNames));
      setInitialCapNotice({ shown: INITIAL_MODEL_SELECTION_LIMIT, total: scopedNames.length });
    } else {
      setSelectedModels(scoped.models);
      setInitialCapNotice(null);
    }
    setFilterTick((tick) => tick + 1);
  }, []);

  // Spec 13: every file is checked so file precedence can never hide a layout
  // table; the layout's table list becomes the checked model set.
  const applyLayoutTables = useCallback((names: string[]): void => {
    layoutAppliedRef.current = true;
    setSelectedFiles(() => new Set(previousFileUrisRef.current));
    setSelectedModels(new Set(names));
    setFilterTick((tick) => tick + 1);
  }, []);

  const toggleFile = useCallback((uri: string, checked: boolean): void => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (checked) next.add(uri);
      else next.delete(uri);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, []);

  const toggleModel = useCallback((name: string, checked: boolean): void => {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, []);

  // Bulk All / None per filter level (spec 05): file handlers set the whole
  // file Set; model handlers operate only on the listed (available) models,
  // leaving the hidden models' checked state untouched. All of them behave
  // like checkbox toggles for the refit policy.
  const selectAllFiles = useCallback((): void => {
    setSelectedFiles(new Set(modelFiles.map((file) => file.uri)));
    setFilterTick((tick) => tick + 1);
  }, [modelFiles]);

  const clearFiles = useCallback((): void => {
    setSelectedFiles(new Set());
    setFilterTick((tick) => tick + 1);
  }, []);

  const selectAllModels = useCallback((): void => {
    setSelectedModels((current) => new Set([...current, ...availableModelNames]));
    setFilterTick((tick) => tick + 1);
  }, [availableModelNames]);

  const clearModels = useCallback((): void => {
    setSelectedModels((current) => {
      const next = new Set(current);
      for (const name of availableModelNames) next.delete(name);
      return next;
    });
    setFilterTick((tick) => tick + 1);
  }, [availableModelNames]);

  const dismissInitialCapNotice = useCallback((): void => {
    setInitialCapNotice(null);
  }, []);

  // Spec 36: removal is filter-only — the same effect as unchecking the model
  // in the sidebar, including the refit-triggering filterTick bump.
  const removeModelsCallback = useCallback((names: readonly string[]): void => {
    setSelectedModels((current) => removeModels(current, names));
    setFilterTick((tick) => tick + 1);
  }, []);

  return {
    modelFiles,
    selectedFiles,
    selectedModels,
    availableModelNames,
    visibleModels,
    fileSearch,
    modelSearch,
    setFileSearch,
    setModelSearch,
    filterTick,
    toggleFile,
    toggleModel,
    selectAllFiles,
    clearFiles,
    selectAllModels,
    clearModels,
    removeModels: removeModelsCallback,
    applyModelFiles,
    applyScope,
    applyLayoutTables,
    initialCapNotice,
    dismissInitialCapNotice,
  };
}
