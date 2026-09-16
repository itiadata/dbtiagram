import { useCallback, useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import {
  addModelToGroup,
  groupRect,
  newGroupId,
  normalizeGroups,
  removeModelFromGroup,
  type DiagramGroup,
  type GroupColor,
  type GroupRect,
  type GroupTableRect,
} from '../../src/diagram/layoutGroups';
import type { GroupPickerCandidate } from '../../src/shared/protocol';
import { postToHost } from '../host';
import { applyGroupRename, applyGroupTablePicker, changeGroupColor, createGroupFromPicker } from '../group-state';

export interface GroupNodeData extends Record<string, unknown> {
  group: DiagramGroup;
  viewport: GroupRect;
  zoom: number;
}

export interface GroupsState {
  groups: DiagramGroup[];
  groupNodes: Node<GroupNodeData, 'group'>[];
  groupIds: ReadonlySet<string>;
  mutationRevision: number;
  startCreate: (candidates: readonly GroupPickerCandidate[]) => void;
  startEditTables: (id: string, candidates: readonly GroupPickerCandidate[]) => void;
  startRename: (id: string) => void;
  applyCreateResult: (result: { name: string; models: string[] } | null) => void;
  applyEditTablesResult: (id: string, models: string[] | null) => void;
  applyRenameResult: (id: string, name: string | null) => void;
  addModel: (id: string, model: string) => void;
  removeModel: (model: string) => void;
  setColor: (id: string, color: GroupColor) => void;
  removeGroup: (id: string) => void;
  applyLayoutGroups: (groups: readonly DiagramGroup[]) => void;
  replaceFromHistory: (groups: readonly DiagramGroup[]) => void;
  setTableRects: (tables: readonly GroupTableRect[]) => void;
}

export function useGroups(recordMutation?: (label: string, mutate: () => void) => void): GroupsState {
  const [groups, setGroups] = useState<DiagramGroup[]>([]);
  const [tableRects, setRects] = useState<readonly GroupTableRect[]>([]);
  const [mutationRevision, setMutationRevision] = useState(0);
  const setTableRects = useCallback((tables: readonly GroupTableRect[]): void => {
    setRects((current) => JSON.stringify(current) === JSON.stringify(tables) ? current : [...tables]);
  }, []);
  const mutate = useCallback((label: string, fn: (current: DiagramGroup[]) => DiagramGroup[]): void => {
    const apply = (): void => setGroups((current) => {
      const next = fn(current);
      if (next !== current) setMutationRevision((revision) => revision + 1);
      return next;
    });
    if (recordMutation === undefined) apply(); else recordMutation(label, apply);
  }, [recordMutation]);
  const groupNodes = useMemo(() => groups.flatMap((group): Node<GroupNodeData, 'group'>[] => {
    const rect = groupRect(group, tableRects);
    return rect === null ? [] : [{
      id: group.id,
      type: 'group',
      position: { x: rect.x, y: rect.y },
      width: rect.width,
      height: rect.height,
      style: { width: rect.width, height: rect.height },
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: { group, viewport: rect, zoom: 1 },
    }];
  }), [groups, tableRects]);

  return {
    groups,
    groupNodes,
    groupIds: useMemo(() => new Set(groups.map((group) => group.id)), [groups]),
    mutationRevision,
    startCreate: (candidates) => postToHost({ type: 'group:create', candidates: [...candidates] }),
    startEditTables: (id, candidates) => {
      const selected = groups.find((group) => group.id === id)?.models ?? [];
      postToHost({ type: 'group:editTables', groupId: id, candidates: [...candidates], selected });
    },
    startRename: (id) => {
      const current = groups.find((group) => group.id === id);
      if (current !== undefined) postToHost({ type: 'group:rename', groupId: id, currentName: current.name });
    },
    applyCreateResult: (result) => mutate(`Create group ${result?.name ?? ''}`, (current) => createGroupFromPicker(current, newGroupId(Math.random), result)),
    applyEditTablesResult: (id, models) => mutate(`Edit group ${groups.find((group) => group.id === id)?.name ?? id} tables`, (current) => applyGroupTablePicker(current, id, models)),
    applyRenameResult: (id, name) => mutate(`Rename group ${groups.find((group) => group.id === id)?.name ?? id} to ${name ?? ''}`, (current) => applyGroupRename(current, id, name)),
    addModel: (id, model) => mutate(`Edit group ${groups.find((group) => group.id === id)?.name ?? id} tables`, (current) => addModelToGroup(current, id, model)),
    removeModel: (model) => mutate(`Edit group ${groups.find((group) => group.models.includes(model))?.name ?? model} tables`, (current) => removeModelFromGroup(current, model)),
    setColor: (id, color) => mutate(`Change group ${groups.find((group) => group.id === id)?.name ?? id} color`, (current) => changeGroupColor(current, id, color)),
    removeGroup: (id) => mutate(`Remove group ${groups.find((group) => group.id === id)?.name ?? id}`, (current) => current.filter((group) => group.id !== id)),
    applyLayoutGroups: (next) => setGroups(normalizeGroups(next)),
    replaceFromHistory: (next) => setGroups(normalizeGroups(next)),
    setTableRects,
  };
}
