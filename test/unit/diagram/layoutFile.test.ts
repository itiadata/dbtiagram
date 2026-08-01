import { describe, expect, it } from 'vitest';
import {
  applyLayout,
  buildLayout,
  defaultLayoutName,
  DiagramLayoutParseError,
  isLayoutFilePath,
  parseDiagramLayout,
  serializeDiagramLayout,
  stripLayoutSuffix,
  type DiagramLayout,
} from '../../../src/diagram/layoutFile';

const sample: DiagramLayout = {
  version: 1,
  name: 'Order marts',
  tables: [
    { name: 'order_items', x: 520, y: 40 },
    { name: 'orders', x: 120, y: 40 },
  ],
};

describe('isLayoutFilePath', () => {
  it('accepts the layout suffix case-insensitively', () => {
    expect(isLayoutFilePath('a/b/x.dbtiagram.yml')).toBe(true);
    expect(isLayoutFilePath('C:\\repo\\X.DBTIAGRAM.YML')).toBe(true);
  });

  it('rejects other files and undefined', () => {
    expect(isLayoutFilePath('models/orders.yml')).toBe(false);
    expect(isLayoutFilePath('x.dbtiagram.yaml')).toBe(false);
    expect(isLayoutFilePath('')).toBe(false);
    expect(isLayoutFilePath(undefined)).toBe(false);
  });
});

describe('defaultLayoutName', () => {
  it('strips the suffix from the base name', () => {
    expect(defaultLayoutName('C:\\repo\\diagrams\\order-marts.dbtiagram.yml')).toBe('order-marts');
    expect(defaultLayoutName('diagrams/order-marts.dbtiagram.yml')).toBe('order-marts');
  });

  it('falls back to the base name for other paths', () => {
    expect(defaultLayoutName('models/orders.yml')).toBe('orders.yml');
  });
});

describe('stripLayoutSuffix', () => {
  // The save dialog suggests this bare name; VS Code appends the filter's
  // extension itself, so suggesting the suffix would duplicate it.
  it('removes a trailing layout suffix exactly once', () => {
    expect(stripLayoutSuffix('mydiagram.dbtiagram.yml')).toBe('mydiagram');
    expect(stripLayoutSuffix('mydiagram.DBTIAGRAM.YML')).toBe('mydiagram');
  });

  it('leaves a bare name untouched', () => {
    expect(stripLayoutSuffix('mydiagram')).toBe('mydiagram');
    expect(stripLayoutSuffix('orders.yml')).toBe('orders.yml');
  });

  it('is idempotent, so a suggestion can never gain a second suffix', () => {
    expect(stripLayoutSuffix(stripLayoutSuffix('mydiagram.dbtiagram.yml'))).toBe('mydiagram');
  });
});

describe('buildLayout', () => {  it('sorts tables by name and rounds coordinates', () => {
    const layout = buildLayout('My diagram', [
      { name: 'orders', x: 120.4, y: 39.6 },
      { name: 'customers', x: -0.2, y: 10 },
    ]);
    expect(layout).toEqual({
      version: 1,
      name: 'My diagram',
      tables: [
        { name: 'customers', x: -0, y: 10 },
        { name: 'orders', x: 120, y: 40 },
      ],
    });
  });
});

describe('serializeDiagramLayout / parseDiagramLayout', () => {
  it('round-trips a layout', () => {
    expect(parseDiagramLayout(serializeDiagramLayout(sample), 'fallback')).toEqual(sample);
  });

  it('writes a deterministic key order', () => {
    const text = serializeDiagramLayout(sample);
    expect(text.indexOf('version:')).toBeLessThan(text.indexOf('name:'));
    expect(text.indexOf('name: Order marts')).toBeLessThan(text.indexOf('tables:'));
    expect(serializeDiagramLayout(sample)).toBe(text);
  });

  it('uses the fallback name when the file has none', () => {
    const layout = parseDiagramLayout('version: 1\ntables: []\n', 'order-marts');
    expect(layout.name).toBe('order-marts');
    expect(layout.tables).toEqual([]);
  });

  it('drops unknown keys', () => {
    const layout = parseDiagramLayout(
      'version: 1\nname: x\nzoom: 3\ntables:\n  - name: orders\n    x: 1\n    y: 2\n    color: red\n',
      'fallback',
    );
    expect(layout).toEqual({ version: 1, name: 'x', tables: [{ name: 'orders', x: 1, y: 2 }] });
  });

  it('keeps the first of duplicate table names', () => {
    const layout = parseDiagramLayout(
      'version: 1\ntables:\n  - name: orders\n    x: 1\n    y: 2\n  - name: orders\n    x: 9\n    y: 9\n',
      'fallback',
    );
    expect(layout.tables).toEqual([{ name: 'orders', x: 1, y: 2 }]);
  });

  it.each([
    ['malformed YAML', 'version: [1\n'],
    ['a non-mapping root', '- 1\n- 2\n'],
    ['a missing version', 'tables: []\n'],
    ['an unknown version', 'version: 99\ntables: []\n'],
    ['a non-array tables', 'version: 1\ntables: nope\n'],
    ['a non-mapping table entry', 'version: 1\ntables:\n  - orders\n'],
    ['a table without a name', 'version: 1\ntables:\n  - x: 1\n    y: 2\n'],
    ['non-numeric coordinates', 'version: 1\ntables:\n  - name: orders\n    x: a\n    y: 2\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseDiagramLayout(text, 'diagram.dbtiagram.yml')).toThrow(DiagramLayoutParseError);
  });
});

describe('applyLayout', () => {
  it('returns visible names and positions for known models', () => {
    const applied = applyLayout(sample, new Set(['orders', 'order_items', 'customers']));
    expect([...applied.visible].sort()).toEqual(['order_items', 'orders']);
    expect(applied.positions.get('orders')).toEqual({ x: 120, y: 40 });
    expect(applied.missing).toEqual([]);
  });

  it('drops unknown models and reports them in file order', () => {
    const layout: DiagramLayout = {
      version: 1,
      name: 'x',
      tables: [
        { name: 'legacy_orders', x: 0, y: 0 },
        { name: 'orders', x: 10, y: 20 },
        { name: 'gone', x: 0, y: 0 },
      ],
    };
    const applied = applyLayout(layout, new Set(['orders']));
    expect([...applied.visible]).toEqual(['orders']);
    expect(applied.missing).toEqual(['legacy_orders', 'gone']);
    expect(applied.positions.has('legacy_orders')).toBe(false);
  });
});
