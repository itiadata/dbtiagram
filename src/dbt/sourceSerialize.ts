import { stringify } from 'yaml';
import { toDbtColumn } from './merge/shape';
import type { SourceDefinition, SourceTableDefinition, SourceYmlFile } from './sourceTypes';

function toTable(table: SourceTableDefinition): Record<string, unknown> {
  return { ...(table.extra ?? {}), name: table.name, ...(table.description !== undefined ? { description: table.description } : {}), ...(table.config !== undefined ? { config: table.config } : {}), ...(table.columns !== undefined ? { columns: table.columns.map(toDbtColumn) } : {}) };
}
function toSource(source: SourceDefinition): Record<string, unknown> {
  return { ...(source.extra ?? {}), name: source.name, ...(source.description !== undefined ? { description: source.description } : {}), tables: source.tables.map(toTable) };
}
export function toDbtSourceShape(file: SourceYmlFile): Record<string, unknown> {
  return { ...(file.version !== undefined ? { version: file.version } : {}), ...(file.extra ?? {}), sources: file.sources.map(toSource) };
}
export function serializeSourceYml(file: SourceYmlFile): string { return stringify(toDbtSourceShape(file)); }
