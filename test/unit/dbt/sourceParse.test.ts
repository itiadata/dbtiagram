import { describe, expect, it } from 'vitest';
import { NotASourceYmlFileError, SourceYmlParseError, parseSourceYml } from '../../../src/dbt/sourceParse';

describe('parseSourceYml', () => {
  it('parses nested source tables and columns', () => {
    const file = parseSourceYml(`version: 2\nsources:\n  - name: finops\n    schema: raw_finops\n    tables:\n      - name: astro_cost_breakdown\n        columns:\n          - name: Workspace Name\n            data_type: VARCHAR(16777216)\n            config:\n              meta: { max_length: 17, sample: x }\n`);
    expect(file.sources[0].tables[0].columns?.[0]).toMatchObject({ name: 'Workspace Name', dataType: 'VARCHAR(16777216)', meta: { max_length: 17, sample: 'x' } });
    expect(file.sources[0].extra).toEqual({ schema: 'raw_finops' });
  });
  it('model root wins over source root', () => expect(() => parseSourceYml('models: []\nsources: []\n')).toThrow(NotASourceYmlFileError));
  it('requires a sources array', () => expect(() => parseSourceYml('sources: nope\n')).toThrow(new SourceYmlParseError('<unknown>', 'source yml is missing the required "sources" array')));
});
