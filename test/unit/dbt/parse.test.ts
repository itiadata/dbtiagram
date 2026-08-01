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

  it('parses constraints with type, columns, to, and to_columns', () => {
    const file = parseModelYml(`
models:
  - name: orders
    constraints:
      - type: primary_key
        columns: [order_id]
      - type: foreign_key
        columns: [customer_id]
        to: ref('s_pp', 'customers')
        to_columns: [customer_id]
`);
    expect(file.models[0].constraints).toEqual([
      { type: 'primary_key', columns: ['order_id'] },
      {
        type: 'foreign_key',
        columns: ['customer_id'],
        to: "ref('s_pp', 'customers')",
        toColumns: ['customer_id'],
      },
    ]);
  });

  it('preserves unmodeled constraint keys verbatim', () => {
    const file = parseModelYml(`
models:
  - name: orders
    constraints:
      - type: check
        expression: total_amount >= 0
        name: positive_total
`);
    expect(file.models[0].constraints).toEqual([
      { type: 'check', expression: 'total_amount >= 0', name: 'positive_total' },
    ]);
  });

  it('keeps a legacy refs block as an unmodeled key, not a typed field', () => {
    const file = parseModelYml(`
models:
  - name: orders
    refs: [customers]
`);
    expect(Object.keys(file.models[0])).not.toContain('refs');
    expect(file.models[0].constraints).toBeUndefined();
    expect(file.models[0].extra).toEqual({ refs: ['customers'] });
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

  it('round trips constraints and unmodeled model-level keys', () => {
    const source = `version: 2
models:
  - name: orders
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [order_id]
    refs: [customers]
    constraints:
      - type: primary_key
        columns: [order_id]
      - type: foreign_key
        columns: [customer_id]
        to: ref('customers')
        to_columns: [customer_id]
        warn_unenforced: true
`;
    const file = parseModelYml(source);
    const reparsed = parseModelYml(serializeModelYml(file));
    expect(reparsed).toEqual(file);
    expect(reparsed.models[0].constraints?.[1]).toMatchObject({
      toColumns: ['customer_id'],
      warnUnenforced: true,
    });
    // data_tests is a modeled field now (spec 08), not a passthrough extra.
    expect(reparsed.models[0].dataTests).toEqual([
      {
        'dbt_utils.unique_combination_of_columns': {
          arguments: { combination_of_columns: ['order_id'] },
        },
      },
    ]);
    expect(reparsed.models[0].extra).toEqual({ refs: ['customers'] });
  });
});

describe('data_tests (spec 08)', () => {
  it('parses model-level data_tests with string and mapping entries', () => {
    const file = parseModelYml(`
models:
  - name: orders
    data_tests:
      - not_null
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [order_id]
`);
    expect(file.models[0].dataTests).toEqual([
      'not_null',
      {
        'dbt_utils.unique_combination_of_columns': {
          arguments: { combination_of_columns: ['order_id'] },
        },
      },
    ]);
    expect(file.models[0].extra).toBeUndefined();
  });

  it('drops non-string, non-mapping data_tests entries', () => {
    const file = parseModelYml(`
models:
  - name: orders
    data_tests:
      - not_null
      - 42
      - true
      - [nested]
`);
    expect(file.models[0].dataTests).toEqual(['not_null']);
  });

  it('parses column-level data_tests (no longer dropped on write-back)', () => {
    const file = parseModelYml(`
models:
  - name: orders
    columns:
      - name: order_id
        data_tests:
          - not_null
`);
    expect(file.models[0].columns?.[0].dataTests).toEqual(['not_null']);
  });

  it('round trips column-level data_tests', () => {
    const file = parseModelYml(`
models:
  - name: orders
    columns:
      - name: order_id
        data_tests:
          - not_null
`);
    const reparsed = parseModelYml(serializeModelYml(file));
    expect(reparsed).toEqual(file);
    expect(reparsed.models[0].columns?.[0].dataTests).toEqual(['not_null']);
  });

  it('keeps the legacy column tests key separate from data_tests', () => {
    const file = parseModelYml(`
models:
  - name: orders
    columns:
      - name: order_id
        tests:
          - unique
        data_tests:
          - not_null
`);
    expect(file.models[0].columns?.[0].tests).toEqual(['unique']);
    expect(file.models[0].columns?.[0].dataTests).toEqual(['not_null']);
  });
});
