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

/** A dbt `constraints` block entry (contracts). Unmodeled keys are preserved. */
export interface ModelConstraint {
  type?: string; // e.g. 'primary_key' | 'foreign_key' | 'unique' | 'check'
  columns?: string[];
  to?: string; // raw dbt ref string, e.g. ref('s_pp', 'audit_result')
  toColumns?: string[]; // to_columns on disk
  name?: string;
  expression?: string;
  warnUnenforced?: boolean; // warn_unenforced on disk
  errorIf?: string; // error_if on disk
  /** Any other constraint keys, preserved verbatim. */
  [key: string]: unknown;
}

export interface ModelDefinition {
  name: string;
  description?: string;
  config?: ModelConfig;
  columns?: ModelColumn[];
  /** Declared contracts; FK relationships are read from these. */
  constraints?: ModelConstraint[];
  meta?: Record<string, unknown>;
  /** Unmodeled model-level keys (e.g. `data_tests`), preserved on write-back. */
  extra?: Record<string, unknown>;
}

/** The top-level shape of a dbt `model.yml` (schema.yml) file. */
export interface ModelYmlFile {
  version?: number;
  models: ModelDefinition[];
}
