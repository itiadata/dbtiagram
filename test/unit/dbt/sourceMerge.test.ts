import { describe, expect, it } from 'vitest';
import { parseSourceYml } from '../../../src/dbt/sourceParse';
import { mergeSourceYml } from '../../../src/dbt/sourceMerge';

describe('mergeSourceYml', () => {
  it('changes descriptions without damaging unknown YAML', () => {
    const text = `version: 2\nsources:\n  - name: finops # source comment\n    schema: raw\n    tables:\n      - name: costs\n        description: old\n        tags: [x]\n        columns:\n          - name: id\n            description: old col\n            config:\n              meta: { sample_values: [1] }\n      - name: untouched\n`;
    const file = parseSourceYml(text); file.sources[0].tables[0].description = 'new'; file.sources[0].tables[0].columns![0].description = 'new col';
    const merged = mergeSourceYml(text, file);
    expect(merged).toContain('# source comment'); expect(merged).toContain('tags:'); expect(merged).toContain('sample_values'); expect(merged).toContain('description: new col'); expect(merged).toContain('name: untouched');
  });
});
