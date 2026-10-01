/** Pure SQL-lineage identities and stable transitive traversal. */
import { findSqlRefs, findSqlSources } from '../dbt/sqlRefs';
import { modelEntityId } from '../shared/entityId';
export type LineageNodeKind = 'local' | 'unknown' | 'external';
export interface LineageNodeId { package: string; name: string }
export interface LineageEdge { parent: string; child: string }

export function lineageId(target: LineageNodeId): string {
  return modelEntityId(target.package, target.name);
}

export type SqlLineageTarget =
  | { kind: 'model'; packageName: string; name: string }
  | { kind: 'source'; sourceName: string; tableName: string };
export function sqlLineageTargets(packageName: string, text: string): SqlLineageTarget[] {
  return [
    ...findSqlRefs(text).map((ref): SqlLineageTarget => ({ kind: 'model', packageName: ref.package ?? packageName, name: ref.name })),
    ...findSqlSources(text).map((source): SqlLineageTarget => ({ kind: 'source', sourceName: source.source, tableName: source.table })),
  ];
}

export function lineageAncestors(edges: readonly LineageEdge[], start: string): string[] {
  return traverse(edges, start, (edge, id) => edge.child === id ? edge.parent : null);
}

export function lineageDescendants(edges: readonly LineageEdge[], start: string): string[] {
  return traverse(edges, start, (edge, id) => edge.parent === id ? edge.child : null);
}

function traverse(
  edges: readonly LineageEdge[],
  start: string,
  next: (edge: LineageEdge, id: string) => string | null,
): string[] {
  const seen = new Set([start]);
  const visit = (id: string): void => {
    for (const edge of edges) {
      const candidate = next(edge, id);
      if (candidate === null || seen.has(candidate)) continue;
      seen.add(candidate);
      visit(candidate);
    }
  };
  visit(start);
  const result: string[] = [];
  for (const edge of edges) {
    for (const candidate of [edge.parent, edge.child]) {
      if (candidate !== start && seen.has(candidate) && !result.includes(candidate)) result.push(candidate);
    }
  }
  return result;
}
