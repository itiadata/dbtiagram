import { importSourceTables } from '../dbt/importSource';
import { flattenSourceTables } from '../dbt/sourceTypes';
import type { ModelDefinition, ModelYmlFile } from '../dbt/types';
import type { SourceYmlFile } from '../dbt/sourceTypes';
import type { DiagramEntityFile, SourceImportReport } from '../shared/protocol';
import { modelEntityId } from '../shared/entityId';
import { parseDiagramEntityId } from '../shared/entityId';

export interface SourceImportCandidate<TFile> {
  uri: string;
  label: string;
  file: TFile;
}

export interface SourceImportSelection {
  sourceUri: string;
  tableIds: string[];
  destinationUri: string;
}

export interface SourceImportHost {
  loadSources(): Promise<readonly SourceImportCandidate<SourceYmlFile>[]>;
  modelFiles(): readonly SourceImportCandidate<ModelYmlFile>[];
  workspaceModels(): readonly ModelDefinition[];
  pick(sourceFiles: readonly DiagramEntityFile[], modelFiles: readonly DiagramEntityFile[]): Promise<SourceImportSelection | undefined>;
  writeDestination(uri: string, file: ModelYmlFile): Promise<void>;
}

export async function runSourceImport(host: SourceImportHost): Promise<SourceImportReport | undefined> {
  const sources = await host.loadSources();
  const models = host.modelFiles();
  const selection = await host.pick(
    sources.map((candidate) => ({ uri: candidate.uri, label: candidate.label, domain: 'source' as const, entities: flattenSourceTables(candidate.file.sources).map((table) => `source:${table.sourceName}:${table.table.name}` as const) })),
    models.map((candidate) => ({ uri: candidate.uri, label: candidate.label, domain: 'model' as const, entities: candidate.file.models.map((model) => `model:unknown:${model.name}` as const) })),
  );
  if (selection === undefined) return undefined;

  const source = sources.find((candidate) => candidate.uri === selection.sourceUri);
  const destination = models.find((candidate) => candidate.uri === selection.destinationUri);
  if (source === undefined) throw new Error(`Source file "${selection.sourceUri}" is no longer available.`);
  if (destination === undefined) throw new Error(`Destination file "${selection.destinationUri}" is no longer available.`);
  const selectedIds = new Set(selection.tableIds.map((id) => { const parsed = parseDiagramEntityId(id); return parsed?.kind === 'source' ? `${parsed.sourceName}.${parsed.tableName}` : id; }));
  const allTables = flattenSourceTables(source.file.sources);
  for (const id of selectedIds) {
    if (!allTables.some((table) => table.id === id)) throw new Error(`Source table "${id}" is no longer available.`);
  }
  const result = importSourceTables(destination.file, allTables.filter((table) => selectedIds.has(table.id)), host.workspaceModels());
  await host.writeDestination(destination.uri, result.destination);
  return { destinationUri: destination.uri, importedModels: result.importedModels, importedEntityIds: result.importedModels.map((name) => modelEntityId('unknown', name)), brokenForeignKeys: result.brokenForeignKeys };
}
