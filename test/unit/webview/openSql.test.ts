import { describe, it, expect, vi } from 'vitest';
import { openModelSql, type OpenSqlHost } from '../../../src/webview/openSql';

function makeHost(overrides: Partial<OpenSqlHost> = {}): OpenSqlHost {
  return {
    lookup: () => undefined,
    rescan: () => Promise.resolve(new Map()),
    open: vi.fn(() => Promise.resolve()),
    publish: vi.fn(),
    postError: vi.fn(),
    ...overrides,
  };
}

describe('openModelSql', () => {
  it('opens the cached path without rescanning', async () => {
    const rescan = vi.fn(() => Promise.resolve(new Map<string, string>()));
    const host = makeHost({ lookup: () => '/a/orders.sql', rescan });
    await openModelSql(host, 'orders');

    expect(host.open).toHaveBeenCalledTimes(1);
    expect(host.open).toHaveBeenCalledWith('/a/orders.sql');
    expect(rescan).not.toHaveBeenCalled();
    expect(host.postError).not.toHaveBeenCalled();
  });

  it('rescans on a cache miss and opens the found file', async () => {
    const host = makeHost({
      lookup: () => undefined,
      rescan: () => Promise.resolve(new Map([['orders', '/a/orders.sql']])),
    });
    await openModelSql(host, 'orders');

    expect(host.open).toHaveBeenCalledWith('/a/orders.sql');
    expect(host.publish).toHaveBeenCalledWith(['orders']);
    expect(host.postError).not.toHaveBeenCalled();
  });

  it('reports a missing file after the rescan', async () => {
    const host = makeHost({
      lookup: () => undefined,
      rescan: () => Promise.resolve(new Map()),
    });
    await openModelSql(host, 'orders');

    expect(host.open).not.toHaveBeenCalled();
    expect(host.publish).toHaveBeenCalledWith([]);
    expect(host.postError).toHaveBeenCalledWith('No .sql file found for "orders"');
  });

  it('a deleted cached file falls back to the rescan and reports', async () => {
    const host = makeHost({
      lookup: () => '/a/orders.sql',
      open: vi.fn(() => Promise.reject(new Error('ENOENT'))),
      rescan: () => Promise.resolve(new Map()),
    });
    await openModelSql(host, 'orders');

    expect(host.publish).toHaveBeenCalledWith([]);
    expect(host.postError).toHaveBeenCalledWith('No .sql file found for "orders"');
  });

  it('a deleted cached file that moved is opened at its new path', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);
    const host = makeHost({
      lookup: () => '/a/orders.sql',
      open,
      rescan: () => Promise.resolve(new Map([['orders', '/b/orders.sql']])),
    });
    await openModelSql(host, 'orders');

    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenNthCalledWith(2, '/b/orders.sql');
    expect(host.postError).not.toHaveBeenCalled();
  });
});
