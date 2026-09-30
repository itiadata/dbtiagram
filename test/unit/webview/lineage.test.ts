import { describe, expect, it } from 'vitest';
import type { TableNode } from '../../../src/diagram/graph';
import {
  expandDownstream,
  expandUpstream,
  refreshDisplayedLineage,
  type LineageHost,
  type LineageProgress,
} from '../../../src/webview/lineage';

function node(id: string, label = id): TableNode {
  return { id, label, columns: [], foreignKeys: [], foreignKeyColumns: [] };
}

function host(sql: Record<string, string>, progress: LineageProgress[] = [], cancelAfter = Infinity): LineageHost {
  let reads = 0;
  return {
    readModelSql: async (id) => { reads += 1; return sql[id] ?? null; },
    allProjectModelIds: async () => Object.keys(sql),
    resolveNode: async (packageName, name) => {
      const effectivePackage = packageName === '' ? 'sample' : packageName;
      const local = effectivePackage === 'sample' && Object.hasOwn(sql, name);
      return local
        ? { ...node(name), lineageKind: 'local', packageName: effectivePackage }
        : { ...node(`external:${effectivePackage}:${name}`, name), readOnly: true, lineageKind: effectivePackage === 'sample' ? 'unknown' : 'external', packageName: effectivePackage };
    },
    progress: (value) => progress.push(value),
    isCancelled: () => reads >= cancelAfter,
  };
}

describe('lineage orchestration', () => {
  it('expands upstream transitively and represents external and unknown refs', async () => {
    const result = await expandUpstream(host({
      report: "select * from {{ ref('items') }} union all select * from {{ ref('finance_pkg', 'currency') }} union all select * from {{ ref('missing') }}",
      items: "select * from {{ ref('orders') }}",
      orders: 'select 1',
    }), 'r1', 'model:sample:report');
    expect(result.nodes.map((item) => item.id)).toEqual([
      'items', 'orders', 'external:finance_pkg:currency', 'external:sample:missing',
    ]);
    expect(result.edges).toEqual([
      { parent: 'items', child: 'model:sample:report' },
      { parent: 'orders', child: 'items' },
      { parent: 'external:finance_pkg:currency', child: 'model:sample:report' },
      { parent: 'external:sample:missing', child: 'model:sample:report' },
    ]);
  });

  it('reports downstream progress and returns complete descendants', async () => {
    const values: LineageProgress[] = [];
    const result = await expandDownstream(host({
      orders: 'select 1',
      items: "{{ ref('orders') }}",
      report: "{{ ref('items') }}",
    }, values), 'r2', 'model:sample:orders');
    expect(values.at(-1)).toEqual({ scanned: 3, total: 3 });
    expect(result?.nodes.map((item) => item.id)).toEqual(['items', 'report']);
    expect(result?.edges).toEqual([
      { parent: 'orders', child: 'items' },
      { parent: 'items', child: 'report' },
    ]);
  });

  it('cancels downstream atomically', async () => {
    expect(await expandDownstream(host({ a: 'select 1', b: "{{ ref('a') }}", c: "{{ ref('b') }}" }, [], 1), 'r3', 'model:sample:a')).toBeNull();
  });

  it('refresh removes obsolete edges and never adds a hidden node', async () => {
    const displayed = new Set(['items', 'report']);
    expect(await refreshDisplayedLineage(host({ report: "{{ ref('hidden') }}", items: 'select 1' }), displayed, [
      { parent: 'items', child: 'report' },
    ])).toEqual([]);
    expect([...displayed]).toEqual(['items', 'report']);
  });
});
