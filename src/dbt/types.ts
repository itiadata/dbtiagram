/**
 * Pure dbt domain types. This module MUST NOT import `vscode`.
 */

export interface ModelColumn {
  name: string;
  dataType?: string;
  description?: string;
  tests?: string[];
  meta?: Record<string, unknown>;
}

export interface ModelConfig {
  materialized?: string;
  [key: string]: unknown;
}

export interface ModelDefinition {
  name: string;
  description?: string;
  config?: ModelConfig;
  columns?: ModelColumn[];
  /** Optional declared relationships; each entry names a target model. */
  refs?: string[];
  meta?: Record<string, unknown>;
}

/** The top-level shape of a dbt `model.yml` (schema.yml) file. */
export interface ModelYmlFile {
  version?: number;
  models: ModelDefinition[];
}
