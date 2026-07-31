import { describe, expect, it } from 'vitest';
import { ModelYmlParseError, parseModelYml } from '../../../src/dbt/parse';
import { serializeModelYml } from '../../../src/dbt/serialize';

const SAMPLE = `version: 2
models:
  - name: orders
    description: One row per order
    columns:
      - name: id
        description: Primary key
        data_type: integer
        tests:
          - not_null
          - unique
  - name: customers
    description: One row per customer
`;

describe('parseModelYml', () => {
  it('parses models with columns, data types, and tests', () => {
    const file = parseModelYml(SAMPLE);
    expect(file.version).toBe(2);
    expect(file.models).toHaveLength(2);

    const orders = file.models[0];
    expect(orders.name).toBe('orders');
    expect(orders.description).toBe('One row per order');
    expect(orders.columns).toEqual([
      {
        name: 'id',
        description: 'Primary key',
        dataType: 'integer',
        tests: ['not_null', 'unique'],
      },
    ]);
  });

  it('reads declared refs from a model', () => {
    const file = parseModelYml(`
models:
  - name: orders
    refs: [customers]
`);
    expect(file.models[0].refs).toEqual(['customers']);
  });

  it('defaults missing version to 2', () => {
    const file = parseModelYml('models: []');
    expect(file.version).toBe(2);
  });

  it('throws ModelYmlParseError for non-YAML content', () => {
    expect(() => parseModelYml('::: not yaml', 'bad.yml')).toThrow(ModelYmlParseError);
  });

  it('throws ModelYmlParseError when models is missing', () => {
    expect(() => parseModelYml('version: 2')).toThrow(ModelYmlParseError);
  });

  it('throws ModelYmlParseError for models without a name', () => {
    expect(() => parseModelYml('models:\n  - description: unnamed')).toThrow(ModelYmlParseError);
  });
});

describe('round trip', () => {
  it('parse -> serialize -> parse preserves model data', () => {
    const file = parseModelYml(SAMPLE);
    const reparsed = parseModelYml(serializeModelYml(file));
    expect(reparsed).toEqual(file);
  });
});
