import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelEdit } from '../../src/dbt/edit';
import type { DiagramGraph } from '../../src/diagram/graph';
import {
  afterPaste,
  clipboardEdit,
  copySelection,
  cutSelection,
  selectColumn,
  selectionContains,
  type ColumnClipboard,
  type ColumnInsertTarget,
  type ColumnSelection,
} from '../column-transfer-state';

export interface ColumnTransferState {
  selection: ColumnSelection | null;
  clipboard: ColumnClipboard;
  insertionTarget: ColumnInsertTarget | null;
  select: (model: string, column: string, orderedColumns: readonly string[], extend: boolean) => void;
  selectForContextMenu: (model: string, column: string, orderedColumns: readonly string[]) => void;
  copy: () => void;
  cut: () => void;
  paste: (target: ColumnInsertTarget) => ModelEdit | null;
  beginDrag: (model: string, column: string, orderedColumns: readonly string[]) => void;
  hoverInsertion: (target: ColumnInsertTarget | null) => void;
  drop: (target: ColumnInsertTarget, ctrlKey: boolean) => ModelEdit | null;
  reconcile: (graph: DiagramGraph) => void;
}

export function useColumnTransfer(): ColumnTransferState {
  const [selection, setSelection] = useState<ColumnSelection | null>(null);
  const [clipboard, setClipboard] = useState<ColumnClipboard>(null);
  const [insertionTarget, setInsertionTarget] = useState<ColumnInsertTarget | null>(null);
  const selectionRef = useRef(selection);
  const clipboardRef = useRef(clipboard);
  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  const select = useCallback((model: string, column: string, order: readonly string[], extend: boolean) => {
    setSelection((current) => selectColumn(current, model, column, order, extend));
  }, []);
  const selectForContextMenu = useCallback((model: string, column: string, order: readonly string[]) => {
    setSelection((current) => selectionContains(current, { model, column })
      ? current
      : selectColumn(current, model, column, order, false));
  }, []);
  const copy = useCallback(() => setClipboard(copySelection(selectionRef.current)), []);
  const cut = useCallback(() => setClipboard(cutSelection(selectionRef.current)), []);
  const paste = useCallback((target: ColumnInsertTarget): ModelEdit | null => {
    const current = clipboardRef.current;
    if (current === null) return null;
    const edit = clipboardEdit(current, target);
    if (edit !== null) setClipboard(afterPaste(current));
    return edit;
  }, []);
  const beginDrag = useCallback((model: string, column: string, order: readonly string[]) => {
    setSelection((current) => selectionContains(current, { model, column })
      ? current
      : selectColumn(current, model, column, order, false));
  }, []);
  const drop = useCallback((target: ColumnInsertTarget, ctrlKey: boolean): ModelEdit | null => {
    setInsertionTarget(null);
    const current = selectionRef.current;
    if (current === null) return null;
    return {
      kind: 'transferColumns', sourceModel: current.model, destinationModel: target.model,
      columns: [...current.columns], before: target.before,
      copy: ctrlKey && current.model !== target.model,
    };
  }, []);
  const reconcile = useCallback((graph: DiagramGraph) => {
    const valid = (model: string, columns: readonly string[]): boolean => {
      const node = graph.nodes.find((candidate) => candidate.id === model);
      return node !== undefined && columns.every((column) => node.columns.some((candidate) => candidate.name === column));
    };
    setSelection((current) => current !== null && valid(current.model, current.columns) ? current : null);
    setClipboard((current) => current !== null && valid(current.sourceModel, current.columns) ? current : null);
  }, []);

  return { selection, clipboard, insertionTarget, select, selectForContextMenu, copy, cut, paste, beginDrag, hoverInsertion: setInsertionTarget, drop, reconcile };
}
