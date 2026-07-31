/**
 * Parsing of dbt `model.yml` files. Pure logic — MUST NOT import `vscode`.
 */
import { parse } from 'yaml';
import type { ModelDefinition, ModelYmlFile } from './types';

export class ModelYmlParseError extends Error {
  public readonly source: string;
  public readonly cause?: unknown;

  constructor(source: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ModelYmlParseError';
    this.source = source;
    this.cause = cause;
  }
}

/** Parses the content of a model.yml file into a `ModelYmlFile`. */
export function parseModelYml(content: string, source = '<unknown>'): ModelYmlFile {
  let raw: unknown;
  try {
    raw = parse(content);
  } catch (err) {
    throw new ModelYmlParseError(source, `File is not valid YAML: ${String(err)}`, err);
  }

  if (!isRecord(raw)) {
    throw new ModelYmlParseError(source, 'Top level of a model.yml must be a YAML mapping');
  }

  const record = raw;
  const models = record.models;

  if (!Array.isArray(models)) {
    throw new ModelYmlParseError(source, 'model.yml is missing the required "models" array');
  }

  const parsed: ModelDefinition[] = [];
  for (const entry of models) {
    if (!isRecord(entry)) {
      throw new ModelYmlParseError(source, 'Every entry in "models" must be a mapping');
    }
    parsed.push(normalizeModel(entry, source));
  }

  const version = record.version;
  return {
    version: typeof version === 'number' ? version : 2,
    models: parsed,
  };
}

/** Coerces a raw YAML mapping into a strict `ModelDefinition`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeModel(raw: Record<string, unknown>, source: string): ModelDefinition {
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ModelYmlParseError(source, 'Every model must have a non-empty string "name"');
  }

  const model: ModelDefinition = { name };

  const description = raw.description;
  if (typeof description === 'string') model.description = description;

  const config = raw.config;
  if (isRecord(config)) {
    model.config = config;
  }

  const columns = raw.columns;
  if (Array.isArray(columns)) {
    model.columns = columns
      .filter((c): c is Record<string, unknown> => isRecord(c))
      .map((c) => normalizeColumn(c, source));
  }

  const refs = raw.refs;
  if (Array.isArray(refs)) {
    model.refs = refs.filter((r): r is string => typeof r === 'string');
  }

  const meta = raw.meta;
  if (isRecord(meta)) {
    model.meta = meta;
  }

  return model;
}

function normalizeColumn(raw: Record<string, unknown>, source: string) {
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ModelYmlParseError(source, 'Every column must have a non-empty string "name"');
  }
  return {
    name,
    ...(typeof raw.data_type === 'string' ? { dataType: raw.data_type } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(Array.isArray(raw.tests) ? { tests: raw.tests.filter((t): t is string => typeof t === 'string') } : {}),
  };
}
