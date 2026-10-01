import { describe, expect, it } from 'vitest';
import { lineageDirectionsForEntity } from '../../../webview-ui/lineage-menu';

describe('lineageDirectionsForEntity', () => {
  it('offers only downstream lineage for a source', () => {
    expect(lineageDirectionsForEntity('source')).toEqual(['downstream']);
  });

  it('preserves both lineage directions for model cards', () => {
    expect(lineageDirectionsForEntity('model')).toEqual(['upstream', 'downstream']);
    expect(lineageDirectionsForEntity('external')).toEqual(['upstream', 'downstream']);
  });
});
