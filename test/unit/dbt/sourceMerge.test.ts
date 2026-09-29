import { describe, expect, it } from 'vitest';
import { parseSourceYml } from '../../../src/dbt/sourceParse';
import { mergeSourceYml } from '../../../src/dbt/sourceMerge';
import { applySourceEdit } from '../../../src/dbt/sourceEdit';

describe('mergeSourceYml', () => {
  it('changes descriptions without damaging unknown YAML', () => {
    const text = `version: 2\nsources:\n  - name: finops # source comment\n    schema: raw\n    tables:\n      - name: costs\n        description: old\n        tags: [x]\n        columns:\n          - name: id\n            description: old col\n            config:\n              meta: { sample_values: [1] }\n      - name: untouched\n`;
    const file = parseSourceYml(text); file.sources[0].tables[0].description = 'new'; file.sources[0].tables[0].columns![0].description = 'new col';
    const merged = mergeSourceYml(text, file);
    expect(merged).toContain('# source comment'); expect(merged).toContain('tags:'); expect(merged).toContain('sample_values'); expect(merged).toContain('description: new col'); expect(merged).toContain('name: untouched');
  });

  it('writes source column meta without damaging unknown YAML', () => {
    const text = `version: 2\nsources:\n  - name: finops # source comment\n    tables:\n      - name: costs\n        freshness: {warn_after: {count: 1, period: day}}\n        columns:\n          - name: id\n            config:\n              tags: [key]\n              meta: {owner: data}\n      - name: untouched\n        columns:\n          - name: id\n`;
    const file = parseSourceYml(text);
    file.sources = applySourceEdit(file.sources, { kind: 'setColumnMeta', model: 'finops.costs', column: 'id', key: 'confidentiality', value: 'restricted' }).sources;
    const merged = mergeSourceYml(text, file);
    expect(merged).toContain('# source comment');
    expect(merged).toContain('freshness:');
    expect(merged).toContain('tags: [key]');
    expect(merged).toContain('owner: data');
    expect(merged).toContain('confidentiality: restricted');
    expect(merged).toContain('name: untouched');
  });
});
