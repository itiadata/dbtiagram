interface LineageProgressProps { scanned: number; total: number; onCancel: () => void }
export function LineageProgress({ scanned, total, onCancel }: LineageProgressProps): JSX.Element {
  return <div className="lineage-progress" role="dialog" aria-modal="true"><div className="lineage-progress__card"><strong>Calculating downstream lineage</strong><p>{scanned} of {total} SQL files scanned</p><button type="button" className="panel-button" onClick={onCancel}>Cancel</button></div></div>;
}
