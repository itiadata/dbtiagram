/**
 * Parsing of dbt `model.yml` files. Pure logic — MUST NOT import `vscode`.
 */
import { parse } from 'yaml';
import type { ModelConstraint, ModelDefinition, ModelYmlFile } from './types';

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
  const modeledKeys = new Set(['name', 'description', 'config', 'columns', 'constraints', 'meta']);

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!modeledKeys.has(key)) extra[key] = raw[key];
  }
  if (Object.keys(extra).length > 0) model.extra = extra;

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

  const constraints = raw.constraints;
  if (Array.isArray(constraints)) {
    model.constraints = constraints
      .filter((c): c is Record<string, unknown> => isRecord(c))
      .map((c) => normalizeConstraint(c));
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

/**
 * Coerces a raw constraint mapping into a strict `ModelConstraint`. Known keys
 * are mapped to their camelCase form; every other key is preserved verbatim so
 * the round trip parse -> edit -> serialize -> parse is lossless.
 */
function normalizeConstraint(raw: Record<string, unknown>): ModelConstraint {
  const constraint: ModelConstraint = {};
  const modeledKeys = new Set([
    'type',
    'columns',
    'to',
    'to_columns',
    'name',
    'expression',
    'warn_unenforced',
    'error_if',
  ]);

  const type = raw.type;
  if (typeof type === 'string') constraint.type = type;

  const columns = raw.columns;
  if (Array.isArray(columns)) {
    constraint.columns = columns.filter((c): c is string => typeof c === 'string');
  }

  const to = raw.to;
  if (typeof to === 'string') constraint.to = to;

  const toColumns = raw.to_columns;
  if (Array.isArray(toColumns)) {
    constraint.toColumns = toColumns.filter((c): c is string => typeof c === 'string');
  }

  const name = raw.name;
  if (typeof name === 'string') constraint.name = name;

  const expression = raw.expression;
  if (typeof expression === 'string') constraint.expression = expression;

  const warnUnenforced = raw.warn_unenforced;
  if (typeof warnUnenforced === 'boolean') constraint.warnUnenforced = warnUnenforced;

  const errorIf = raw.error_if;
  if (typeof errorIf === 'string') constraint.errorIf = errorIf;

  for (const key of Object.keys(raw)) {
    if (!modeledKeys.has(key)) constraint[key] = raw[key];
  }

  return constraint;
}
