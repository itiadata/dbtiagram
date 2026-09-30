import { useEffect } from 'react';
import type { ModelRenameImpact } from '../src/shared/protocol';

export interface ModelRenameImpactProps { impact: ModelRenameImpact; onClose: () => void }

export function ModelRenameImpactDialog({ impact, onClose }: ModelRenameImpactProps): JSX.Element {
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [onClose]);
  return <div className="import-report-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="import-report model-rename-impact" role="dialog" aria-label={`Renamed ${impact.oldName} to ${impact.newName}`}>
      <h2>Renamed {impact.oldName} to {impact.newName}</h2>
      <h3>Updated files</h3>
      <ul>{impact.updatedFiles.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
      {impact.sqlRename === undefined
        ? <p>No model SQL file was renamed</p>
        : <p>Renamed: <code>{impact.sqlRename.from}</code> → <code>{impact.sqlRename.to}</code></p>}
      <button type="button" className="panel-button" onClick={onClose}>OK</button>
    </div>
  </div>;
}
