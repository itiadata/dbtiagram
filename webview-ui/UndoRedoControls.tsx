import type { HistoryState } from '../src/shared/history';
import { Redo, RotateCcwClock, Undo } from './icons';

export interface UndoRedoControlsProps { state: HistoryState; onUndo: () => void; onRedo: () => void; onOpenHistory: () => void }

export function UndoRedoControls({ state, onUndo, onRedo, onOpenHistory }: UndoRedoControlsProps): JSX.Element {
  return <div className="undo-redo-controls">
    <button type="button" className="panel-button panel-button--secondary undo-redo-controls__button" title="Undo" aria-label="Undo" disabled={state.cursor === 0} onClick={onUndo}><Undo size={16} /></button>
    <button type="button" className="panel-button panel-button--secondary undo-redo-controls__button" title="Redo" aria-label="Redo" disabled={state.cursor === state.items.length} onClick={onRedo}><Redo size={16} /></button>
    <button type="button" className="panel-button panel-button--secondary undo-redo-controls__button" title="History" aria-label="History" onClick={onOpenHistory}><RotateCcwClock size={16} /></button>
  </div>;
}
