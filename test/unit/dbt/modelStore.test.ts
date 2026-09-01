import { describe, expect, it } from 'vitest';
import { parseModelYml } from '../../../src/dbt/parse';
import type { ModelYmlFile } from '../../../src/dbt/types';
import { applyEdit } from '../../../src/dbt/edit';
import {
  applyFileDeleted,
  applyFileRenamed,
  applyTextChange,
  createModelStore,
  distributeEditedModels,
  replaceModelStore,
  upsertRecord,
} from '../../../src/dbt/modelStore';

const ORDERS_YML = `version: 2
models:
  - name: orders
    columns:
      - name: order_id
        data_type: integer
`;

const ORDERS_WITH_CUSTOMER = `version: 2
models:
  - name: orders
    columns:
      - name: order_id
        data_type: integer
      - name: customer_id
        data_type: integer
`;

const BROKEN_YML = `version: 2
models:
  - name: orders
    columns:
      - name: order_id
      bad indentation here
`;

const CUSTOMERS_YML = `version: 2
models:
  - name: customers
    columns:
      - name: id
        data_type: integer
`;

function parseYml(content: string): ModelYmlFile {
  return parseModelYml(content, 'test');
}

describe('modelStore', () => {
  it('starts empty and seeds from records', () => {
    expect(createModelStore().records).toEqual([]);
    expect(createModelStore().pendingErrors.size).toBe(0);

    const seeded = upsertRecord(createModelStore(), '/a/orders.yml', parseYml(ORDERS_YML));
    expect(seeded.records).toHaveLength(1);
    expect(seeded.records[0].uri).toBe('/a/orders.yml');
  });

  it('upsertRecord replaces an existing record in place and clears its error', () => {
    let store = applyTextChange(createModelStore(), '/a/orders.yml', BROKEN_YML);
    expect(store.pendingErrors.has('/a/orders.yml')).toBe(true);

    store = upsertRecord(store, '/a/orders.yml', parseYml(ORDERS_YML));
    expect(store.records).toHaveLength(1);
    expect(store.records[0].file.models[0].name).toBe('orders');
    expect(store.pendingErrors.has('/a/orders.yml')).toBe(false);
  });

  it('applyTextChange parses valid content and clears pending errors', () => {
    let store = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);
    expect(store.pendingErrors.size).toBe(0);
    expect(store.records[0].file.models).toHaveLength(1);

    store = applyTextChange(store, '/a/orders.yml', ORDERS_WITH_CUSTOMER);
    expect(store.records[0].file.models[0].columns).toHaveLength(2);
    expect(store.pendingErrors.size).toBe(0);
  });

  it('applyTextChange keeps the last good record and records the error on failure', () => {
    let store = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);
    expect(store.records).toHaveLength(1);

    store = applyTextChange(store, '/a/orders.yml', BROKEN_YML);
    expect(store.records).toHaveLength(1);
    expect(store.records[0].file.models[0].name).toBe('orders');
    expect(store.pendingErrors.get('/a/orders.yml')).toMatch(/not valid YAML/);

    // Fixing the YAML restores a fresh record and clears the error.
    store = applyTextChange(store, '/a/orders.yml', ORDERS_WITH_CUSTOMER);
    expect(store.records[0].file.models[0].columns).toHaveLength(2);
    expect(store.pendingErrors.size).toBe(0);
  });

  it('applyTextChange silently ignores a YAML file with no "models" key', () => {
    const store = applyTextChange(createModelStore(), '/a/sources.yml', 'sources:\n  - name: raw\n');
    expect(store.records).toEqual([]);
    expect(store.pendingErrors.size).toBe(0);
  });

  it('applyTextChange drops a stale record if a valid model.yml is edited to remove "models"', () => {
    let store = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);
    expect(store.records).toHaveLength(1);

    store = applyTextChange(store, '/a/orders.yml', 'sources:\n  - name: raw\n');
    expect(store.records).toEqual([]);
    expect(store.pendingErrors.size).toBe(0);
  });

  it('applyTextChange on a brand-new broken file leaves no record', () => {
    const store = applyTextChange(createModelStore(), '/a/new.yml', BROKEN_YML);
    expect(store.records).toEqual([]);
    expect(store.pendingErrors.has('/a/new.yml')).toBe(true);
  });

  it('applyFileDeleted removes the record and its pending error', () => {
    let store = applyTextChange(createModelStore(), '/a/orders.yml', BROKEN_YML);
    store = applyTextChange(store, '/a/orders.yml', ORDERS_YML);
    store = applyTextChange(store, '/a/orders.yml', BROKEN_YML);
    expect(store.records).toHaveLength(1);
    expect(store.pendingErrors.has('/a/orders.yml')).toBe(true);

    store = applyFileDeleted(store, '/a/orders.yml');
    expect(store.records).toEqual([]);
    expect(store.pendingErrors.size).toBe(0);
  });

  it('applyFileRenamed moves the record to the new path', () => {
    const store = applyFileRenamed(
      applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML),
      '/a/orders.yml',
      '/a/renamed_orders.yml',
      ORDERS_WITH_CUSTOMER,
    );
    expect(store.records).toHaveLength(1);
    expect(store.records[0].uri).toBe('/a/renamed_orders.yml');
    expect(store.records[0].file.models[0].columns).toHaveLength(2);
  });

  it('replaceModelStore retains last good data for failed files and honors fresh loads', () => {
    const before = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);

    const next = replaceModelStore(before, [], [{ uri: '/a/orders.yml', error: 'boom' }]);
    expect(next.records).toHaveLength(1);
    expect(next.records[0].uri).toBe('/a/orders.yml');
    expect(next.pendingErrors.get('/a/orders.yml')).toBe('boom');

    const fixed = replaceModelStore(
      next,
      [{ uri: '/a/orders.yml', file: parseYml(ORDERS_WITH_CUSTOMER) }],
      [],
    );
    expect(fixed.pendingErrors.size).toBe(0);
    expect(fixed.records[0].file.models[0].columns).toHaveLength(2);
  });

  it('replaceModelStore drops files that are neither loaded nor failed', () => {
    const before = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);
    const after = replaceModelStore(before, [], []);
    expect(after.records).toEqual([]);
  });

  it('replaceModelStore merges loaded and retained records', () => {
    // broken.yml was parsed successfully before the scan, so the failed scan
    // keeps its last good record while recording the error.
    const before = applyTextChange(createModelStore(), '/a/broken.yml', ORDERS_YML);
    const after = replaceModelStore(
      before,
      [
        { uri: '/a/customers.yml', file: parseYml(ORDERS_YML) },
        { uri: '/a/orders.yml', file: parseYml(ORDERS_YML) },
      ],
      [{ uri: '/a/broken.yml', error: 'nope' }],
    );
    expect(after.records.map((r) => r.uri).sort()).toEqual([
      '/a/broken.yml',
      '/a/customers.yml',
      '/a/orders.yml',
    ]);
    expect(after.pendingErrors.get('/a/broken.yml')).toBe('nope');
  });

  it('does not mutate the previous store', () => {
    const store = applyTextChange(createModelStore(), '/a/orders.yml', ORDERS_YML);
    const originalRecords = store.records;
    const next = applyTextChange(store, '/a/orders.yml', BROKEN_YML);
    expect(store.records).toBe(originalRecords);
    expect(store.pendingErrors.size).toBe(0);
    expect(next).not.toBe(store);
  });
});

describe('distributeEditedModels', () => {
  /** A store with two records: orders.yml (orders) and customers.yml (customers). */
  function twoRecordStore() {
    const store = createModelStore();
    const a = upsertRecord(store, '/a/orders.yml', parseYml(ORDERS_YML));
    return upsertRecord(a, '/a/customers.yml', parseYml(CUSTOMERS_YML));
  }

  /** Applies `edit` to the store's flat model list and distributes the result. */
  function distribute(store: ReturnType<typeof twoRecordStore>, edit: Parameters<typeof applyEdit>[1]) {
    const all = store.records.flatMap((record) => record.file.models);
    const { models } = applyEdit(all, edit);
    return distributeEditedModels(store, models);
  }

  it('returns an empty list when every model is unchanged', () => {
    const store = twoRecordStore();
    const all = store.records.flatMap((record) => record.file.models);
    expect(distributeEditedModels(store, all)).toEqual([]);
  });

  it('does not rewrite files whose models are unchanged', () => {
    const store = twoRecordStore();
    // Editing customers leaves the orders slice untouched.
    const changed = distribute(store, {
      kind: 'setModelDescription',
      model: 'customers',
      description: 'All customers',
    });
    expect(changed.map((record) => record.uri)).toEqual(['/a/customers.yml']);
  });

  it('lands a renamed model on its original record by position', () => {
    const store = twoRecordStore();
    const changed = distribute(store, {
      kind: 'setModelName',
      model: 'orders',
      name: 'orders_v2',
    });
    expect(changed.map((record) => record.uri)).toEqual(['/a/orders.yml']);
    expect(changed[0].file.models.map((model) => model.name)).toEqual(['orders_v2']);
  });

  it('lands a column rename on the right record', () => {
    const store = twoRecordStore();
    const changed = distribute(store, {
      kind: 'setColumnName',
      model: 'orders',
      column: 'order_id',
      name: 'order_key',
    });
    expect(changed.map((record) => record.uri)).toEqual(['/a/orders.yml']);
    expect(changed[0].file.models[0].columns?.[0].name).toBe('order_key');
  });

  it('preserves record order and per-record model order', () => {
    const store = createModelStore();
    let next = upsertRecord(store, '/a/customers.yml', parseYml(CUSTOMERS_YML));
    next = upsertRecord(next, '/a/orders.yml', parseYml(ORDERS_YML));
    const changed = distribute(next, {
      kind: 'setColumnDataType',
      model: 'orders',
      column: 'order_id',
      dataType: 'bigint',
    });
    expect(changed.map((record) => record.uri)).toEqual(['/a/orders.yml']);
    expect(changed[0].file.models.map((model) => model.name)).toEqual(['orders']);
    // The untouched customers record keeps its model intact.
    expect(changed[0].file.version).toBe(2);
  });

  it('throws when the edited list length does not match the store', () => {
    const store = twoRecordStore();
    const all = store.records.flatMap((record) => record.file.models);
    expect(() => distributeEditedModels(store, all.slice(1))).toThrow(
      /does not match the store/,
    );
  });

  it('handles multi-model records and multi-record edits', () => {
    const store = createModelStore();
    const withTwo: ModelYmlFile = parseYml(`version: 2
models:
  - name: orders
  - name: order_items
`);
    let next = upsertRecord(store, '/a/orders.yml', withTwo);
    next = upsertRecord(next, '/a/customers.yml', parseYml(ORDERS_YML));

    const changed = distribute(next, {
      kind: 'setModelDescription',
      model: 'order_items',
      description: 'Line items',
    });
    expect(changed.map((record) => record.uri)).toEqual(['/a/orders.yml']);
    expect(changed[0].file.models.map((model) => model.name)).toEqual(['orders', 'order_items']);
    // The model that was not edited keeps its object identity in the file.
    const originalModels = withTwo.models;
    expect(changed[0].file.models[0]).toBe(originalModels[0]);
  });
});
