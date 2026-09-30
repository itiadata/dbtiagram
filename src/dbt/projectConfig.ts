import { parse } from 'yaml';

export interface DbtProjectConfig {
  name: string;
  modelPaths: string[];
  macroPaths: string[];
  testPaths: string[];
  snapshotPaths: string[];
}

export function parseDbtProjectConfig(text: string): DbtProjectConfig {
  const value: unknown = parse(text);
  if (!isRecord(value) || typeof value.name !== 'string' || value.name.trim() === '') {
    throw new Error('dbt_project.yml must contain a non-empty name');
  }
  return {
    name: value.name,
    modelPaths: paths(value['model-paths'], 'models'),
    macroPaths: paths(value['macro-paths'], 'macros'),
    testPaths: paths(value['test-paths'], 'tests'),
    snapshotPaths: paths(value['snapshot-paths'], 'snapshots'),
  };
}

function paths(value: unknown, fallback: string): string[] {
  if (value === undefined) return [fallback];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('dbt project paths must be string arrays');
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
