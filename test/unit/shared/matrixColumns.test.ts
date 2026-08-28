import { describe, expect, it } from 'vitest';
import {
  applyStoredPrefs,
  defaultMatrixColumns,
  reorderColumn,
  toggleColumnVisible,
  type MatrixColumnDef,
} from '../../../src/shared/matrixColumns';

describe('defaultMatrixColumns', () => {
  it('includes the Model column only for global scope', () => {
    const global = defaultMatrixColumns(['a'], 'global');
    const model = defaultMatrixColumns(['a'], 'model');
    expect(global[0].id).toBe('model');
    expect(model.some((c) => c.id === 'model')).toBe(false);
  });
});

describe('toggleColumnVisible', () => {
  it('flips one column without affecting others', () => {
    const columns = defaultMatrixColumns([], 'model');
    const next = toggleColumnVisible(columns, 'dataType');
    for (const column of next) {
      const original = columns.find((c) => c.id === column.id);
      if (column.id === 'dataType') {
        expect(column.visible).toBe(!original?.visible);
      } else {
        expect(column.visible).toBe(original?.visible);
      }
    }
  });
});

describe('reorderColumn', () => {
  it('moves a column to a new index', () => {
    const columns: MatrixColumnDef[] = [
      { id: 'name', label: 'Name', visible: true, batchEditable: false },
      { id: 'dataType', label: 'Data type', visible: true, batchEditable: true },
      { id: 'description', label: 'Description', visible: true, batchEditable: true },
    ];
    const next = reorderColumn(columns, 2, 0);
    expect(next.map((c) => c.id)).toEqual(['description', 'name', 'dataType']);
  });
});

describe('applyStoredPrefs', () => {
  const defaults: MatrixColumnDef[] = [
    { id: 'name', label: 'Name', visible: true, batchEditable: false },
    { id: 'dataType', label: 'Data type', visible: true, batchEditable: true },
    { id: 'description', label: 'Description', visible: true, batchEditable: true },
    { id: { meta: 'a' }, label: 'a', visible: true, batchEditable: true },
    { id: { meta: 'b' }, label: 'b', visible: true, batchEditable: true },
  ];

  it('orders by stored prefs, appends new defaults, drops vanished ids', () => {
    const stored = [
      { id: { meta: 'b' }, visible: false },
      { id: 'name' as const, visible: true },
      { id: { meta: 'c' }, visible: true },
    ];
    const next = applyStoredPrefs(defaults, stored);
    expect(next.map((c) => c.id)).toEqual([
      { meta: 'b' },
      'name',
      'dataType',
      'description',
      { meta: 'a' },
    ]);
    expect(next[0].visible).toBe(false);
  });

  it('returns defaults unchanged when stored is undefined', () => {
    expect(applyStoredPrefs(defaults, undefined)).toBe(defaults);
  });
});
