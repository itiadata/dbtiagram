import { parse } from 'yaml';
import { parseModelYml } from '../dbt/parse';
import { parseSourceYml } from '../dbt/sourceParse';
import { flattenSourceTables, type SourceDefinition } from '../dbt/sourceTypes';
import type { ModelDefinition } from '../dbt/types';
import { buildDiagram } from '../diagram/graph';
import { applyLayout, parseDiagramLayout } from '../diagram/layoutFile';
import { disambiguateFileLabels } from '../shared/labels';
import { STATIC_SITE_SCHEMA_VERSION, staticLayoutRoute, type StaticDiagramUniverse, type StaticSiteData } from '../shared/staticSite';
import type { StaticProjectInputs } from './project';
import { modelEntityId, sourceEntityId } from '../shared/entityId';
import { sqlLineageTargets } from '../diagram/lineage';

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
  const modelInputs = modelFiles.flatMap((file) => file.models.map((model) => ({ packageName: inputs.packageName, model })));
  const sources = sourceFiles.flatMap((file) => file.sources);
  const known = new Set([...modelInputs.map((item) => modelEntityId(item.packageName, item.model.name)), ...flattenSourceTables(sources).map((item) => sourceEntityId(item.sourceName, item.table.name))]);
  const lineageEdges = inputs.sqlFiles.flatMap((file) => {
    const childName = file.relativePath.split('/').at(-1)?.replace(/\.sql$/i, '') ?? '';
    const child = modelEntityId(inputs.packageName, childName);
    return sqlLineageTargets(inputs.packageName, file.text).flatMap((target) => {
      const parent = target.kind === 'model' ? modelEntityId(target.packageName, target.name) : sourceEntityId(target.sourceName, target.tableName);
      return known.has(parent) && known.has(child) ? [{ parent, child }] : [];
    });
  });
  const graph = buildDiagram(modelInputs, sources, lineageEdges);
  const files = [
    ...modelFiles.map((file) => ({ path: file.path, domain: 'model' as const, entities: file.models.map((item) => modelEntityId(inputs.packageName, item.name)) })),
    ...sourceFiles.map((file) => ({ path: file.path, domain: 'source' as const, entities: flattenSourceTables(file.sources).map((item) => sourceEntityId(item.sourceName, item.table.name)) })),
  ];
  const combined = universe(files, graph);
  const warnings: StaticSiteWarning[] = [];
  const layouts = [...inputs.layoutFiles].sort(byPath).map((file) => {
    let layout;
    try { layout = parseDiagramLayout(file.text, file.relativePath.replace(/\.dbtiagram\.yml$/i, '')); }
    catch (error) { throw new Error(`${file.relativePath}: ${errorMessage(error)}`); }
    const applied = applyLayout(layout, new Set(graph.nodes.map((node) => node.id)));
    if (applied.missing.length > 0) warnings.push({ code: 'missing-layout-tables', path: file.relativePath, tables: applied.missing });
    return { route: staticLayoutRoute(file.relativePath), relativePath: file.relativePath, title: layout.name, layout, missing: applied.missing };
  });
  return {
    data: { schemaVersion: STATIC_SITE_SCHEMA_VERSION, initialSelectionLimit, ...(combined !== undefined ? { universe: combined } : {}), layouts },
    warnings,
  };
}

function universe(files: { path: string; domain: 'model' | 'source'; entities: import('../shared/entityId').DiagramEntityId[] }[], graph: ReturnType<typeof buildDiagram>): StaticDiagramUniverse | undefined {
  if (graph.nodes.length === 0) return undefined;
  const labels = disambiguateFileLabels(files.map((file) => file.path), '');
  return { graph, files: files.filter((file) => file.entities.length > 0).map((file) => ({ uri: file.path, label: labels.get(file.path) ?? file.path, domain: file.domain, entities: file.entities })) };
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
