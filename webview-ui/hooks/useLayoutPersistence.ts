/**
 * Saved diagram layout state (spec 13/22): the active layout, the positions
 * seeded when one is opened, the live table positions, the explicit save, and
 * a debounced sync of the pending (unsaved) layout to the extension host's
 * in-memory cache — used for the close-time save prompt, never written to
 * disk by itself (spec 22).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildLayout, type DiagramLayoutTable, type DiagramNote } from '../../src/diagram/layoutFile';
import type { NodePosition } from '../../src/diagram/positions';
import { postToHost } from '../host';
import { isLayoutDirty, type LayoutSnapshot } from '../layout-dirty';
import type { LayoutActiveMessage, LayoutApplyMessage } from './useHostMessages';

/** Debounce before the pending layout cache-sync message is posted. */
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
  /** True when the current tables/notes differ from the last-saved/opened snapshot. */
  dirty: boolean;
}

export function useLayoutPersistence(notes: readonly DiagramNote[] = []): LayoutPersistenceState {
  const [activeLayout, setActiveLayout] = useState<{ path: string; name: string } | null>(null);
  const [seedPositions, setSeedPositions] = useState<Map<string, NodePosition> | null>(null);
  const [seedTick, setSeedTick] = useState(0);
  const [tablePositions, setTablePositions] = useState<DiagramLayoutTable[]>([]);
  const [layoutMissing, setLayoutMissing] = useState<string[]>([]);
  // Spec 13/14: guards the debounced pending-layout sync until the canvas has
  // rendered at least one table, so opening a diagram can never truncate its
  // host-side cache before the first render.
  const writeArmedRef = useRef(false);
  // Spec 22: the last-saved (or just-opened) snapshot, compared against the
  // current tables/notes to drive the dirty flag.
  const savedSnapshotRef = useRef<LayoutSnapshot | null>(null);
  const [dirty, setDirty] = useState(false);

  const applyLayout = useCallback((message: LayoutApplyMessage): string[] => {
    const names = message.layout.tables.map((table) => table.name);
    setSeedPositions(
      new Map(message.layout.tables.map((table) => [table.name, { x: table.x, y: table.y }])),
    );
    setSeedTick((tick) => tick + 1);
    setLayoutMissing(message.missing);
    savedSnapshotRef.current = { tables: message.layout.tables, notes: message.layout.notes };
    setDirty(false);
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
    const layout = buildLayout(activeLayout?.name ?? 'mydiagram', tablePositions, notes);
    postToHost({ type: 'layout:save', layout });
    // Optimistic: there is no save-ack message in the protocol, so the
    // snapshot is taken from what was just sent (spec 22).
    savedSnapshotRef.current = { tables: layout.tables, notes: layout.notes };
    setDirty(false);
  }, [activeLayout, tablePositions, notes]);

  // Recompute dirty whenever the live tables/notes change, comparing through
  // `buildLayout` so both sides are sorted/rounded the same way (spec 22).
  useEffect(() => {
    if (activeLayout === null) {
      setDirty(false);
      return;
    }
    const current = buildLayout(activeLayout.name, tablePositions, notes);
    setDirty(
      isLayoutDirty(
        { tables: current.tables, notes: current.notes },
        savedSnapshotRef.current,
      ),
    );
  }, [activeLayout, tablePositions, notes]);

  // Pending-layout cache sync (spec 22): once a layout is active, every drag
  // or visibility change posts the current layout (with its dirty flag) to
  // the extension host's in-memory cache after a short debounce, for use by
  // the close-time save prompt. This never writes to disk by itself. Notes
  // (spec 16) ride along; the runtime collapse state deliberately does not,
  // so peeking into a note never marks the diagram dirty.
  useEffect(() => {
    if (activeLayout === null) return;
    if (!writeArmedRef.current) return;
    const handle = window.setTimeout(() => {
      const layout = buildLayout(activeLayout.name, tablePositions, notes);
      postToHost({
        type: 'layout:pending',
        layout,
        dirty: isLayoutDirty(
          { tables: layout.tables, notes: layout.notes },
          savedSnapshotRef.current,
        ),
      });
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [activeLayout, tablePositions, notes]);

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
    dirty,
  };
}
