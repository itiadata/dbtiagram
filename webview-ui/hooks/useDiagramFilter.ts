import { useCallback, useMemo, useRef, useState } from 'react';
import {
  capInitialSelection,
  computeVisibleModels,
  INITIAL_MODEL_SELECTION_LIMIT,
  reconcileSelection,
  removeModels,
  scopeSelectionToFile,
} from '../../src/shared/filter';
import type { DiagramDomain } from '../../src/shared/diagramMode';
import { parseDiagramEntityId } from '../../src/shared/entityId';
import type { DiagramEntityFile } from '../../src/shared/protocol';
import type { DiagramEntityId } from '../../src/shared/entityId';
import { filesDeclaring } from '../../src/shared/relations';

export interface InitialCapNotice { shown: number; total: number }

type DomainSets = Record<DiagramDomain, Set<string>>;
type DomainStrings = Record<DiagramDomain, string>;
type DomainFiles = Record<DiagramDomain, DiagramEntityFile[]>;
const DOMAINS: readonly DiagramDomain[] = ['model', 'source'];
const emptySets = (): DomainSets => ({ model: new Set(), source: new Set() });

export interface DiagramFilterState {
  filesByDomain: Readonly<DomainFiles>;
  selectedFilesByDomain: Readonly<DomainSets>;
  selectedEntitiesByDomain: Readonly<DomainSets>;
  availableEntitiesByDomain: Readonly<Record<DiagramDomain, string[]>>;
  visibleEntities: Set<string>;
  searchByDomain: Readonly<Record<DiagramDomain, { files: string; entities: string }>>;
  setFileSearch(domain: DiagramDomain, value: string): void;
  setEntitySearch(domain: DiagramDomain, value: string): void;
  toggleFile(domain: DiagramDomain, uri: string, checked: boolean): void;
  toggleEntity(domain: DiagramDomain, id: string, checked: boolean): void;
  selectAllFiles(domain: DiagramDomain): void;
  clearFiles(domain: DiagramDomain): void;
  selectAllEntities(domain: DiagramDomain): void;
  clearEntities(domain: DiagramDomain): void;
  filterTick: number;
  applyEntityFiles(files: DiagramEntityFile[]): void;
  applyScope(domain: DiagramDomain, uri: string, entities?: readonly DiagramEntityId[]): void;
  applyLayoutTables(ids: string[]): void;
  addEntities(ids: readonly string[]): void;
  removeEntities(ids: readonly string[]): void;
  showImportedModels(ids: readonly string[], destinationUri: string): void;
  initialCapNotice: InitialCapNotice | null;
  dismissInitialCapNotice(): void;
}

function domainOf(id: string): DiagramDomain | null {
  const kind = parseDiagramEntityId(id)?.kind;
  return kind === 'model' || kind === 'source' ? kind : null;
}

export function useDiagramFilter(initialSelectionLimit: number = INITIAL_MODEL_SELECTION_LIMIT): DiagramFilterState {
  const [filesByDomain, setFilesByDomain] = useState<DomainFiles>({ model: [], source: [] });
  const [selectedFilesByDomain, setSelectedFiles] = useState<DomainSets>(emptySets);
  const [selectedEntitiesByDomain, setSelectedEntities] = useState<DomainSets>(emptySets);
  const [fileSearch, setFileSearchState] = useState<DomainStrings>({ model: '', source: '' });
  const [entitySearch, setEntitySearchState] = useState<DomainStrings>({ model: '', source: '' });
  const [filterTick, setFilterTick] = useState(0);
  const [initialCapNotice, setInitialCapNotice] = useState<InitialCapNotice | null>(null);
  const previousFilesRef = useRef<DomainStrings>({ model: '', source: '' });
  const previousEntitiesRef = useRef<DomainStrings>({ model: '', source: '' });
  const filesRef = useRef<DiagramEntityFile[]>([]);
  const hasLoadedRef = useRef(false);
  const layoutAppliedRef = useRef(false);

  const availableEntitiesByDomain = useMemo(() => Object.fromEntries(DOMAINS.map((domain) => {
    const names = new Set<string>();
    for (const file of filesByDomain[domain]) {
      if (selectedFilesByDomain[domain].has(file.uri)) for (const id of file.entities) names.add(id);
    }
    return [domain, [...names]];
  })) as Record<DiagramDomain, string[]>, [filesByDomain, selectedFilesByDomain]);

  const visibleEntities = useMemo(() => {
    const visible = new Set<string>();
    for (const domain of DOMAINS) {
      for (const id of computeVisibleModels(filesByDomain[domain], selectedFilesByDomain[domain], selectedEntitiesByDomain[domain])) visible.add(id);
    }
    return visible;
  }, [filesByDomain, selectedFilesByDomain, selectedEntitiesByDomain]);

  const applyEntityFiles = useCallback((files: DiagramEntityFile[]): void => {
    filesRef.current = files;
    const grouped: DomainFiles = {
      model: files.filter((file) => file.domain === 'model'),
      source: files.filter((file) => file.domain === 'source'),
    };
    setFilesByDomain(grouped);
    const initial = !hasLoadedRef.current;
    hasLoadedRef.current = true;
    setSelectedFiles((current) => {
      const next = emptySets();
      for (const domain of DOMAINS) {
        const all = grouped[domain].map((file) => file.uri);
        next[domain] = reconcileSelection(previousFilesRef.current[domain].split('\0').filter(Boolean), all, current[domain]);
        previousFilesRef.current[domain] = all.join('\0');
      }
      return next;
    });
    setSelectedEntities((current) => {
      const next = emptySets();
      for (const domain of DOMAINS) {
        const all = grouped[domain].flatMap((file) => file.entities);
        const previous = previousEntitiesRef.current[domain].split('\0').filter(Boolean);
        next[domain] = initial && domain === 'model' && all.length > initialSelectionLimit
          ? capInitialSelection(all, initialSelectionLimit)
          : reconcileSelection(previous, all, current[domain]);
        previousEntitiesRef.current[domain] = all.join('\0');
      }
      return next;
    });
    if (initial) {
      const total = grouped.model.flatMap((file) => file.entities).length;
      if (total > initialSelectionLimit) setInitialCapNotice({ shown: initialSelectionLimit, total });
    }
  }, [initialSelectionLimit]);

  const applyScope = useCallback((domain: DiagramDomain, uri: string, requested?: readonly DiagramEntityId[]): void => {
    if (layoutAppliedRef.current) return;
    const scoped = scopeSelectionToFile(filesRef.current, domain, uri, requested);
    if (scoped === null) return;
    const entities = [...scoped.entities];
    setSelectedFiles((current) => ({ ...current, [domain]: scoped.files, [domain === 'model' ? 'source' : 'model']: new Set() }));
    setSelectedEntities((current) => ({
      ...current,
      [domain]: entities.length > initialSelectionLimit ? capInitialSelection(entities, initialSelectionLimit) : scoped.entities,
      [domain === 'model' ? 'source' : 'model']: new Set(),
    }));
    setInitialCapNotice(entities.length > initialSelectionLimit ? { shown: initialSelectionLimit, total: entities.length } : null);
    setFilterTick((tick) => tick + 1);
  }, [initialSelectionLimit]);

  const applyLayoutTables = useCallback((ids: string[]): void => {
    layoutAppliedRef.current = true;
    setSelectedFiles({
      model: new Set(filesRef.current.filter((file) => file.domain === 'model').map((file) => file.uri)),
      source: new Set(filesRef.current.filter((file) => file.domain === 'source').map((file) => file.uri)),
    });
    setSelectedEntities({
      model: new Set(ids.filter((id) => domainOf(id) === 'model')),
      source: new Set(ids.filter((id) => domainOf(id) === 'source')),
    });
    setFilterTick((tick) => tick + 1);
  }, []);

  const mutateSet = useCallback((setter: React.Dispatch<React.SetStateAction<DomainSets>>, domain: DiagramDomain, value: string, checked: boolean): void => {
    setter((current) => { const next = new Set(current[domain]); checked ? next.add(value) : next.delete(value); return { ...current, [domain]: next }; });
    setFilterTick((tick) => tick + 1);
  }, []);
  const toggleFile = useCallback((domain: DiagramDomain, uri: string, checked: boolean) => mutateSet(setSelectedFiles, domain, uri, checked), [mutateSet]);
  const toggleEntity = useCallback((domain: DiagramDomain, id: string, checked: boolean) => mutateSet(setSelectedEntities, domain, id, checked), [mutateSet]);
  const selectAllFiles = useCallback((domain: DiagramDomain) => { setSelectedFiles((current) => ({ ...current, [domain]: new Set(filesByDomain[domain].map((file) => file.uri)) })); setFilterTick((tick) => tick + 1); }, [filesByDomain]);
  const clearFiles = useCallback((domain: DiagramDomain) => { setSelectedFiles((current) => ({ ...current, [domain]: new Set() })); setFilterTick((tick) => tick + 1); }, []);
  const selectAllEntities = useCallback((domain: DiagramDomain) => { setSelectedEntities((current) => ({ ...current, [domain]: new Set([...current[domain], ...availableEntitiesByDomain[domain]]) })); setFilterTick((tick) => tick + 1); }, [availableEntitiesByDomain]);
  const clearEntities = useCallback((domain: DiagramDomain) => { setSelectedEntities((current) => ({ ...current, [domain]: removeModels(current[domain], availableEntitiesByDomain[domain]) })); setFilterTick((tick) => tick + 1); }, [availableEntitiesByDomain]);

  const addEntities = useCallback((ids: readonly string[]): void => {
    const declaring = new Set(filesDeclaring(filesRef.current, ids));
    setSelectedFiles((current) => ({
      model: new Set([...current.model, ...filesRef.current.filter((file) => file.domain === 'model' && declaring.has(file.uri)).map((file) => file.uri)]),
      source: new Set([...current.source, ...filesRef.current.filter((file) => file.domain === 'source' && declaring.has(file.uri)).map((file) => file.uri)]),
    }));
    setSelectedEntities((current) => ({
      model: new Set([...current.model, ...ids.filter((id) => domainOf(id) === 'model')]),
      source: new Set([...current.source, ...ids.filter((id) => domainOf(id) === 'source')]),
    }));
    setFilterTick((tick) => tick + 1);
  }, []);
  const removeEntities = useCallback((ids: readonly string[]): void => {
    setSelectedEntities((current) => ({ model: removeModels(current.model, ids), source: removeModels(current.source, ids) }));
    setFilterTick((tick) => tick + 1);
  }, []);
  const showImportedModels = useCallback((ids: readonly string[], destinationUri: string): void => {
    setSelectedFiles((current) => ({ ...current, model: new Set([...current.model, destinationUri]) }));
    setSelectedEntities((current) => ({ ...current, model: new Set([...current.model, ...ids]) }));
    setFilterTick((tick) => tick + 1);
  }, []);

  return {
    filesByDomain, selectedFilesByDomain, selectedEntitiesByDomain, availableEntitiesByDomain, visibleEntities,
    searchByDomain: { model: { files: fileSearch.model, entities: entitySearch.model }, source: { files: fileSearch.source, entities: entitySearch.source } },
    setFileSearch: (domain, value) => setFileSearchState((current) => ({ ...current, [domain]: value })),
    setEntitySearch: (domain, value) => setEntitySearchState((current) => ({ ...current, [domain]: value })),
    toggleFile, toggleEntity, selectAllFiles, clearFiles, selectAllEntities, clearEntities, filterTick,
    applyEntityFiles, applyScope, applyLayoutTables, addEntities, removeEntities, showImportedModels,
    initialCapNotice, dismissInitialCapNotice: () => setInitialCapNotice(null),
  };
}
