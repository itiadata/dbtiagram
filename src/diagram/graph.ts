/**
 * Pure graph logic: derives diagram nodes/edges from dbt model definitions.
 * MUST NOT import `vscode`.
 */
import { parseRef } from '../dbt/refs';
import { readVirtualConstraints } from '../dbt/virtual';
import type { ForeignKeyDescriptor, ModelColumn, ModelDefinition } from '../dbt/types';

export interface TableNodeColumn {
  name: string;
  dataType?: string;
  description?: string;
}

export interface TableNode {
  id: string;
  label: string;
  description?: string;
  columns: TableNodeColumn[];
  /** The displayed primary key: virtual-first (spec 08, Confirm at Approval (c)). */
  primaryKey?: { columns: string[]; virtual: boolean };
  /** Every declared FK — real constraints first, then virtual meta entries. */
  foreignKeys: ForeignKeyDescriptor[];
  /**
   * This table's own FK columns (declaration order), plus any column another
   * table's FK targets (order their edges were built), duplicates collapsed.
   * Feeds the `pkAndFk` column display mode (spec 24).
   */
  foreignKeyColumns: string[];
}

export interface RelationEdge {
  source: string;
  target: string;
  /** FK columns on the source model (equal-length, non-empty pair with `targetColumns`). */
  sourceColumns: string[];
  /** FK columns on the target model (equal-length, non-empty pair with `sourceColumns`). */
  targetColumns: string[];
  /** True when the FK is virtual (meta-stored) — drawn dashed (spec 08). */
  virtual: boolean;
}

export interface DiagramGraph {
  nodes: TableNode[];
  edges: RelationEdge[];
}

/**
 * Builds the diagram graph from a set of model definitions.
 *
 * Edges are derived from `foreign_key` constraints (spec 02) plus virtual FKs
 * stored in `config.meta.dbtiagram.virtual` (spec 08). The legacy `refs` key is
 * not a relationship source and never produces edges.
 */
export function buildDiagram(models: ModelDefinition[]): DiagramGraph {
  const known = new Set(models.map((m) => m.name));

  const nodes: TableNode[] = models.map((m) => {
    const virtual = readVirtualConstraints(m);

    let primaryKey: TableNode['primaryKey'];
    if (virtual.primaryKey !== undefined) {
      // The dbtiagram-namespaced block records what was last done in the
      // diagram — it wins over a coexisting real constraint for display.
      primaryKey = { columns: virtual.primaryKey.columns, virtual: true };
    } else {
      const constraint = (m.constraints ?? []).find((c) => c.type === 'primary_key');
      if (constraint !== undefined) {
        primaryKey = { columns: constraint.columns ?? [], virtual: false };
      }
    }

    const foreignKeys: ForeignKeyDescriptor[] = [];
    for (const constraint of m.constraints ?? []) {
      if (constraint.type !== 'foreign_key') continue;
      const to = constraint.to ?? '';
      const ref = parseRef(to);
      foreignKeys.push({
        target: ref === null ? undefined : ref.name,
        to,
        columns: constraint.columns ?? [],
        toColumns: constraint.toColumns ?? [],
        virtual: false,
      });
    }
    for (const fk of virtual.foreignKeys ?? []) {
      const ref = parseRef(fk.to);
      foreignKeys.push({
        target: ref === null ? undefined : ref.name,
        to: fk.to,
        columns: fk.columns,
        toColumns: fk.toColumns,
        virtual: true,
      });
    }

    return {
      id: m.name,
      label: m.name,
      description: m.description,
      columns: (m.columns ?? []).map((c: ModelColumn) => ({
        name: c.name,
        dataType: c.dataType,
        description: c.description,
      })),
      ...(primaryKey !== undefined ? { primaryKey } : {}),
      foreignKeys,
      foreignKeyColumns: [],
    };
  });

  const edges: RelationEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (
    source: string,
    constraint: { columns?: string[]; to?: string; toColumns?: string[] },
    virtual: boolean,
  ): void => {
    if (constraint.to === undefined) return;
    const ref = parseRef(constraint.to);
    if (ref === null) return;
    const target = ref.name;
    if (target === source || !known.has(target)) return;

    // Spec 09 (merged): FK edges need at least one column pair of equal length
    // — an FK with empty or unequal-length arrays draws no edge (it stays an
    // editable draft in the sidebar, feature 10). Table-level edges are gone.
    const sourceColumns = constraint.columns ?? [];
    const targetColumns = constraint.toColumns ?? [];
    if (sourceColumns.length === 0 || sourceColumns.length !== targetColumns.length) return;

    const edge: RelationEdge = {
      source,
      target,
      sourceColumns,
      targetColumns,
      virtual,
    };

    // Real edges are added before virtual ones (see below), so when a real
    // and a virtual FK describe the same mapping the first (real) wins.
    const key = `${edge.source}\u0000${edge.target}\u0000${JSON.stringify(
      edge.sourceColumns,
    )}\u0000${JSON.stringify(edge.targetColumns)}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  for (const model of models) {
    const virtual = readVirtualConstraints(model);
    // Real constraints first so their edges dedupe ahead of virtual ones.
    for (const constraint of model.constraints ?? []) {
      if (constraint.type !== 'foreign_key') continue;
      addEdge(model.name, constraint, false);
    }
    for (const fk of virtual.foreignKeys ?? []) {
      addEdge(model.name, fk, true);
    }
  }

  // Spec 24: foreignKeyColumns feeds the pkAndFk column display mode — a
  // table's own FK columns (declaration order) plus any column another
  // table's FK targets (edge-build order), duplicates collapsed.
  const foreignKeyColumnsById = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  const addForeignKeyColumn = (nodeId: string, column: string): void => {
    const columns = foreignKeyColumnsById.get(nodeId);
    if (columns === undefined || columns.includes(column)) return;
    columns.push(column);
  };
  for (const node of nodes) {
    for (const fk of node.foreignKeys) {
      for (const column of fk.columns) {
        addForeignKeyColumn(node.id, column);
      }
    }
  }
  for (const edge of edges) {
    for (const column of edge.targetColumns) {
      addForeignKeyColumn(edge.target, column);
    }
  }
  for (const node of nodes) {
    node.foreignKeyColumns = foreignKeyColumnsById.get(node.id) ?? [];
  }

  return { nodes, edges };
}
