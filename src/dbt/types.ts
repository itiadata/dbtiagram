/**
 * Pure dbt domain types. This module MUST NOT import `vscode`.
 */

/** A data test entry: a bare test name or a mapping form with options. */
export type DataTestEntry = string | Record<string, unknown>;

export interface ModelColumn {
  name: string;
  dataType?: string;
  description?: string;
  /** Legacy `tests` key, preserved as-is (spec 08, Confirm at Approval (i)). */
  tests?: string[];
  /** `data_tests` on disk (spec 08): typed so the PK editor can own `not_null`. */
  dataTests?: DataTestEntry[];
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
  /** Model-level `data_tests` (spec 08): promoted from `extra` so the PK
   *  editor can keep `dbt_utils.unique_combination_of_columns` in sync. */
  dataTests?: DataTestEntry[];
  /** Remaining unmodeled model-level keys, preserved on write-back. */
  extra?: Record<string, unknown>;
}

/** One virtual (unenforced) foreign key stored in `config.meta.dbtiagram.virtual`. */
export interface VirtualForeignKey {
  to: string;
  columns: string[];
  toColumns: string[];
}

export interface VirtualPrimaryKey {
  columns: string[];
}

export interface VirtualConstraintsBlock {
  primaryKey?: VirtualPrimaryKey;
  foreignKeys?: VirtualForeignKey[];
}

/**
 * A foreign key as shown to the webview: how the graph and the sidebar talk
 * about one FK. Real FKs come from `constraints`, virtual ones from meta.
 * Lives in the domain layer so both `src/diagram/graph.ts` (produces them)
 * and `src/dbt/edit.ts` (matches on them) can import it.
 */
export interface ForeignKeyDescriptor {
  /** Parsed model name of `to`, when parseable. */
  target?: string;
  /** The raw ref string as it appears on disk, e.g. ref('customers'). */
  to: string;
  columns: string[];
  toColumns: string[];
  virtual: boolean;
}

/** The top-level shape of a dbt `model.yml` (schema.yml) file. */
export interface ModelYmlFile {
  version?: number;
  models: ModelDefinition[];
}
