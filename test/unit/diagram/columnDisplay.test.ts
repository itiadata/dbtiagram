import { describe, expect, it } from 'vitest';
import {
  COLUMN_DISPLAY_OPTIONS,
  displayedColumns,
  type ColumnDisplayMode,
} from '../../../src/diagram/columnDisplay';
import type { TableNode } from '../../../src/diagram/graph';

describe('column display', () => {
  it('orders display options from most to least detail', () => {
    expect(COLUMN_DISPLAY_OPTIONS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'all', label: 'All columns' },
      { value: 'pkAndFk', label: 'Primary + foreign keys' },
      { value: 'pkOnly', label: 'Primary keys only' },
      { value: 'nameOnly', label: 'Table name only' },
    ]);
  });

  it("keeps each display mode's column behavior", () => {
    const node: TableNode = {
      id: 'orders',
      label: 'orders',
      columns: [{ name: 'id' }, { name: 'customer_id' }, { name: 'total' }],
      primaryKey: { columns: ['id'], virtual: false, uniqueTest: true },
      foreignKeys: [],
      foreignKeyColumns: ['customer_id'],
    };
    const modes: readonly ColumnDisplayMode[] = ['all', 'pkAndFk', 'pkOnly', 'nameOnly'];

    expect(
      Object.fromEntries(
        modes.map((mode) => [mode, displayedColumns(node, mode).map((column) => column.name)]),
      ),
    ).toEqual({
      all: ['id', 'customer_id', 'total'],
      pkAndFk: ['id', 'customer_id'],
      pkOnly: ['id'],
      nameOnly: [],
    });
  });
});
