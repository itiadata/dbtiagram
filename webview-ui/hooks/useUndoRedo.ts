import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagramLayout } from '../../src/diagram/layoutFile';
import type { HistoryState } from '../../src/shared/history';
import { postToHost } from '../host';
import { beginLayoutCapture, finishLayoutCapture, type LayoutCapture } from '../layout-history';
import { historyShortcut } from '../history-shortcuts';

const EMPTY_HISTORY: HistoryState = { items: [], cursor: 0, truncated: false };

export interface UndoRedoState {
  history: HistoryState;
  historyOpen: boolean;
  undo: () => void;
  redo: () => void;
  goTo: (cursor: number) => void;
  openHistory: () => void;
  closeHistory: () => void;
  applyHistoryState: (state: HistoryState) => void;
  bindLayout: (layout: DiagramLayout, apply: (layout: DiagramLayout) => void) => void;
  applyLayout: (layout: DiagramLayout) => void;
  recordMutation: (label: string, mutate: () => void) => void;
  beginGesture: (label: string) => void;
  finishGesture: () => void;
}

export function useUndoRedo(): UndoRedoState {
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [historyOpen, setHistoryOpen] = useState(false);
  const layoutRef = useRef<DiagramLayout | null>(null);
  const applyRef = useRef<((layout: DiagramLayout) => void) | null>(null);
  const captureRef = useRef<LayoutCapture | null>(null);

  const finish = useCallback((): void => {
    const capture = captureRef.current;
    const current = layoutRef.current;
    if (capture === null || current === null) return;
    const completed = finishLayoutCapture(capture, current);
    captureRef.current = null;
    if (completed !== null) postToHost({ type: 'history:recordLayout', ...completed });
  }, []);

  const scheduleFinish = useCallback((): void => {
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }, [finish]);

  const undoAction = useCallback(() => postToHost({ type: 'history:undo' }), []);
  const redoAction = useCallback(() => postToHost({ type: 'history:redo' }), []);

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editable = target?.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      const action = historyShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, editable });
      if (action === null || (action === 'undo' ? history.cursor === 0 : history.cursor === history.items.length)) return;
      event.preventDefault();
      if (action === 'undo') undoAction(); else redoAction();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [history, undoAction, redoAction]);

  return {
    history,
    historyOpen,
    undo: undoAction,
    redo: redoAction,
    goTo: (cursor) => postToHost({ type: 'history:goTo', cursor }),
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    applyHistoryState: setHistory,
    bindLayout: (layout, apply) => { layoutRef.current = layout; applyRef.current = apply; },
    applyLayout: (layout) => applyRef.current?.(layout),
    recordMutation: (label, mutate) => {
      const current = layoutRef.current;
      if (current === null) { mutate(); return; }
      captureRef.current = beginLayoutCapture(label, current);
      mutate();
      scheduleFinish();
    },
    beginGesture: (label) => {
      if (layoutRef.current !== null) captureRef.current = beginLayoutCapture(label, layoutRef.current);
    },
    finishGesture: scheduleFinish,
  };
}
