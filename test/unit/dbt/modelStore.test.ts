import { describe, expect, it } from 'vitest';
import { parseModelYml } from '../../../src/dbt/parse';
import type { ModelYmlFile } from '../../../src/dbt/types';
import {
  applyFileDeleted,
  applyFileRenamed,
  applyTextChange,
  createModelStore,
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
