import { useEffect } from 'react';
import type { SourceImportReport } from '../src/shared/protocol';

export interface ImportReportProps {
  report: SourceImportReport;
  onClose: () => void;
}

export function ImportReport({ report, onClose }: ImportReportProps): JSX.Element {
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);
  return <div className="import-report-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="import-report" role="dialog" aria-label="Source import complete">
      <h2>Source import complete</h2>
      <p>Imported {report.importedModels.length} model{report.importedModels.length === 1 ? '' : 's'} successfully.</p>
      <ul>{report.importedModels.map((name) => <li key={name}>{name}</li>)}</ul>
      {report.brokenForeignKeys.length === 0
        ? <p>No broken foreign keys.</p>
        : <><h3>Broken foreign keys ({report.brokenForeignKeys.length})</h3><ul>{report.brokenForeignKeys.map((fk, index) => <li key={`${fk.display}:${index}`}>{fk.display}</li>)}</ul></>}
      <button type="button" className="panel-button" onClick={onClose}>Close</button>
    </div>
  </div>;
}
