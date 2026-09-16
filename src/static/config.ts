import * as path from 'path';
import { parse } from 'yaml';

export interface StaticGeneratorOptions {
  project: string;
  output: string;
  config: string;
  layoutGlob: string;
  initialSelectionLimit: number;
}
export interface StaticCliArguments {
  project: string;
  output: string;
  config?: string;
  layoutGlob?: string;
  initialSelectionLimit?: number;
}
export const DEFAULT_LAYOUT_GLOB = '**/*.dbtiagram.yml';
export const DEFAULT_STATIC_INITIAL_SELECTION_LIMIT = 100;

export function parseStaticCliArguments(argv: readonly string[]): StaticCliArguments {
  const values = new Map<string, string>();
  const allowed = new Set(['--project', '--output', '--config', '--layout-glob', '--initial-selection-limit']);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || value.startsWith('--')) throw new Error(`Invalid argument ${flag ?? ''}`.trim());
    values.set(flag, value);
  }
  const project = values.get('--project');
  const output = values.get('--output');
  if (project === undefined) throw new Error('Missing required argument --project');
  if (output === undefined) throw new Error('Missing required argument --output');
  const rawLimit = values.get('--initial-selection-limit');
  const initialSelectionLimit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (initialSelectionLimit !== undefined && (!Number.isInteger(initialSelectionLimit) || initialSelectionLimit <= 0)) {
    throw new Error('--initial-selection-limit must be a positive integer');
  }
  return {
    project,
    output,
    ...(values.has('--config') ? { config: values.get('--config')! } : {}),
    ...(values.has('--layout-glob') ? { layoutGlob: values.get('--layout-glob')! } : {}),
    ...(initialSelectionLimit !== undefined ? { initialSelectionLimit } : {}),
  };
}

export async function resolveStaticGeneratorOptions(
  args: StaticCliArguments,
  readText: (filePath: string) => Promise<string | null>,
): Promise<StaticGeneratorOptions> {
  const project = path.resolve(args.project);
  const output = path.resolve(args.output);
  const config = path.resolve(project, args.config ?? 'dbtiagram.config.yml');
  const text = await readText(config);
  let fileGlob = DEFAULT_LAYOUT_GLOB;
  let fileLimit = DEFAULT_STATIC_INITIAL_SELECTION_LIMIT;
  if (text !== null) {
    const raw: unknown = parse(text);
    if (!isRecord(raw)) throw new Error(`${config}: configuration must be a YAML mapping`);
    const allowed = new Set(['version', 'layoutGlob', 'initialSelectionLimit']);
    const unknown = Object.keys(raw).find((key) => !allowed.has(key));
    if (unknown !== undefined) throw new Error(`${config}: unknown configuration key "${unknown}"`);
    if (raw.version !== 1) throw new Error(`${config}: version must be 1`);
    if (raw.layoutGlob !== undefined && (typeof raw.layoutGlob !== 'string' || raw.layoutGlob.trim() === '')) throw new Error(`${config}: layoutGlob must be a non-empty string`);
    if (raw.initialSelectionLimit !== undefined && (!Number.isInteger(raw.initialSelectionLimit) || (raw.initialSelectionLimit as number) <= 0)) throw new Error(`${config}: initialSelectionLimit must be a positive integer`);
    fileGlob = typeof raw.layoutGlob === 'string' ? raw.layoutGlob : fileGlob;
    fileLimit = typeof raw.initialSelectionLimit === 'number' ? raw.initialSelectionLimit : fileLimit;
  }
  return {
    project,
    output,
    config,
    layoutGlob: args.layoutGlob ?? fileGlob,
    initialSelectionLimit: args.initialSelectionLimit ?? fileLimit,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
