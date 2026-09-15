import { describe, expect, it } from 'vitest';
import { applyGroupRename, applyGroupTablePicker, changeGroupColor, createGroupFromPicker } from '../../../webview-ui/group-state';
import type { DiagramGroup } from '../../../src/diagram/layoutGroups';

const sales: DiagramGroup = { id: 'g-1', name: 'Sales', color: 'blue', models: ['orders'] };

describe('group state', () => {
  it('creates from a confirmed picker result', () => {
    expect(createGroupFromPicker([], 'g-1', { name: ' Sales ', models: ['orders', 'customers'] })).toEqual([
      { id: 'g-1', name: 'Sales', color: 'blue', models: ['customers', 'orders'] },
    ]);
  });

  it('cancelled creation changes nothing', () => {
    const groups = [sales];
    expect(createGroupFromPicker(groups, 'g-2', null)).toBe(groups);
  });

  it('edits membership and deletes on empty confirmation', () => {
    expect(applyGroupTablePicker([sales], 'g-1', ['customers'])[0]?.models).toEqual(['customers']);
    expect(applyGroupTablePicker([sales], 'g-1', [])).toEqual([]);
  });

  it('cancelled membership edit changes nothing', () => {
    const groups = [sales];
    expect(applyGroupTablePicker(groups, 'g-1', null)).toBe(groups);
  });

  it('renames only on a confirmed nonblank name', () => {
    expect(applyGroupRename([sales], 'g-1', ' Commercial ')[0]?.name).toBe('Commercial');
    expect(applyGroupRename([sales], 'g-1', null)[0]?.name).toBe('Sales');
    expect(applyGroupRename([sales], 'g-1', '   ')[0]?.name).toBe('Sales');
  });

  it("changes a group's colour", () => {
    expect(changeGroupColor([sales], 'g-1', 'purple')[0]?.color).toBe('purple');
  });
});
