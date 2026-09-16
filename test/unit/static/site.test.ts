import { describe, expect, it } from 'vitest';
import { buildStaticSite } from '../../../src/static/site';
import type { StaticProjectInputs } from '../../../src/static/project';

const inputs = (yamlFiles: StaticProjectInputs['yamlFiles'], layoutFiles: StaticProjectInputs['layoutFiles'] = []): StaticProjectInputs => ({ projectRoot: '/p', yamlFiles, layoutFiles });
describe('static site builder', () => {
  it('classifies model source mixed and unrelated YAML', () => { const built = buildStaticSite(inputs([{ relativePath: 'models/m.yml', text: 'models: [{name: m}]\nsources: [{name: ignored, tables: []}]' }, { relativePath: 'models/s.yml', text: 'sources: [{name: raw, tables: [{name: t}]}]' }, { relativePath: 'models/x.yml', text: 'version: 2' }]), 100); expect(built.data.model?.graph.nodes.map((n) => n.id)).toEqual(['m']); expect(built.data.source?.graph.nodes.map((n) => n.id)).toEqual(['raw.t']); });
  it('fails duplicate identities', () => expect(() => buildStaticSite(inputs([{ relativePath: 'models/a.yml', text: 'models: [{name: same}]' }, { relativePath: 'models/b.yml', text: 'models: [{name: same}]' }]), 100)).toThrow('Duplicate model id "same" in models/a.yml and models/b.yml'));
  it('reconciles missing layout tables as warnings', () => { const built = buildStaticSite(inputs([{ relativePath: 'models/a.yml', text: 'models: [{name: orders}]' }], [{ relativePath: 'd.dbtiagram.yml', text: 'version: 2\nmode: model\nname: D\ntables:\n  - {name: orders, x: 0, y: 0}\n  - {name: deleted_model, x: 1, y: 1}\n' }]), 100); expect(built.warnings).toEqual([{ code: 'missing-layout-tables', path: 'd.dbtiagram.yml', tables: ['deleted_model'] }]); });
  it('fails malformed inputs with their path', () => expect(() => buildStaticSite(inputs([{ relativePath: 'models/bad.yml', text: 'models: [' }]), 100)).toThrow('models/bad.yml'));
});
