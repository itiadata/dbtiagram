/**
 * Pure derivation of "fields matrix" rows (spec 27) from a `DiagramGraph`'s
 * nodes: one row per `(model, column)` pair, plus discovery of the distinct
 * `config.meta` keys found across a set of nodes. MUST NOT import `vscode`.
 */
import type { TableNode } from './graph';

export interface MatrixRow {
  model: string;
  column: string;
  dataType?: string;
  description?: string;
  isPrimaryKey: boolean;
  /** Only meaningful when isPrimaryKey is true; mirrors the model's PK virtual flag. */
  virtualPrimaryKey: boolean;
  /** One entry per discovered meta key in scope; absent key -> undefined. */
  meta: Record<string, string | undefined>;
}

/** Unions and dedupes `column.meta` keys across the given nodes, alphabetical. */
export function discoverMetaKeys(nodes: readonly TableNode[]): string[] {
  const keys = new Set<string>();
  for (const node of nodes) {
    for (const column of node.columns) {
      if (column.meta === undefined) continue;
      for (const key of Object.keys(column.meta)) {
        keys.add(key);
      }
    }
  }
  return [...keys].sort();
}

/** Builds one row per `(model, column)` pair across the given nodes. */
export function buildMatrixRows(
  nodes: readonly TableNode[],
  metaKeys: readonly string[],
): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const node of nodes) {
    const pkColumns = new Set(node.primaryKey?.columns ?? []);
    const pkVirtual = node.primaryKey?.virtual ?? false;
    for (const column of node.columns) {
      const isPrimaryKey = pkColumns.has(column.name);
      const meta: Record<string, string | undefined> = {};
      for (const key of metaKeys) {
        const value = column.meta?.[key];
        meta[key] = value === undefined ? undefined : String(value);
      }
      rows.push({
        model: node.id,
        column: column.name,
        dataType: column.dataType,
        description: column.description,
        isPrimaryKey,
        virtualPrimaryKey: isPrimaryKey ? pkVirtual : false,
        meta,
      });
    }
  }
  return rows;
}
