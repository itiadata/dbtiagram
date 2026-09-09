import { useEffect, useMemo, useRef, useState } from 'react';

export interface AiPromptExportProps {
  model: string;
  eligibleColumnCount: number;
  onCopy: (batchSize: number, batchNumber: number) => void;
  onClose: () => void;
}

export function AiPromptExport({ model, eligibleColumnCount, onCopy, onClose }: AiPromptExportProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [choice, setChoice] = useState('25');
  const [custom, setCustom] = useState('25');
  const [batchNumber, setBatchNumber] = useState('1');
  const batchSize = choice === 'custom' ? Number(custom) : Number(choice);
  const total = useMemo(() => Number.isInteger(batchSize) && batchSize > 0 ? Math.ceil(eligibleColumnCount / batchSize) : 0, [batchSize, eligibleColumnCount]);
  const requested = Number(batchNumber);
  const valid = eligibleColumnCount > 0 && Number.isInteger(batchSize) && batchSize > 0 && Number.isInteger(requested) && requested >= 1 && requested <= total;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current !== null && event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('pointerdown', onPointerDown); };
  }, [onClose]);
  return <div className="ai-prompt-overlay"><div className="ai-prompt-dialog" ref={ref} role="dialog" aria-label="Copy AI rename/type prompt">
    <h2>Copy AI rename/type prompt</h2>
    <p className="ai-prompt-dialog__model"><span>Model</span><strong>{model}</strong></p>
    <div className="ai-prompt-dialog__metrics">
      <p><span>Eligible columns</span><strong>{eligibleColumnCount}</strong></p>
      <p><span>Batches</span><strong>{total}</strong></p>
    </div>
    {eligibleColumnCount === 0 && <p className="ai-prompt-dialog__empty">No columns with source name and data type provenance are available to export.</p>}
    <div className="ai-prompt-dialog__controls">
      <label><span>Columns per batch</span><select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="custom">Custom</option></select></label>
      {choice === 'custom' && <label><span>Custom batch size</span><input type="number" min="1" value={custom} onChange={(event) => setCustom(event.target.value)} /></label>}
      <label><span>Batch number</span><input type="number" min="1" max={total} value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} /></label>
    </div>
    <div className="ai-prompt-dialog__actions"><button type="button" className="panel-button" onClick={onClose}>Cancel</button><button type="button" className="panel-button" disabled={!valid} onClick={() => onCopy(batchSize, requested)}>Copy prompt</button></div>
  </div></div>;
}
