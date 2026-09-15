import {
  nextGroupColor,
  normalizeGroupName,
  normalizeGroups,
  replaceGroupModels,
  type DiagramGroup,
  type GroupColor,
} from '../src/diagram/layoutGroups';

export function createGroupFromPicker(
  groups: readonly DiagramGroup[],
  id: string,
  result: { name: string; models: string[] } | null,
): DiagramGroup[] {
  if (result === null) return groups as DiagramGroup[];
  const name = normalizeGroupName(result.name);
  if (name === undefined || result.models.length === 0) return groups as DiagramGroup[];
  return normalizeGroups([...groups, { id, name, color: nextGroupColor(groups), models: result.models }]);
}

export function applyGroupTablePicker(groups: readonly DiagramGroup[], id: string, models: readonly string[] | null): DiagramGroup[] {
  return models === null ? groups as DiagramGroup[] : replaceGroupModels(groups, id, models);
}

export function applyGroupRename(groups: readonly DiagramGroup[], id: string, name: string | null): DiagramGroup[] {
  if (name === null) return groups as DiagramGroup[];
  const normalized = normalizeGroupName(name);
  return normalized === undefined ? groups as DiagramGroup[] : groups.map((group) => group.id === id ? { ...group, name: normalized } : group);
}

export function changeGroupColor(groups: readonly DiagramGroup[], id: string, color: GroupColor): DiagramGroup[] {
  return groups.map((group) => group.id === id ? { ...group, color } : group);
}
