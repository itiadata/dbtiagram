import { describe, expect, it } from 'vitest';
import { readVirtualConstraints, writeVirtualConstraints } from '../../../src/dbt/virtual';
import type { ModelDefinition } from '../../../src/dbt/types';

const base: ModelDefinition = { name: 'orders' };

describe('readVirtualConstraints', () => {
  it('returns an empty block when config/meta/dbtiagram/virtual is absent', () => {
    expect(readVirtualConstraints(base)).toEqual({});
    expect(readVirtualConstraints({ name: 'orders', config: { materialized: 'table' } })).toEqual(
      {},
    );
    expect(readVirtualConstraints({ name: 'orders', config: { meta: { owner: 'x' } } })).toEqual(
      {},
    );
  });

  it('reads a primary_key and foreign_keys block', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: {
            virtual: {
              primary_key: { columns: ['order_id'] },
              foreign_keys: [
                { to: "ref('customers')", columns: ['customer_id'], to_columns: ['customer_id'] },
              ],
            },
          },
        },
      },
    };
    expect(readVirtualConstraints(model)).toEqual({
      primaryKey: { columns: ['order_id'] },
      foreignKeys: [
        { to: "ref('customers')", columns: ['customer_id'], toColumns: ['customer_id'] },
      ],
    });
  });

  it('ignores malformed values and keeps only string columns', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: {
            virtual: {
              primary_key: 'not-a-map',
              foreign_keys: [
                { columns: ['a'] }, // no to -> dropped
                { to: 42 }, // to not a string -> dropped
                { to: "ref('customers')", columns: ['a', 7, 'b'], to_columns: ['x'] },
              ],
            },
          },
        },
      },
    };
    expect(readVirtualConstraints(model)).toEqual({
      foreignKeys: [{ to: "ref('customers')", columns: ['a', 'b'], toColumns: ['x'] }],
    });
  });

  it('keeps table-level virtual FKs with empty column arrays', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: { meta: { dbtiagram: { virtual: { foreign_keys: [{ to: "ref('customers')" }] } } } },
    };
    expect(readVirtualConstraints(model)).toEqual({
      foreignKeys: [{ to: "ref('customers')", columns: [], toColumns: [] }],
    });
  });

  it('treats an empty primary_key columns list as absent', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: { meta: { dbtiagram: { virtual: { primary_key: { columns: [] } } } } },
    };
    expect(readVirtualConstraints(model)).toEqual({});
  });

  it('never returns shared records', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: {
            virtual: { primary_key: { columns: ['order_id'] } },
          },
        },
      },
    };
    const block = readVirtualConstraints(model);
    block.primaryKey!.columns.push('pushed');
    const meta = model.config!.meta as Record<string, unknown>;
    const dbtiagram = meta.dbtiagram as Record<string, unknown>;
    const virtual = dbtiagram.virtual as Record<string, unknown>;
    const primaryKey = virtual.primary_key as Record<string, unknown>;
    expect(primaryKey.columns).toEqual(['order_id']);
  });
});

describe('writeVirtualConstraints', () => {
  it('creates the block when it does not exist', () => {
    const next = writeVirtualConstraints(base, {
      primaryKey: { columns: ['order_id'] },
    });
    expect(next.config).toEqual({
      meta: { dbtiagram: { virtual: { primary_key: { columns: ['order_id'] } } } },
    });
  });

  it('writes foreign_keys with the YAML-shaped to_columns key', () => {
    const next = writeVirtualConstraints(base, {
      foreignKeys: [{ to: "ref('customers')", columns: ['customer_id'], toColumns: ['id'] }],
    });
    expect(next.config).toEqual({
      meta: {
        dbtiagram: {
          virtual: {
            foreign_keys: [{ to: "ref('customers')", columns: ['customer_id'], to_columns: ['id'] }],
          },
        },
      },
    });
  });

  it('preserves unrelated config keys and existing meta siblings', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        materialized: 'table',
        meta: { owner: 'team-data', dbtiagram: { other: 1 } },
      },
    };
    const next = writeVirtualConstraints(model, {
      primaryKey: { columns: ['order_id'] },
    });
    expect(next.config).toEqual({
      materialized: 'table',
      meta: {
        owner: 'team-data',
        dbtiagram: { other: 1, virtual: { primary_key: { columns: ['order_id'] } } },
      },
    });
  });

  it('updates an existing block in place', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: {
            virtual: { primary_key: { columns: ['order_id'] } },
          },
        },
      },
    };
    const next = writeVirtualConstraints(model, {
      primaryKey: { columns: ['order_id', 'customer_id'] },
    });
    expect(next.config?.meta).toEqual({
      dbtiagram: { virtual: { primary_key: { columns: ['order_id', 'customer_id'] } } },
    });
  });

  it('removes the whole chain of keys when the block empties', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        materialized: 'table',
        meta: { dbtiagram: { virtual: { primary_key: { columns: ['order_id'] } } } },
      },
    };
    const next = writeVirtualConstraints(model, {});
    expect(next.config).toEqual({ materialized: 'table' });
  });

  it('drops config entirely when it only held the virtual block', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: { meta: { dbtiagram: { virtual: { primary_key: { columns: ['order_id'] } } } } },
    };
    const next = writeVirtualConstraints(model, {});
    expect(next.config).toBeUndefined();
  });

  it('removes only the virtual key when the dbtiagram block has siblings', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: { other: 'keep-me', virtual: { primary_key: { columns: ['order_id'] } } },
        },
      },
    };
    const next = writeVirtualConstraints(model, {});
    expect(next.config).toEqual({ meta: { dbtiagram: { other: 'keep-me' } } });
  });

  it('returns the original model when nothing changed (identity)', () => {
    const model: ModelDefinition = {
      name: 'orders',
      config: {
        meta: {
          dbtiagram: {
            virtual: { primary_key: { columns: ['order_id'] } },
          },
        },
      },
    };
    expect(writeVirtualConstraints(model, { primaryKey: { columns: ['order_id'] } })).toBe(model);
    expect(writeVirtualConstraints(base, {})).toBe(base);
  });

  it('does not mutate the input model', () => {
    const model: ModelDefinition = { name: 'orders', config: {} };
    writeVirtualConstraints(model, { primaryKey: { columns: ['order_id'] } });
    expect(model.config).toEqual({});
  });
});
