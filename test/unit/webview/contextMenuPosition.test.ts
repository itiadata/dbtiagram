import { describe, it, expect } from 'vitest';
import { placeMenu } from '../../../webview-ui/context-menu-position';

const MENU = { width: 200, height: 120 };
const VIEWPORT = { width: 800, height: 600 };

describe('placeMenu', () => {
  it('places the menu at the point when it fits', () => {
    expect(placeMenu({ x: 10, y: 10 }, MENU, VIEWPORT)).toEqual({ left: 10, top: 10 });
  });

  it('flips horizontally near the right edge', () => {
    expect(placeMenu({ x: 700, y: 10 }, MENU, VIEWPORT)).toEqual({ left: 500, top: 10 });
  });

  it('flips vertically near the bottom edge', () => {
    expect(placeMenu({ x: 10, y: 550 }, MENU, VIEWPORT)).toEqual({ left: 10, top: 430 });
  });

  it('clamps to the margin when the menu cannot fit', () => {
    expect(placeMenu({ x: 5, y: 5 }, MENU, { width: 100, height: 100 })).toEqual({
      left: 4,
      top: 4,
    });
  });
});
