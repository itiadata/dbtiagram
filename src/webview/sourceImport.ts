import { importSourceTables } from '../dbt/importSource';
import { flattenSourceTables } from '../dbt/sourceTypes';
import type { ModelDefinition, ModelYmlFile } from '../dbt/types';
import type { SourceYmlFile } from '../dbt/sourceTypes';
import type { DiagramEntityFile, SourceImportReport } from '../shared/protocol';

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
    sources.map((candidate) => ({ uri: candidate.uri, label: candidate.label, entities: flattenSourceTables(candidate.file.sources).map((table) => table.id) })),
    models.map((candidate) => ({ uri: candidate.uri, label: candidate.label, entities: candidate.file.models.map((model) => model.name) })),
  );
  if (selection === undefined) return undefined;

  const source = sources.find((candidate) => candidate.uri === selection.sourceUri);
  const destination = models.find((candidate) => candidate.uri === selection.destinationUri);
  if (source === undefined) throw new Error(`Source file "${selection.sourceUri}" is no longer available.`);
  if (destination === undefined) throw new Error(`Destination file "${selection.destinationUri}" is no longer available.`);
  const selectedIds = new Set(selection.tableIds);
  const allTables = flattenSourceTables(source.file.sources);
  for (const id of selection.tableIds) {
    if (!allTables.some((table) => table.id === id)) throw new Error(`Source table "${id}" is no longer available.`);
  }
  const result = importSourceTables(destination.file, allTables.filter((table) => selectedIds.has(table.id)), host.workspaceModels());
  await host.writeDestination(destination.uri, result.destination);
  return { destinationUri: destination.uri, importedModels: result.importedModels, brokenForeignKeys: result.brokenForeignKeys };
}
