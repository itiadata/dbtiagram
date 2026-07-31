/**
 * Pure graph logic: derives diagram nodes/edges from dbt model definitions.
 * MUST NOT import `vscode`.
 */
import { parseRef } from '../dbt/refs';
import type { ModelColumn, ModelDefinition } from '../dbt/types';

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
}

export interface RelationEdge {
  source: string;
  target: string;
  /** FK columns on the source model; empty for a table-level edge. */
  sourceColumns: string[];
  /** FK columns on the target model; empty for a table-level edge. */
  targetColumns: string[];
}

export interface DiagramGraph {
  nodes: TableNode[];
  edges: RelationEdge[];
}

/**
 * Builds the diagram graph from a set of model definitions.
 *
 * Edges are derived exclusively from `foreign_key` constraints (spec 02). The
 * legacy `refs` key is not a relationship source and never produces edges.
 */
export function buildDiagram(models: ModelDefinition[]): DiagramGraph {
  const known = new Set(models.map((m) => m.name));

  const nodes: TableNode[] = models.map((m) => ({
    id: m.name,
    label: m.name,
    description: m.description,
    columns: (m.columns ?? []).map((c: ModelColumn) => ({
      name: c.name,
      dataType: c.dataType,
      description: c.description,
    })),
  }));

  const edges: RelationEdge[] = [];
  const seen = new Set<string>();

  for (const model of models) {
    for (const constraint of model.constraints ?? []) {
      if (constraint.type !== 'foreign_key') continue;
      if (constraint.to === undefined) continue;
      const ref = parseRef(constraint.to);
      if (ref === null) continue;
      const target = ref.name;
      if (target === model.name || !known.has(target)) continue;

      const edge: RelationEdge = {
        source: model.name,
        target,
        sourceColumns: constraint.columns ?? [],
        targetColumns: constraint.toColumns ?? [],
      };

      const key = `${edge.source}\u0000${edge.target}\u0000${JSON.stringify(
        edge.sourceColumns,
      )}\u0000${JSON.stringify(edge.targetColumns)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  }

  return { nodes, edges };
}
