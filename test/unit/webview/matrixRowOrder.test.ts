import { describe, expect, it } from 'vitest';
import { addColumnEdit, hasActiveMatrixFilter, matrixReorderEdit } from '../../../webview-ui/matrix-row-order';

describe('matrix row order', () => {
  it('detects only nonblank active filters', () => {
    expect(hasActiveMatrixFilter({ name: '   ', dataType: 'int' })).toBe(true);
    expect(hasActiveMatrixFilter({ name: ' ', dataType: '' })).toBe(false);
  });

  it('builds same-table row reorder edit', () => {
    expect(matrixReorderEdit('orders', [], 'amount', 'customer_id')).toEqual({
      kind: 'transferColumns', sourceModel: 'orders', destinationModel: 'orders', columns: ['amount'], before: 'customer_id', copy: false,
    });
  });

  it('requires both trimmed add-column fields', () => {
    expect(addColumnEdit('orders', 'status', '')).toBeNull();
    expect(addColumnEdit('orders', ' status ', ' varchar ')).toEqual({ kind: 'addColumn', model: 'orders', name: 'status', dataType: 'varchar' });
  });
});
