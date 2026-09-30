import { useCallback, useMemo, useState } from 'react';
import type { TableNode } from '../../src/diagram/graph';
import type { LineageEdge } from '../../src/diagram/lineage';
import type { LineageExpansionResult, LineageProgress } from '../../src/webview/lineage';
import { postToHost } from '../host';

export interface LineageState {
  nodes: TableNode[];
  edges: LineageEdge[];
  progress: (LineageProgress & { requestId: string }) | null;
  expand: (root: string, direction: 'upstream' | 'downstream') => void;
  cancel: () => void;
  applyState: (nodes: TableNode[], edges: LineageEdge[]) => void;
  applyProgress: (requestId: string, scanned: number, total: number) => void;
  applyResult: (result: LineageExpansionResult | null) => void;
  restoreLayoutNodes: (ids: readonly string[]) => void;
  removeNode: (id: string) => void;
  placementDirection: 'upstream' | 'downstream' | null;
}

export function useLineage(addLocalModels: (names: readonly string[]) => void): LineageState {
  const [nodes, setNodes] = useState<TableNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [progress, setProgress] = useState<(LineageProgress & { requestId: string }) | null>(null);
  const [placementDirection, setPlacementDirection] = useState<'upstream' | 'downstream' | null>(null);

  const expand = useCallback((root: string, direction: 'upstream' | 'downstream'): void => {
    const requestId = `${Date.now()}:${Math.random()}`;
    if (direction === 'downstream') setProgress({ requestId, scanned: 0, total: 0 });
    postToHost({ type: 'lineage:expand', requestId, root, direction });
  }, []);
  const cancel = useCallback((): void => {
    if (progress !== null) postToHost({ type: 'lineage:cancel', requestId: progress.requestId });
  }, [progress]);
  const applyState = useCallback((nextNodes: TableNode[], nextEdges: LineageEdge[]): void => {
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, []);
  const applyProgress = useCallback((requestId: string, scanned: number, total: number): void => {
    setProgress((current) => current?.requestId === requestId ? { requestId, scanned, total } : current);
  }, []);
  const applyResult = useCallback((result: LineageExpansionResult | null): void => {
    setProgress(null);
    if (result === null) return;
    setPlacementDirection(result.direction);
    addLocalModels(result.nodes.filter((node) => node.lineageKind === 'local').map((node) => node.id));
    setNodes((current) => mergeNodes(current, result.nodes.filter((node) => node.readOnly === true)));
    setEdges((current) => mergeEdges(current, result.edges));
  }, [addLocalModels]);
  const restoreLayoutNodes = useCallback((ids: readonly string[]): void => {
    const restored = ids.map(parseExternalNode).filter((node): node is TableNode => node !== null);
    setNodes((current) => mergeNodes(current, restored));
  }, []);
  const removeNode = useCallback((id: string): void => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.parent !== id && edge.child !== id));
  }, []);
  return useMemo(() => ({ nodes, edges, progress, placementDirection, expand, cancel, applyState, applyProgress, applyResult, restoreLayoutNodes, removeNode }), [nodes, edges, progress, placementDirection, expand, cancel, applyState, applyProgress, applyResult, restoreLayoutNodes, removeNode]);
}

function mergeNodes(current: readonly TableNode[], added: readonly TableNode[]): TableNode[] {
  return [...current.filter((item) => !added.some((node) => node.id === item.id)), ...added];
}
function mergeEdges(current: readonly LineageEdge[], added: readonly LineageEdge[]): LineageEdge[] {
  return [...current, ...added.filter((edge) => !current.some((item) => item.parent === edge.parent && item.child === edge.child))];
}
function parseExternalNode(id: string): TableNode | null {
  const match = /^external:([^:]+):(.+)$/.exec(id);
  return match === null ? null : { id, label: match[2], columns: [], foreignKeys: [], foreignKeyColumns: [], readOnly: true, lineageKind: 'external', packageName: match[1] };
}
