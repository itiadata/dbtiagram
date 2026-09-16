import type { DiagramLayout } from '../diagram/layoutFile';
import type { DiagramGraph } from '../diagram/graph';
import type { DiagramMode } from './diagramMode';
import type { DiagramEntityFile } from './protocol';

export const STATIC_SITE_SCHEMA_VERSION = 1;
export type StaticDiagramRoute = 'models' | 'sources' | `diagram/${string}`;

export interface StaticDiagramUniverse {
  mode: DiagramMode;
  graph: DiagramGraph;
  files: DiagramEntityFile[];
}

export interface StaticLayoutEntry {
  route: StaticDiagramRoute;
  relativePath: string;
  title: string;
  layout: DiagramLayout;
  missing: string[];
}

export interface StaticSiteData {
  schemaVersion: typeof STATIC_SITE_SCHEMA_VERSION;
  initialSelectionLimit: number;
  model?: StaticDiagramUniverse;
  source?: StaticDiagramUniverse;
  layouts: StaticLayoutEntry[];
}

export interface StaticMenuEntry {
  route: StaticDiagramRoute;
  title: string;
  detail?: string;
  mode: DiagramMode;
  kind: 'explorer' | 'layout';
}

export function staticLayoutRoute(relativePath: string): StaticDiagramRoute {
  const encoded = relativePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  return `diagram/${encoded}`;
}

export function parseStaticDiagramHash(hash: string): StaticDiagramRoute | null {
  const route = hash.replace(/^#\/?/, '');
  if (route === 'models' || route === 'sources') return route;
  if (!route.startsWith('diagram/') || route.length === 'diagram/'.length) return null;
  try {
    const path = route.slice('diagram/'.length).split('/').map(decodeURIComponent).join('/');
    return path.endsWith('.dbtiagram.yml') ? staticLayoutRoute(path) : null;
  } catch {
    return null;
  }
}

export function buildStaticMenu(data: StaticSiteData, query = ''): StaticMenuEntry[] {
  const entries: StaticMenuEntry[] = [];
  if (data.model !== undefined) entries.push({ route: 'models', title: 'Model explorer', mode: 'model', kind: 'explorer' });
  if (data.source !== undefined) entries.push({ route: 'sources', title: 'Source explorer', mode: 'source', kind: 'explorer' });
  const titleCounts = new Map<string, number>();
  for (const layout of data.layouts) {
    const key = layout.title.toLocaleLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const needle = query.trim().toLocaleLowerCase();
  const layouts = [...data.layouts].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }) ||
    left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: 'base' }),
  );
  for (const layout of layouts) {
    if (needle !== '' && !`${layout.title}\n${layout.relativePath}`.toLocaleLowerCase().includes(needle)) continue;
    entries.push({
      route: layout.route,
      title: layout.title,
      ...(titleCounts.get(layout.title.toLocaleLowerCase())! > 1 ? { detail: layout.relativePath } : {}),
      mode: layout.layout.mode,
      kind: 'layout',
    });
  }
  return entries;
}

export function serializeStaticSiteData(data: StaticSiteData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
