import { parse } from 'yaml';
import { parseModelYml } from '../dbt/parse';
import { parseSourceYml } from '../dbt/sourceParse';
import { flattenSourceTables, type SourceDefinition } from '../dbt/sourceTypes';
import type { ModelDefinition } from '../dbt/types';
import { buildDiagram, buildSourceDiagram } from '../diagram/graph';
import { applyLayout, parseDiagramLayout } from '../diagram/layoutFile';
import { disambiguateFileLabels } from '../shared/labels';
import { STATIC_SITE_SCHEMA_VERSION, staticLayoutRoute, type StaticDiagramUniverse, type StaticSiteData } from '../shared/staticSite';
import type { StaticProjectInputs } from './project';

export interface StaticSiteWarning { code: 'missing-layout-tables'; path: string; tables: string[] }
export interface BuiltStaticSite { data: StaticSiteData; warnings: StaticSiteWarning[] }

export function buildStaticSite(inputs: StaticProjectInputs, initialSelectionLimit: number): BuiltStaticSite {
  const modelFiles: { path: string; models: ModelDefinition[] }[] = [];
  const sourceFiles: { path: string; sources: SourceDefinition[] }[] = [];
  for (const file of [...inputs.yamlFiles].sort(byPath)) {
    let raw: unknown;
    try { raw = parse(file.text); } catch (error) { throw new Error(`${file.relativePath}: File is not valid YAML: ${String(error)}`); }
    if (!isRecord(raw)) continue;
    try {
      if ('models' in raw) modelFiles.push({ path: file.relativePath, models: parseModelYml(file.text, file.relativePath).models });
      else if ('sources' in raw) sourceFiles.push({ path: file.relativePath, sources: parseSourceYml(file.text, file.relativePath).sources });
    } catch (error) { throw new Error(`${file.relativePath}: ${errorMessage(error)}`); }
  }
  assertUniqueModels(modelFiles);
  assertUniqueSources(sourceFiles);
  const model = universe('model', modelFiles.map((file) => ({ path: file.path, entities: file.models.map((item) => item.name) })), buildDiagram(modelFiles.flatMap((file) => file.models)));
  const source = universe('source', sourceFiles.map((file) => ({ path: file.path, entities: flattenSourceTables(file.sources).map((item) => item.id) })), buildSourceDiagram(sourceFiles.flatMap((file) => file.sources)));
  const warnings: StaticSiteWarning[] = [];
  const layouts = [...inputs.layoutFiles].sort(byPath).map((file) => {
    let layout;
    try { layout = parseDiagramLayout(file.text, file.relativePath.replace(/\.dbtiagram\.yml$/i, '')); }
    catch (error) { throw new Error(`${file.relativePath}: ${errorMessage(error)}`); }
    const graph = layout.mode === 'model' ? model?.graph : source?.graph;
    const applied = applyLayout(layout, new Set(graph?.nodes.map((node) => node.id) ?? []));
    if (applied.missing.length > 0) warnings.push({ code: 'missing-layout-tables', path: file.relativePath, tables: applied.missing });
    return { route: staticLayoutRoute(file.relativePath), relativePath: file.relativePath, title: layout.name, layout, missing: applied.missing };
  });
  return {
    data: { schemaVersion: STATIC_SITE_SCHEMA_VERSION, initialSelectionLimit, ...(model !== undefined ? { model } : {}), ...(source !== undefined ? { source } : {}), layouts },
    warnings,
  };
}

function universe(mode: 'model' | 'source', files: { path: string; entities: string[] }[], graph: ReturnType<typeof buildDiagram>): StaticDiagramUniverse | undefined {
  if (graph.nodes.length === 0) return undefined;
  const labels = disambiguateFileLabels(files.map((file) => file.path), '');
  return { mode, graph, files: files.filter((file) => file.entities.length > 0).map((file) => ({ uri: file.path, label: labels.get(file.path) ?? file.path, entities: file.entities })) };
}
function assertUniqueModels(files: { path: string; models: ModelDefinition[] }[]): void {
  const seen = new Map<string, string>();
  for (const file of files) for (const model of file.models) { const first = seen.get(model.name); if (first !== undefined) throw new Error(`Duplicate model id "${model.name}" in ${first} and ${file.path}`); seen.set(model.name, file.path); }
}
function assertUniqueSources(files: { path: string; sources: SourceDefinition[] }[]): void {
  const seen = new Map<string, string>();
  for (const file of files) for (const table of flattenSourceTables(file.sources)) { const first = seen.get(table.id); if (first !== undefined) throw new Error(`Duplicate source table id "${table.id}" in ${first} and ${file.path}`); seen.set(table.id, file.path); }
}
function byPath(left: { relativePath: string }, right: { relativePath: string }): number { return left.relativePath.localeCompare(right.relativePath); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
