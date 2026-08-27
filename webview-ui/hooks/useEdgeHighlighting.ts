/**
 * Hover-driven edge and column highlighting (spec 03/08/12).
 *
 * Hover state lives apart from the layout memos so hovering only re-derives
 * highlights — node positions and manual drags stay stable.
 */
import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Edge } from '@xyflow/react';
import type { FlowElements } from '../../src/diagram/flow';

interface ColumnRef {
  model: string;
  column: string;
}

export interface EdgeHighlightingState {
  edges: Edge[];
  highlightedColumns: Map<string, Set<string>>;
  onColumnHover: (model: string, column: string) => void;
  onColumnLeave: (model: string, column: string) => void;
  onEdgeMouseEnter: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
}

export function useEdgeHighlighting(flow: FlowElements | null): EdgeHighlightingState {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<ColumnRef | null>(null);

  const activeEdgeIds = useMemo(() => {
    if (flow === null) return new Set<string>();
    const set = new Set<string>();
    if (hoveredEdgeId !== null) set.add(hoveredEdgeId);
    if (hoveredColumn !== null) {
      for (const edge of flow.edges) {
        if (edge.data.sourceColumn === undefined) continue;
        const touches =
          (edge.source === hoveredColumn.model &&
            edge.data.sourceColumn === hoveredColumn.column) ||
          (edge.target === hoveredColumn.model &&
            edge.data.targetColumn === hoveredColumn.column);
        if (touches) set.add(edge.id);
      }
    }
    return set;
  }, [flow, hoveredEdgeId, hoveredColumn]);

  const edges = useMemo<Edge[]>(() => {
    if (flow === null) return [];
    return flow.edges.map((edge) => {
      const active = activeEdgeIds.has(edge.id);
      // Virtual FKs draw dashed (spec 08) — combined with the hover/active
      // class so a hovered virtual edge keeps its active styling.
      const classes = [
        active ? 'edge--active' : null,
        edge.data.virtual ? 'edge--virtual' : null,
        edge.data.unresolved !== undefined ? 'edge--unresolved' : null,
      ].filter((c): c is string => c !== null);
      return {
        ...edge,
        className: classes.length > 0 ? classes.join(' ') : undefined,
        // Every active edge flows (dashes travel child -> parent): the hovered
        // edge, or all edges touching a hovered column (spec 03).
        animated: active,
      };
    });
  }, [flow, activeEdgeIds]);

  const highlightedColumns = useMemo(() => {
    const byModel = new Map<string, Set<string>>();
    if (flow === null) return byModel;
    const add = (model: string, column: string): void => {
      let set = byModel.get(model);
      if (set === undefined) {
        set = new Set();
        byModel.set(model, set);
      }
      set.add(column);
    };
    if (hoveredColumn !== null) add(hoveredColumn.model, hoveredColumn.column);
    for (const edge of flow.edges) {
      if (!activeEdgeIds.has(edge.id)) continue;
      if (edge.data.sourceColumn !== undefined) add(edge.source, edge.data.sourceColumn);
      if (edge.data.targetColumn !== undefined) add(edge.target, edge.data.targetColumn);
    }
    return byModel;
  }, [flow, activeEdgeIds, hoveredColumn]);

  const onColumnHover = useCallback((model: string, column: string): void => {
    setHoveredColumn({ model, column });
  }, []);

  const onColumnLeave = useCallback((model: string, column: string): void => {
    setHoveredColumn((current) =>
      current !== null && current.model === model && current.column === column ? null : current,
    );
  }, []);

  const onEdgeMouseEnter = useCallback((_event: ReactMouseEvent, edge: Edge): void => {
    setHoveredEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback((): void => {
    setHoveredEdgeId(null);
  }, []);

  return {
    edges,
    highlightedColumns,
    onColumnHover,
    onColumnLeave,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
  };
}
