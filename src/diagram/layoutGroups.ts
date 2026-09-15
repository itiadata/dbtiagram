export type GroupColor = 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'cyan';

export const GROUP_COLORS: readonly GroupColor[] = ['blue', 'green', 'amber', 'purple', 'rose', 'cyan'];
export const GROUP_PADDING = 32;
export const GROUP_LABEL_HEIGHT = 28;

export interface DiagramGroup {
  id: string;
  name: string;
  color: GroupColor;
  models: string[];
}

export interface GroupRect { x: number; y: number; width: number; height: number }
export interface GroupTableRect extends GroupRect { name: string }

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === 'string' && GROUP_COLORS.includes(value as GroupColor);
}

export function normalizeGroupName(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function newGroupId(random: () => number): string {
  return `g-${Math.floor(random() * 0x1000000).toString(16).padStart(6, '0')}`;
}

export function nextGroupColor(groups: readonly DiagramGroup[]): GroupColor {
  const counts = new Map(GROUP_COLORS.map((color) => [color, 0]));
  for (const group of groups) counts.set(group.color, (counts.get(group.color) ?? 0) + 1);
  return GROUP_COLORS.reduce((best, color) =>
    (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best,
  );
}

function normalizedModels(models: readonly unknown[]): string[] {
  return [...new Set(models.filter((model): model is string => typeof model === 'string' && model !== ''))].sort();
}

export function normalizeGroups(groups: readonly DiagramGroup[]): DiagramGroup[] {
  return groups
    .map((group) => ({ ...group, name: normalizeGroupName(group.name) ?? '', models: normalizedModels(group.models) }))
    .filter((group) => group.name !== '' && group.models.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function parseGroups(raw: unknown, fail: (message: string) => never): DiagramGroup[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail('Diagram file "groups" must be an array');
  const groups: DiagramGroup[] = [];
  const seen = new Set<string>();
  const claimed = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry)) fail('Every entry in "groups" must be a mapping');
    const { id, name, color, tables } = entry;
    if (typeof id !== 'string' || id === '') fail('Every group entry needs an "id"');
    if (typeof name !== 'string' || normalizeGroupName(name) === undefined) fail(`Group "${id}" needs a non-empty string "name"`);
    if (!isGroupColor(color)) fail(`Group "${id}" has an invalid "color"`);
    if (!Array.isArray(tables)) fail(`Group "${id}" needs a "tables" array`);
    if (seen.has(id)) continue;
    seen.add(id);
    const unique = normalizedModels(tables).filter((model) => !claimed.has(model));
    unique.forEach((model) => claimed.add(model));
    if (unique.length > 0) groups.push({ id, name: name.trim(), color, models: unique });
  }
  return normalizeGroups(groups);
}

export function groupForModel(groups: readonly DiagramGroup[], model: string): DiagramGroup | undefined {
  return groups.find((group) => group.models.includes(model));
}

export function replaceGroupModels(groups: readonly DiagramGroup[], id: string, models: readonly string[]): DiagramGroup[] {
  const unique = normalizedModels(models);
  if (unique.length === 0) return groups.filter((group) => group.id !== id);
  const selected = new Set(unique);
  return normalizeGroups(groups
    .map((group) => group.id === id ? { ...group, models: unique } : { ...group, models: group.models.filter((model) => !selected.has(model)) })
    .filter((group) => group.models.length > 0));
}

export function addModelToGroup(groups: readonly DiagramGroup[], id: string, model: string): DiagramGroup[] {
  const target = groups.find((group) => group.id === id);
  return target === undefined ? [...groups] : replaceGroupModels(groups, id, [...target.models, model]);
}

export function removeModelFromGroup(groups: readonly DiagramGroup[], model: string): DiagramGroup[] {
  return normalizeGroups(groups
    .map((group) => ({ ...group, models: group.models.filter((candidate) => candidate !== model) }))
    .filter((group) => group.models.length > 0));
}

export function groupRect(group: DiagramGroup, tables: readonly GroupTableRect[]): GroupRect | null {
  const members = tables.filter((table) => group.models.includes(table.name));
  if (members.length === 0) return null;
  const left = Math.min(...members.map((table) => table.x));
  const top = Math.min(...members.map((table) => table.y));
  const right = Math.max(...members.map((table) => table.x + table.width));
  const bottom = Math.max(...members.map((table) => table.y + table.height));
  return {
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING - GROUP_LABEL_HEIGHT,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
