import type { HistoryState } from '../src/shared/history';

export interface HistoryPanelProps { state: HistoryState; onGoTo: (cursor: number) => void; onClose: () => void }

export function HistoryPanel({ state, onGoTo, onClose }: HistoryPanelProps): JSX.Element {
  const newestFirst = state.items.map((item, index) => ({ item, cursor: index + 1 })).reverse();
  return <div className="history-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="history-panel" role="dialog" aria-label="History" onMouseDown={(event) => event.stopPropagation()}>
      <header><strong>History</strong><button type="button" className="panel-button" onClick={onClose}>Close</button></header>
      {newestFirst.map(({ item, cursor }) => <button key={item.id} type="button" className="history-row" disabled={state.cursor === cursor} onClick={() => onGoTo(cursor)}>
        <span>{item.label}</span><small>{item.domain === 'yaml' ? 'YAML' : 'Layout'}</small>{state.cursor === cursor && <em>Current</em>}
      </button>)}
      <button type="button" className="history-row" disabled={state.cursor === 0} onClick={() => onGoTo(0)}>
        <span>{state.truncated ? 'Earlier state' : 'Initial state'}</span>{state.cursor === 0 && <em>Current</em>}
      </button>
    </section>
  </div>;
}
