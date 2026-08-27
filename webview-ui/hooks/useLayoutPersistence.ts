/**
 * Saved diagram layout state (spec 13): the active layout, the positions
 * seeded when one is opened, the live table positions, the explicit save, and
 * the debounced live write-back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildLayout, type DiagramLayoutTable } from '../../src/diagram/layoutFile';
import type { NodePosition } from '../../src/diagram/positions';
import { postToHost } from '../host';
import type { LayoutActiveMessage, LayoutApplyMessage } from './useHostMessages';

/** Debounce before the live write-back rewrites the active layout file. */
const WRITE_DEBOUNCE_MS = 400;

export interface LayoutPersistenceState {
  activeLayout: { path: string; name: string } | null;
  seedPositions: Map<string, NodePosition> | null;
  seedTick: number;
  layoutMissing: string[];
  dismissLayoutMissing: () => void;
  onPositionsChange: (tables: DiagramLayoutTable[]) => void;
  onSaveDiagram: () => void;
  /** Seeds positions from an opened layout; returns its table names. */
  applyLayout: (message: LayoutApplyMessage) => string[];
  applyActiveLayout: (message: LayoutActiveMessage) => void;
}

export function useLayoutPersistence(): LayoutPersistenceState {
  const [activeLayout, setActiveLayout] = useState<{ path: string; name: string } | null>(null);
  const [seedPositions, setSeedPositions] = useState<Map<string, NodePosition> | null>(null);
  const [seedTick, setSeedTick] = useState(0);
  const [tablePositions, setTablePositions] = useState<DiagramLayoutTable[]>([]);
  const [layoutMissing, setLayoutMissing] = useState<string[]>([]);
  // Spec 13/14: guards the debounced layout write-back until the canvas has
  // rendered at least one table, so opening a diagram can never truncate its
  // file before the first render.
  const writeArmedRef = useRef(false);

  const applyLayout = useCallback((message: LayoutApplyMessage): string[] => {
    const names = message.layout.tables.map((table) => table.name);
    setSeedPositions(
      new Map(message.layout.tables.map((table) => [table.name, { x: table.x, y: table.y }])),
    );
    setSeedTick((tick) => tick + 1);
    setLayoutMissing(message.missing);
    return names;
  }, []);

  const applyActiveLayout = useCallback((message: LayoutActiveMessage): void => {
    setActiveLayout(
      message.path === null || message.name === null
        ? null
        : { path: message.path, name: message.name },
    );
  }, []);

  const dismissLayoutMissing = useCallback((): void => {
    setLayoutMissing([]);
  }, []);

  // Spec 13: the canvas reports the live positions of the visible tables; they
  // are the single source for both the explicit save and the live write-back.
  const onPositionsChange = useCallback((tables: DiagramLayoutTable[]): void => {
    // Arm the live write-back only once the canvas has actually rendered
    // tables. Before that, `tablePositions` is still empty and a debounced
    // write would truncate the opened layout file to `tables: []`.
    if (tables.length > 0) {
      writeArmedRef.current = true;
    }
    setTablePositions((current) =>
      current.length === tables.length &&
      current.every(
        (table, index) =>
          table.name === tables[index].name &&
          table.x === tables[index].x &&
          table.y === tables[index].y,
      )
        ? current
        : tables,
    );
  }, []);

  const onSaveDiagram = useCallback((): void => {
    postToHost({
      type: 'layout:save',
      layout: buildLayout(activeLayout?.name ?? 'mydiagram', tablePositions),
    });
  }, [activeLayout, tablePositions]);

  // Live write-back: once a layout is active, every drag or visibility change
  // rewrites its file after a short debounce, with no further user action.
  useEffect(() => {
    if (activeLayout === null) return;
    if (!writeArmedRef.current) return;
    const handle = window.setTimeout(() => {
      postToHost({
        type: 'layout:changed',
        layout: buildLayout(activeLayout.name, tablePositions),
      });
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [activeLayout, tablePositions]);

  return {
    activeLayout,
    seedPositions,
    seedTick,
    layoutMissing,
    dismissLayoutMissing,
    onPositionsChange,
    onSaveDiagram,
    applyLayout,
    applyActiveLayout,
  };
}
