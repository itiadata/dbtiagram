import { describe, expect, it } from 'vitest';
import { buildStaticMenu, parseStaticDiagramHash, serializeStaticSiteData, staticLayoutRoute, STATIC_SITE_SCHEMA_VERSION, type StaticSiteData } from '../../../src/shared/staticSite';
import { buildLayout } from '../../../src/diagram/layoutFile';

const layout = (path: string, title: string) => ({ route: staticLayoutRoute(path), relativePath: path, title, layout: buildLayout(title, 'model', []), missing: [] });
const data: StaticSiteData = { schemaVersion: STATIC_SITE_SCHEMA_VERSION, initialSelectionLimit: 100, model: { mode: 'model', graph: { nodes: [], edges: [] }, files: [] }, layouts: [layout('diagrams/a.dbtiagram.yml', 'Orders'), layout('archive/a.dbtiagram.yml', 'Orders')] };

describe('static site contract', () => {
  it('builds deterministic grouped menu entries and routes', () => expect(buildStaticMenu(data).map((entry) => entry.route)).toEqual(['models', 'diagram/archive/a.dbtiagram.yml', 'diagram/diagrams/a.dbtiagram.yml']));
  it('shows paths for duplicate display names', () => expect(buildStaticMenu(data).slice(1).map((entry) => entry.detail)).toEqual(['archive/a.dbtiagram.yml', 'diagrams/a.dbtiagram.yml']));
  it('filters saved layouts by title or path', () => expect(buildStaticMenu(data, 'archive').map((entry) => entry.route)).toEqual(['models', 'diagram/archive/a.dbtiagram.yml']));
  it('parses stable hashes', () => expect(['#/', '#/models', '#/sources', '#/diagram/a%20b.dbtiagram.yml', '#/bad'].map(parseStaticDiagramHash)).toEqual([null, 'models', 'sources', 'diagram/a%20b.dbtiagram.yml', null]));
  it('escapes embedded JSON script breakers', () => { const text = serializeStaticSiteData({ ...data, layouts: [layout('</script>\u2028\u2029.dbtiagram.yml', 'x')] }); expect(text).not.toContain('</script>'); expect(text).not.toContain('\u2028'); expect(JSON.parse(text).layouts[0].relativePath).toBe('</script>\u2028\u2029.dbtiagram.yml'); });
});
