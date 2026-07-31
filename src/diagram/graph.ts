/**
 * Pure graph logic: derives diagram nodes/edges from dbt model definitions.
 * MUST NOT import `vscode`.
 */
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
}

export interface DiagramGraph {
  nodes: TableNode[];
  edges: RelationEdge[];
}

/** Builds the diagram graph from a set of model definitions. */
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
  for (const model of models) {
    for (const ref of model.refs ?? []) {
      if (ref !== model.name && known.has(ref)) {
        edges.push({ source: model.name, target: ref });
      }
    }
  }

  return { nodes, edges };
}
