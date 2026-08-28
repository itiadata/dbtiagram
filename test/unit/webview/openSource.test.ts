import { describe, it, expect, vi } from 'vitest';
import { openModelSource, type OpenSourceHost } from '../../../src/webview/openSource';

const FILE = '/w/models/orders.yml';

function makeHost(overrides: Partial<OpenSourceHost> = {}): OpenSourceHost {
  return {
    findModelFile: () => FILE,
    readFileText: () => Promise.resolve('models:\n  - name: orders\n'),
    reveal: vi.fn(() => Promise.resolve()),
    showWarning: vi.fn(),
    postError: vi.fn(),
    ...overrides,
  };
}

describe('openModelSource', () => {
  it('reveals the located declaration', async () => {
    const host = makeHost();
    await openModelSource(host, 'orders');

    expect(host.reveal).toHaveBeenCalledTimes(1);
    expect(host.reveal).toHaveBeenCalledWith(FILE, { line: 1, column: 10, length: 6 });
    expect(host.showWarning).not.toHaveBeenCalled();
    expect(host.postError).not.toHaveBeenCalled();
  });

  it('opens at the top and warns when the declaration is not found', async () => {
    const host = makeHost({ readFileText: () => Promise.resolve('version: 2\n') });
    await openModelSource(host, 'orders');

    expect(host.reveal).toHaveBeenCalledWith(FILE, null);
    expect(host.showWarning).toHaveBeenCalledWith(
      `Could not locate "orders" in ${FILE}; opened the file at the top.`,
    );
  });

  it('reports a model that no longer exists', async () => {
    const host = makeHost({ findModelFile: () => undefined });
    await openModelSource(host, 'ghost');

    expect(host.reveal).not.toHaveBeenCalled();
    expect(host.postError).toHaveBeenCalledWith(
      'Model "ghost" is no longer defined in any model.yml',
    );
  });

  it('reports an unreadable file', async () => {
    const host = makeHost({ readFileText: () => Promise.reject(new Error('EACCES')) });
    await openModelSource(host, 'orders');

    expect(host.reveal).not.toHaveBeenCalled();
    expect(host.postError).toHaveBeenCalledWith(`Could not read ${FILE}`);
  });

  it('resolves duplicates to the first file in store order', async () => {
    const files = ['/w/a.yml', '/w/b.yml'];
    const host = makeHost({ findModelFile: () => files[0] });
    await openModelSource(host, 'orders');

    expect(host.reveal).toHaveBeenCalledWith('/w/a.yml', { line: 1, column: 10, length: 6 });
  });

  it('reveals a located column', async () => {
    const host = makeHost({
      readFileText: () =>
        Promise.resolve('models:\n  - name: orders\n    columns:\n      - name: customer_id\n'),
    });
    await openModelSource(host, 'orders', 'customer_id');

    expect(host.reveal).toHaveBeenCalledTimes(1);
    expect(host.reveal).toHaveBeenCalledWith(FILE, { line: 3, column: 14, length: 11 });
    expect(host.showWarning).not.toHaveBeenCalled();
    expect(host.postError).not.toHaveBeenCalled();
  });

  it('falls back to the model line and warns when the column is not found', async () => {
    const host = makeHost({
      readFileText: () =>
        Promise.resolve('models:\n  - name: orders\n    columns:\n      - name: id\n'),
    });
    await openModelSource(host, 'orders', 'customer_id');

    expect(host.reveal).toHaveBeenCalledWith(FILE, { line: 1, column: 10, length: 6 });
    expect(host.showWarning).toHaveBeenCalledWith(
      `Could not locate column "customer_id" on "orders" in ${FILE}; revealed the model declaration instead.`,
    );
  });

  it('omitting column preserves spec 15 behavior', async () => {
    const host = makeHost();
    await openModelSource(host, 'orders');

    expect(host.reveal).toHaveBeenCalledWith(FILE, { line: 1, column: 10, length: 6 });
    expect(host.showWarning).not.toHaveBeenCalled();
    expect(host.postError).not.toHaveBeenCalled();
  });
});
