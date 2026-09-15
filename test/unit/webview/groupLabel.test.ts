import { describe, expect, it } from 'vitest';
import { groupLabelOffset } from '../../../webview-ui/group-label';

describe('groupLabelOffset', () => {
  it('keeps a fully visible label at group top-left', () => {
    expect(groupLabelOffset({ x: 0, y: 0, width: 400, height: 300 }, { x: -100, y: -100, width: 1000, height: 1000 }, { width: 80, height: 20 }))
      .toEqual({ x: 0, y: 0 });
  });

  it('moves the label into the visible intersection', () => {
    expect(groupLabelOffset({ x: 0, y: 0, width: 400, height: 300 }, { x: 380, y: 290, width: 1000, height: 1000 }, { width: 80, height: 20 }))
      .toEqual({ x: 320, y: 280 });
  });
});
