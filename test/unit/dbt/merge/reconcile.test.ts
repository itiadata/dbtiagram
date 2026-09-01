import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { mergeModelYml } from '../../../../src/dbt/merge';
import { parseModelYml } from '../../../../src/dbt/parse';
import { serializeModelYml } from '../../../../src/dbt/serialize';
import type { ModelYmlFile } from '../../../../src/dbt/types';

/** Parses `text` and hands the mutable domain object to `edit`. */
function edited(text: string, edit: (file: ModelYmlFile) => void): ModelYmlFile {
  const file = parseModelYml(text, 'test.yml');
  edit(file);
  return file;
}

/** The order of top-level keys of the first model in `text`. */
function modelKeys(text: string): string[] {
  const parsed = parseYaml(text) as { models: Record<string, unknown>[] };
  return Object.keys(parsed.models[0]);
}

/** The order of keys of the first column of the first model in `text`. */
function columnKeys(text: string): string[] {
  const parsed = parseYaml(text) as {
    models: { columns: Record<string, unknown>[] }[];
  };
  return Object.keys(parsed.models[0].columns[0]);
}

const COLUMN_FILE = `version: 2
models:
  - name: orders
    columns:
      - name: order_item_id
        data_type: varchar
        description: hello
        custom_tag: a value
`;

describe('mergeModelYml', () => {
  it('preserves unknown column keys when a description changes', () => {
    const file = edited(COLUMN_FILE, (f) => {
      f.models[0].columns![0].description = 'bye';
    });
    const out = mergeModelYml(COLUMN_FILE, file);

    expect(out).toContain('custom_tag: a value');
    expect(out).toContain('description: bye');
    expect(out).not.toContain('description: hello');

    const keys = columnKeys(out);
    expect(keys).toEqual(['name', 'data_type', 'description', 'custom_tag']);
  });

  it('keeps on-disk model key order', () => {
    const text = `version: 2
models:
  - name: orders
    tags: [finance]
    description: old
    columns:
      - name: id
`;
    const file = edited(text, (f) => {
      f.models[0].description = 'new';
    });
    const out = mergeModelYml(text, file);

    expect(modelKeys(out)).toEqual(['name', 'tags', 'description', 'columns']);
    expect(out).toContain('tags: [finance]');
    expect(out).toContain('description: new');
  });

  it('preserves comments and untouched models', () => {
    const text = `version: 2
models:
  # lead comment for orders
  - name: orders
    description: the orders model # trailing note
    columns:
      - name: id
        description: old

  # lead comment for customers
  - name: customers
    description: the customers model
    columns:
      - name: id
        description: untouched
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].description = 'new';
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('# lead comment for orders');
    expect(out).toContain('# trailing note');
    expect(out).toContain('# lead comment for customers');

    const secondModel = (input: string): string =>
      input.slice(input.indexOf('- name: customers'));
    expect(secondModel(out)).toBe(secondModel(text));
  });

  it('removes only managed keys', () => {
    const text = `version: 2
models:
  - name: orders
    tags: [finance]
    constraints:
      - type: primary_key
        columns: [id]
    columns:
      - name: id
`;
    const file = edited(text, (f) => {
      delete f.models[0].constraints;
    });
    const out = mergeModelYml(text, file);

    expect(out).not.toContain('constraints:');
    expect(out).toContain('tags: [finance]');
  });

  it('keeps a managed column key whose value shape the parser ignores', () => {
    const text = `version: 2
models:
  - name: products
    columns:
      - name: product_id
        data_type: integer
        data_tests:
          - not_null
        meta: test
`;
    // Clearing the PK drops the column's data_tests. `meta: test` is a scalar,
    // so `parseModelYml` never sees it and it is absent from the desired
    // state -- it must survive all the same.
    const file = edited(text, (f) => {
      delete f.models[0].columns![0].dataTests;
    });
    const out = mergeModelYml(text, file);

    expect(out).not.toContain('data_tests');
    expect(out).not.toContain('not_null');
    expect(out).toContain('meta: test');
    expect(columnKeys(out)).toEqual(['name', 'data_type', 'meta']);
  });

  it('keeps other column tests when only one is removed', () => {
    const text = `version: 2
models:
  - name: products
    columns:
      - name: product_id
        data_tests:
          - not_null
          - unique
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].dataTests = ['unique'];
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('unique');
    expect(out).not.toContain('not_null');
  });

  it('never removes an unmanaged model key absent from desired', () => {
    const text = `version: 2
models:
  - name: orders
    unknown_thing: keep me
    description: old
`;
    // Built by hand so `unknown_thing` is genuinely absent from the desired state.
    const file: ModelYmlFile = {
      version: 2,
      models: [{ name: 'orders', description: 'new' }],
    };
    const out = mergeModelYml(text, file);

    expect(out).toContain('unknown_thing: keep me');
    expect(out).toContain('description: new');
  });

  it('returns byte-identical text for a no-op merge', () => {
    const file = parseModelYml(COLUMN_FILE, 'test.yml');
    expect(mergeModelYml(COLUMN_FILE, file)).toBe(COLUMN_FILE);
  });

  it('preserves CRLF line endings', () => {
    const text = COLUMN_FILE.replace(/\n/g, '\r\n');
    const file = edited(text, (f) => {
      f.models[0].columns![0].description = 'bye';
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('falls back to the serializer for unparseable text', () => {
    const file: ModelYmlFile = { version: 2, models: [{ name: 'orders' }] };
    expect(mergeModelYml(': [', file)).toBe(serializeModelYml(file));
  });

  it('creates missing model keys in the standard order', () => {
    const text = `version: 2
models:
  - name: orders
    description: d
    tags: [finance]
    columns:
      - name: id
`;
    const file = edited(text, (f) => {
      f.models[0].dataTests = ['some_test'];
      f.models[0].constraints = [{ type: 'primary_key', columns: ['id'] }];
    });
    const out = mergeModelYml(text, file);

    expect(modelKeys(out)).toEqual([
      'name',
      'description',
      'data_tests',
      'constraints',
      'tags',
      'columns',
    ]);
  });

  it('creates missing column keys in the standard order', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        description: d
        custom_tag: t
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].dataType = 'varchar';
    });
    const out = mergeModelYml(text, file);

    const keys = columnKeys(out);
    expect(keys).toEqual(['name', 'data_type', 'description', 'custom_tag']);
  });
});

describe('mergeModelYml column meta (spec 27 addendum)', () => {
  const META_FILE = `version: 2
models:
  - name: orders
    columns:
      - name: ID_ORG
        data_type: varchar(3)
        config:
          meta: {confidentiality: "internal", GDPR: "false"}
      - name: order_id
        data_type: varchar
        config:
          meta: {confidentiality: "internal", GDPR: "false"}
`;

  it('a data-type edit does not duplicate config.meta onto any column', () => {
    const file = edited(META_FILE, (f) => {
      f.models[0].columns![0].dataType = 'varchar(33)';
    });
    const out = mergeModelYml(META_FILE, file);

    expect(out).toContain('data_type: varchar(33)');
    // The only change is the one data_type scalar.
    expect(out).toBe(META_FILE.replace('varchar(3)', 'varchar(33)'));
  });

  it('writes a meta edit into config.meta, keeping sibling config keys', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        config:
          tags: [pii]
          meta: {GDPR: "false"}
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].meta = { GDPR: 'true' };
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('GDPR: "true"');
    expect(out).toContain('tags: [pii]');
    expect(columnKeys(out)).toEqual(['name', 'config']);
  });

  it('leaves a flat column-level meta untouched', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        meta:
          GDPR: "false"
        config:
          meta: {GDPR: "false"}
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].meta = { GDPR: 'true' };
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('meta: {GDPR: "true"}');
    // The ignored flat block keeps its original value and its block style.
    expect(out).toContain('meta:\n          GDPR: "false"');
  });

  it('creates a new config.meta mapping in flow style', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        data_type: varchar
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].meta = { GDPR: 'true' };
    });
    const out = mergeModelYml(text, file);

    // Flow style, on one line. The padding inside the braces follows the
    // document's own convention (spec 29's `usesFlowPadding`); a file with no
    // flow collections at all defaults to padded.
    expect(out).toContain('meta: { GDPR: "true" }');
  });

  it('creates a new config.meta in the compact flow style the file already uses', () => {
    const file = edited(META_FILE, (f) => {
      f.models[0].columns![1].meta = { GDPR: 'true' };
      delete f.models[0].columns![1].config;
    });
    const out = mergeModelYml(META_FILE, file);

    expect(out).toContain('meta: {GDPR: "true"}');
  });

  it('keeps an existing block-style config.meta in block style', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        config:
          meta:
            GDPR: "false"
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].meta = { GDPR: 'true' };
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain('meta:\n            GDPR: "true"');
    expect(out).not.toContain('{');
  });
});

describe('mergeModelYml scalar wrapping (spec 29 addendum)', () => {
  const LONG = 'It identifies the customer to whom the data belongs, ensuring the separation and security of information between different customers.';

  it('does not re-wrap an untouched long description', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        data_type: varchar
      - name: other
        description: "${LONG}"
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].dataType = 'varchar(33)';
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain(`description: "${LONG}"`);
    expect(out).toBe(text.replace('varchar\n', 'varchar(33)\n'));
  });

  it('writes a new long description on a single line', () => {
    const text = `version: 2
models:
  - name: orders
    columns:
      - name: id
        description: short
`;
    const file = edited(text, (f) => {
      f.models[0].columns![0].description = LONG;
    });
    const out = mergeModelYml(text, file);

    expect(out).toContain(`description: ${LONG}`);
  });
});
