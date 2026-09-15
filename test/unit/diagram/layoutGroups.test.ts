import { describe, expect, it } from 'vitest';
import {
  addModelToGroup,
  groupForModel,
  groupRect,
  nextGroupColor,
  normalizeGroupName,
  normalizeGroups,
  parseGroups,
  removeModelFromGroup,
  replaceGroupModels,
  type DiagramGroup,
} from '../../../src/diagram/layoutGroups';

const group = (id: string, models: string[], color: DiagramGroup['color'] = 'blue'): DiagramGroup => ({
  id, name: id, color, models,
});
const fail = (message: string): never => { throw new Error(message); };

describe('layout groups', () => {
  it('cycles through least-used palette colours', () => {
    const groups = ['blue', 'blue', 'green', 'amber', 'purple', 'rose', 'cyan'].map((color, i) =>
      group(`g-${i}`, [`m-${i}`], color as DiagramGroup['color']));
    expect(nextGroupColor(groups)).toBe('green');
  });

  it('trims and validates a group name', () => {
    expect(normalizeGroupName('  Sales  ')).toBe('Sales');
    expect(normalizeGroupName('   ')).toBeUndefined();
  });

  it("finds a table's only group", () => {
    expect(groupForModel([group('Sales', ['orders'])], 'orders')?.id).toBe('Sales');
  });

  it('adding a model removes it from any former group', () => {
    expect(addModelToGroup([group('A', ['orders']), group('B', ['customers'])], 'B', 'orders')).toEqual([
      { ...group('B', ['customers']), models: ['customers', 'orders'] },
    ]);
  });

  it('removing the last model deletes its group', () => {
    expect(removeModelFromGroup([group('Sales', ['orders'])], 'orders')).toEqual([]);
  });

  it('replacing membership with empty deletes the group', () => {
    expect(replaceGroupModels([group('Sales', ['orders'])], 'Sales', [])).toEqual([]);
  });

  it('derives a padded bounding rectangle and ignores non-members', () => {
    expect(groupRect(group('Sales', ['orders', 'customers']), [
      { name: 'orders', x: 100, y: 100, width: 200, height: 150 },
      { name: 'customers', x: 500, y: 300, width: 200, height: 100 },
      { name: 'other', x: -100, y: -100, width: 1000, height: 1000 },
    ])).toEqual({ x: 68, y: 40, width: 664, height: 392 });
  });

  it('returns null with no visible members', () => {
    expect(groupRect(group('Sales', ['hidden']), [])).toBeNull();
  });

  it('normalizes ids and qualified source members', () => {
    expect(normalizeGroups([{ id: 'g-2', name: ' B ', color: 'green', models: ['finance.orders', 'finance.orders'] }, group('g-1', ['x'])]))
      .toEqual([group('g-1', ['x']), { id: 'g-2', name: 'B', color: 'green', models: ['finance.orders'] }]);
  });

  it('rejects an unknown colour', () => {
    expect(() => parseGroups([{ id: 'g-1', name: 'Sales', color: 'orange', models: ['orders'] }], fail))
      .toThrow('Group "g-1" has an invalid "color"');
  });

  it('ignores persisted geometry', () => {
    expect(parseGroups([{ id: 'g-1', name: 'Sales', color: 'blue', models: ['orders'], x: 1, y: 2, width: 3, height: 4 }], fail))
      .toEqual([{ id: 'g-1', name: 'Sales', color: 'blue', models: ['orders'] }]);
  });
});
