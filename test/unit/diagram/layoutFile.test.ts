import { describe, expect, it } from 'vitest';
import {
  applyLayout,
  buildLayout,
  createNote,
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
  notes: [],
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
      notes: [],
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
    expect(layout).toEqual({
      version: 1,
      name: 'x',
      tables: [{ name: 'orders', x: 1, y: 2 }],
      notes: [],
    });
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
      notes: [],
    };
    const applied = applyLayout(layout, new Set(['orders']));
    expect([...applied.visible]).toEqual(['orders']);
    expect(applied.missing).toEqual(['legacy_orders', 'gone']);
    expect(applied.positions.has('legacy_orders')).toBe(false);
  });

  it('passes notes through and still reconciles tables', () => {
    const notes = [
      {
        id: 'n-1',
        text: 'Grain: one row per order.',
        x: 10,
        y: 20,
        width: 240,
        height: 140,
        collapsedByDefault: false,
      },
    ];
    const layout: DiagramLayout = {
      version: 1,
      name: 'x',
      tables: [
        { name: 'orders', x: 10, y: 20 },
        { name: 'ghost', x: 0, y: 0 },
      ],
      notes,
    };

    const applied = applyLayout(layout, new Set(['orders']));

    expect([...applied.visible]).toEqual(['orders']);
    expect(applied.missing).toEqual(['ghost']);
    expect(applied.notes).toEqual(notes);
  });
});

describe('notes (spec 16)', () => {
  const note = {
    id: 'n-1',
    text: 'Grain: one row per order.',
    x: 10,
    y: 20,
    width: 240,
    height: 140,
    collapsedByDefault: false,
  };

  it('round-trips a layout with notes', () => {
    const layout: DiagramLayout = { version: 1, name: 'd', tables: [], notes: [note] };
    expect(parseDiagramLayout(serializeDiagramLayout(layout), 'd')).toEqual(layout);
  });

  it('parses a file with no notes key as an empty array', () => {
    expect(parseDiagramLayout('version: 1\nname: d\ntables: []\n', 'd').notes).toEqual([]);
  });

  it('omits the notes key when there are none', () => {
    expect(serializeDiagramLayout(buildLayout('d', []))).not.toContain('notes');
  });

  it('sorts notes by id and rounds coordinates and sizes', () => {
    const layout = buildLayout(
      'd',
      [],
      [
        { ...note, id: 'n-b', x: 10.6, y: 20.4, width: 200.5, height: 100.4 },
        { ...note, id: 'n-a' },
      ],
    );

    expect(layout.notes.map((entry) => entry.id)).toEqual(['n-a', 'n-b']);
    expect(layout.notes[1]).toMatchObject({ x: 11, y: 20, width: 201, height: 100 });
  });

  it('defaults a missing collapsedByDefault to false', () => {
    const layout = parseDiagramLayout(
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    x: 1\n    y: 2\n',
      'd',
    );
    expect(layout.notes[0]?.collapsedByDefault).toBe(false);
  });

  it('defaults missing width and height', () => {
    const layout = parseDiagramLayout(
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    x: 1\n    y: 2\n',
      'd',
    );
    expect(layout.notes[0]).toMatchObject({ width: 220, height: 120 });
  });

  it('clamps below-minimum sizes', () => {
    const layout = parseDiagramLayout(
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    x: 1\n    y: 2\n    width: 10\n    height: 10\n',
      'd',
    );
    expect(layout.notes[0]).toMatchObject({ width: 120, height: 64 });
  });

  it('keeps the first of duplicate note ids', () => {
    const layout = parseDiagramLayout(
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    text: first\n    x: 1\n    y: 2\n  - id: n-1\n    text: second\n    x: 9\n    y: 9\n',
      'd',
    );
    expect(layout.notes).toHaveLength(1);
    expect(layout.notes[0]?.text).toBe('first');
  });

  it.each([
    ['a non-array notes key', 'version: 1\nname: d\ntables: []\nnotes: nope\n', 'Diagram file "notes" must be an array'],
    [
      'a note entry that is not a mapping',
      'version: 1\nname: d\ntables: []\nnotes:\n  - x\n',
      'Every entry in "notes" must be a mapping',
    ],
    [
      'a note with no id',
      'version: 1\nname: d\ntables: []\nnotes:\n  - x: 1\n    y: 2\n',
      'Every note entry needs an "id"',
    ],
    [
      'a non-string text',
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    text: 5\n    x: 1\n    y: 2\n',
      'Note "n-1" needs a string "text"',
    ],
    [
      'non-finite coordinates',
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    x: a\n    y: 2\n',
      'Note "n-1" needs numeric "x" and "y" coordinates',
    ],
    [
      'a non-boolean collapsedByDefault',
      'version: 1\nname: d\ntables: []\nnotes:\n  - id: n-1\n    x: 1\n    y: 2\n    collapsedByDefault: yes please\n',
      'Note "n-1" needs a boolean "collapsedByDefault"',
    ],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseDiagramLayout(text, 'd')).toThrow(DiagramLayoutParseError);
    expect(() => parseDiagramLayout(text, 'd')).toThrow(message);
  });

  it('createNote returns a default-sized empty note', () => {
    expect(createNote(30, 40, 'n-7')).toEqual({
      id: 'n-7',
      text: '',
      x: 30,
      y: 40,
      width: 220,
      height: 120,
      collapsedByDefault: false,
    });
  });
});
