import type { HistoryState } from '../src/shared/history';
import { History, Redo2, Undo2 } from './icons';

export interface UndoRedoControlsProps { state: HistoryState; onUndo: () => void; onRedo: () => void; onOpenHistory: () => void }

export function UndoRedoControls({ state, onUndo, onRedo, onOpenHistory }: UndoRedoControlsProps): JSX.Element {
  return <div className="undo-redo-controls">
    <button type="button" className="panel-button" title="Undo" aria-label="Undo" disabled={state.cursor === 0} onClick={onUndo}><Undo2 size={16} /></button>
    <button type="button" className="panel-button" title="Redo" aria-label="Redo" disabled={state.cursor === state.items.length} onClick={onRedo}><Redo2 size={16} /></button>
    <button type="button" className="panel-button" title="History" aria-label="History" onClick={onOpenHistory}><History size={16} /></button>
  </div>;
}
