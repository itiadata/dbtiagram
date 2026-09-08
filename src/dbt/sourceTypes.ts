import type { ModelColumn, ModelConfig } from './types';

export interface SourceTableDefinition {
  name: string;
  description?: string;
  config?: ModelConfig;
  columns?: ModelColumn[];
  extra?: Record<string, unknown>;
}

export interface SourceDefinition {
  name: string;
  description?: string;
  tables: SourceTableDefinition[];
  extra?: Record<string, unknown>;
}

export interface SourceYmlFile {
  version?: number;
  sources: SourceDefinition[];
  extra?: Record<string, unknown>;
}

export interface QualifiedSourceTable {
  id: string;
  sourceName: string;
  table: SourceTableDefinition;
}

export function flattenSourceTables(sources: readonly SourceDefinition[]): QualifiedSourceTable[] {
  return sources.flatMap((source) =>
    source.tables.map((table) => ({ id: `${source.name}.${table.name}`, sourceName: source.name, table })),
  );
}
