import { describe, expect, it } from 'vitest';
import type { MatrixRow } from '../../../src/diagram/matrix';
import {
  isEditableMetaScalar,
  matrixArrayEdit,
  matrixMetaPreview,
  metaValuesSupportTextBatch,
  parseEditedMetaScalar,
} from '../../../webview-ui/matrix-meta-values';

const row: MatrixRow = {
  model: 'orders', column: 'Day', isPrimaryKey: false,
  virtualPrimaryKey: false, meta: { sample_values: ['2026-08-17', '2026-08-18'] },
};

describe('matrix meta values', () => {
  it('renders an array as a comma-separated preview', () => {
    expect(matrixMetaPreview(['2026-08-17', '2026-08-18'])).toBe('2026-08-17, 2026-08-18');
  });

  it('builds one array edit without flattening values', () => {
    expect(matrixArrayEdit(row, { meta: 'sample_values' }, ['2026-08-17', '2026-08-19'])).toEqual({
      kind: 'setColumnMetaArray', model: 'orders', column: 'Day', key: 'sample_values',
      values: ['2026-08-17', '2026-08-19'],
    });
  });

  it('parses edited values according to their original scalar types', () => {
    expect(parseEditedMetaScalar('10', '11')).toEqual({ ok: true, value: '11' });
    expect(parseEditedMetaScalar(10, '12')).toEqual({ ok: true, value: 12 });
    expect(parseEditedMetaScalar(false, 'true')).toEqual({ ok: true, value: true });
  });

  it('rejects invalid number and boolean drafts', () => {
    expect(parseEditedMetaScalar(10, 'ten')).toEqual({ ok: false, error: 'Enter a valid number' });
    expect(parseEditedMetaScalar(false, 'yes')).toEqual({ ok: false, error: 'Enter true or false' });
  });

  it('classifies only strings numbers and booleans as editable items', () => {
    expect(['open', 1, false, { label: 'fixed' }, [1, 2], null].map(isEditableMetaScalar))
      .toEqual([true, true, true, false, false, false]);
  });

  it('disables text batch for array and object values', () => {
    expect(metaValuesSupportTextBatch([undefined, 'x', 1, false])).toBe(true);
    expect(metaValuesSupportTextBatch(['x', [1, 2]])).toBe(false);
    expect(metaValuesSupportTextBatch(['x', { label: 'fixed' }])).toBe(false);
  });
});
