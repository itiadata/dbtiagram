/** Pure SQL-lineage expansion orchestration. */
import { sqlLineageTargets } from '../diagram/lineage';
import type { TableNode } from '../diagram/graph';
import { lineageDescendants, type LineageEdge } from '../diagram/lineage';
import { parseDiagramEntityId } from '../shared/entityId';

export interface LineageProgress { scanned: number; total: number }
export interface LineageExpansionResult {
  requestId: string;
  root: string;
  direction: 'upstream' | 'downstream';
  nodes: TableNode[];
  edges: LineageEdge[];
}
export interface LineageHost {
  readModelSql(modelId: string): Promise<string | null>;
  allProjectModelIds(): Promise<string[]>;
  resolveModelNode(packageName: string, modelName: string): Promise<TableNode>;
  resolveSourceNode(sourceName: string, tableName: string): Promise<TableNode>;
  progress(value: LineageProgress): void;
  isCancelled(): boolean;
}

export async function expandUpstream(
  host: LineageHost, requestId: string, root: string,
): Promise<LineageExpansionResult> {
  const rootIdentity = await resolvedIdentity(host, root);
  const nodes: TableNode[] = [];
  const edges: LineageEdge[] = [];
  const visited = new Set([root]);
  const visit = async (childId: string, readableName: string, packageName: string): Promise<void> => {
    const text = await host.readModelSql(readableName);
    if (text === null) return;
    for (const target of sqlLineageTargets(packageName, text)) {
      const resolved = target.kind === 'model' ? await host.resolveModelNode(target.packageName, target.name) : await host.resolveSourceNode(target.sourceName, target.tableName);
      const key = `${resolved.id}\u0000${childId}`;
      if (!edges.some((edge) => `${edge.parent}\u0000${edge.child}` === key)) {
        edges.push({ parent: resolved.id, child: childId });
      }
      if (visited.has(resolved.id)) continue;
      visited.add(resolved.id);
      nodes.push(resolved);
      if (target.kind === 'model' && resolved.lineageKind !== 'external') await visit(resolved.id, target.name, target.packageName);
    }
  };
  await visit(root, rootIdentity.name, rootIdentity.packageName);
  return { requestId, root, direction: 'upstream', nodes, edges };
}

export async function expandDownstream(
  host: LineageHost, requestId: string, root: string,
): Promise<LineageExpansionResult | null> {
  const rootIdentity = await resolvedIdentity(host, root);
  const ids = await host.allProjectModelIds();
  const allEdges: LineageEdge[] = [];
  const nodesById = new Map<string, TableNode>();
  for (let index = 0; index < ids.length; index += 1) {
    if (host.isCancelled()) return null;
    const childName = ids[index];
    const child = await host.resolveModelNode(rootIdentity.packageName, childName);
    nodesById.set(child.id, child);
    const text = await host.readModelSql(childName);
    if (host.isCancelled()) return null;
    if (text !== null) for (const target of sqlLineageTargets(rootIdentity.packageName, text)) {
      const parent = target.kind === 'model' ? await host.resolveModelNode(target.packageName, target.name) : await host.resolveSourceNode(target.sourceName, target.tableName);
      nodesById.set(parent.id, parent);
      allEdges.push({ parent: parent.id, child: child.id });
    }
    host.progress({ scanned: index + 1, total: ids.length });
  }
  const start = nodesById.has(root) ? root : rootIdentity.name;
  const descendants = new Set(lineageDescendants(allEdges, start));
  const edges = allEdges.filter((edge) => descendants.has(edge.child) && (edge.parent === start || descendants.has(edge.parent)));
  const nodes = [...nodesById.values()].filter((item) => descendants.has(item.id));
  return { requestId, root, direction: 'downstream', nodes, edges };
}

export async function refreshDisplayedLineage(
  host: LineageHost,
  displayed: ReadonlySet<string>,
  _previous: readonly LineageEdge[],
): Promise<LineageEdge[]> {
  const edges: LineageEdge[] = [];
  for (const child of displayed) {
    const parsedChild = parseDiagramEntityId(child);
    if (parsedChild?.kind !== 'model') continue;
    const current = identity(child);
    const text = await host.readModelSql(current.name);
    if (text === null) continue;
    for (const target of sqlLineageTargets(current.packageName, text)) {
      const parent = target.kind === 'model' ? await host.resolveModelNode(target.packageName, target.name) : await host.resolveSourceNode(target.sourceName, target.tableName);
      if (displayed.has(parent.id)) edges.push({ parent: parent.id, child });
    }
  }
  return dedupeEdges(edges);
}

function identity(id: string): { packageName: string; name: string } {
  const match = /^(?:model|external):([^:]+):(.+)$/.exec(id);
  return match === null ? { packageName: '', name: id } : { packageName: match[1], name: match[2] };
}

async function resolvedIdentity(host: LineageHost, id: string): Promise<{ packageName: string; name: string }> {
  const parsed = identity(id);
  if (parsed.packageName !== '') return parsed;
  const node = await host.resolveModelNode('', parsed.name);
  return { packageName: node.packageName ?? '', name: parsed.name };
}

function dedupeEdges(edges: readonly LineageEdge[]): LineageEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.parent}\u0000${edge.child}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
