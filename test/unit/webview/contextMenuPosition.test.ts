import { describe, it, expect } from 'vitest';
import { placeMenu, placeSubmenu } from '../../../webview-ui/context-menu-position';

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

describe('placeSubmenu (spec 24)', () => {
  it('opens to the right of the parent item by default', () => {
    const placement = placeSubmenu(
      { left: 100, right: 200, top: 50 },
      { width: 150, height: 80 },
      VIEWPORT,
    );
    expect(placement).toEqual({ left: 200, top: 50 });
  });

  it('flips to the parent item left edge when it would overflow the right edge', () => {
    const placement = placeSubmenu(
      { left: 700, right: 780, top: 50 },
      { width: 150, height: 80 },
      VIEWPORT,
    );
    expect(placement.left).toBe(700 - 150);
  });

  it('clamps to the bottom of the viewport when it would overflow', () => {
    const placement = placeSubmenu(
      { left: 100, right: 200, top: 550 },
      { width: 150, height: 80 },
      VIEWPORT,
    );
    expect(placement.top).toBe(600 - 4 - 80);
  });
});
