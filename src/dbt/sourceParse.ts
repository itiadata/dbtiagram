import { parse } from 'yaml';
import type { DataTestEntry, ModelColumn } from './types';
import type { SourceDefinition, SourceTableDefinition, SourceYmlFile } from './sourceTypes';

export class SourceYmlParseError extends Error {
  public readonly source: string;
  public readonly cause?: unknown;
  constructor(source: string, message: string, cause?: unknown) {
    super(message); this.name = 'SourceYmlParseError'; this.source = source; this.cause = cause;
  }
}
export class NotASourceYmlFileError extends SourceYmlParseError {
  constructor(source: string) { super(source, 'File has no top-level "sources" array; not a dbt source yml'); this.name = 'NotASourceYmlFileError'; }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const extras = (raw: Record<string, unknown>, modeled: readonly string[]): Record<string, unknown> | undefined => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) if (!modeled.includes(key)) out[key] = raw[key];
  return Object.keys(out).length > 0 ? out : undefined;
};

function column(raw: Record<string, unknown>, source: string): ModelColumn {
  if (typeof raw.name !== 'string' || raw.name.trim() === '') throw new SourceYmlParseError(source, 'Every column must have a non-empty string "name"');
  const rawConfig = isRecord(raw.config) ? raw.config : undefined;
  const meta = rawConfig !== undefined && isRecord(rawConfig.meta) ? rawConfig.meta : undefined;
  let config = rawConfig;
  if (rawConfig !== undefined && meta !== undefined) {
    const { meta: _meta, ...rest } = rawConfig;
    config = Object.keys(rest).length > 0 ? rest : undefined;
  }
  const dataTests = Array.isArray(raw.data_tests)
    ? raw.data_tests.filter((entry): entry is DataTestEntry => typeof entry === 'string' || isRecord(entry))
    : undefined;
  return { name: raw.name, ...(typeof raw.data_type === 'string' ? { dataType: raw.data_type } : {}), ...(typeof raw.description === 'string' ? { description: raw.description } : {}), ...(Array.isArray(raw.tests) ? { tests: raw.tests.filter((v): v is string => typeof v === 'string') } : {}), ...(dataTests !== undefined ? { dataTests } : {}), ...(meta !== undefined ? { meta } : {}), ...(config !== undefined ? { config } : {}) };
}

function table(raw: Record<string, unknown>, source: string): SourceTableDefinition {
  if (typeof raw.name !== 'string' || raw.name.trim() === '') throw new SourceYmlParseError(source, 'Every source table must have a non-empty string "name"');
  return { name: raw.name, ...(typeof raw.description === 'string' ? { description: raw.description } : {}), ...(isRecord(raw.config) ? { config: raw.config } : {}), ...(Array.isArray(raw.columns) ? { columns: raw.columns.filter(isRecord).map((value) => column(value, source)) } : {}), ...(extras(raw, ['name', 'description', 'config', 'columns']) !== undefined ? { extra: extras(raw, ['name', 'description', 'config', 'columns']) } : {}) };
}

function sourceBlock(raw: Record<string, unknown>, source: string): SourceDefinition {
  if (typeof raw.name !== 'string' || raw.name.trim() === '') throw new SourceYmlParseError(source, 'Every source must have a non-empty string "name"');
  if (!Array.isArray(raw.tables)) throw new SourceYmlParseError(source, 'Every source must have a "tables" array');
  const extra = extras(raw, ['name', 'description', 'tables']);
  return { name: raw.name, ...(typeof raw.description === 'string' ? { description: raw.description } : {}), tables: raw.tables.filter(isRecord).map((value) => table(value, source)), ...(extra !== undefined ? { extra } : {}) };
}

export function parseSourceYml(content: string, source = '<unknown>'): SourceYmlFile {
  let raw: unknown;
  try { raw = parse(content); } catch (error) { throw new SourceYmlParseError(source, `File is not valid YAML: ${String(error)}`, error); }
  if (!isRecord(raw)) throw new SourceYmlParseError(source, 'Top level of a source yml must be a YAML mapping');
  if (raw.models !== undefined || raw.sources === undefined) throw new NotASourceYmlFileError(source);
  if (!Array.isArray(raw.sources)) throw new SourceYmlParseError(source, 'source yml is missing the required "sources" array');
  const extra = extras(raw, ['version', 'sources']);
  return { version: typeof raw.version === 'number' ? raw.version : 2, sources: raw.sources.filter(isRecord).map((value) => sourceBlock(value, source)), ...(extra !== undefined ? { extra } : {}) };
}
