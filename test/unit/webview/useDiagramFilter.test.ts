import { describe, expect, it } from 'vitest';
import { filterSelectionForLayout } from '../../../webview-ui/hooks/useDiagramFilter';

describe('filterSelectionForLayout', () => {
  it('saved layout selection clears an initial cap notice', () => {
    const ids = Array.from({ length: 22 }, (_, index) => `model:sample:model_${index}`);

    expect(filterSelectionForLayout(ids)).toEqual({
      selectedEntitiesByDomain: {
        model: new Set(ids),
        source: new Set(),
      },
      initialCapNotice: null,
    });
  });
});
