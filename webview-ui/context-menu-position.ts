/**
 * Pure viewport-flip/clamp geometry for the context menu (spec 15). No React,
 * no DOM — so the edge behavior is unit-testable.
 */
export interface MenuBox {
  width: number;
  height: number;
}

export interface MenuPoint {
  x: number;
  y: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
}

/**
 * Places a menu at `point`, flipping it back across the point when it would
 * overflow the right/bottom edge, and finally clamping to `margin` so a menu
 * larger than the viewport still starts on screen.
 */
export function placeMenu(
  point: MenuPoint,
  menu: MenuBox,
  viewport: MenuBox,
  margin = 4,
): MenuPlacement {
  let left = point.x;
  if (left + menu.width > viewport.width - margin) {
    left = point.x - menu.width;
  }

  let top = point.y;
  if (top + menu.height > viewport.height - margin) {
    top = point.y - menu.height;
  }

  return { left: Math.max(left, margin), top: Math.max(top, margin) };
}
