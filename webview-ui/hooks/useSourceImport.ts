import { useCallback, useState } from 'react';
import type { SourceImportReport } from '../../src/shared/protocol';
import { postToHost } from '../host';

export interface SourceImportState {
  report: SourceImportReport | null;
  start: () => void;
  applyResult: (report: SourceImportReport) => void;
  dismiss: () => void;
}

export function useSourceImport(
  showImportedModels: (names: readonly string[], destinationUri: string) => void,
): SourceImportState {
  const [report, setReport] = useState<SourceImportReport | null>(null);
  const start = useCallback(() => postToHost({ type: 'sourceImport:start' }), []);
  const applyResult = useCallback((result: SourceImportReport): void => {
    showImportedModels(result.importedModels, result.destinationUri);
    setReport(result);
  }, [showImportedModels]);
  const dismiss = useCallback(() => setReport(null), []);
  return { report, start, applyResult, dismiss };
}
