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

/** A parent item's rect, used to anchor a submenu flyout beside it. */
export interface SubmenuAnchor {
  left: number;
  right: number;
  top: number;
}

/**
 * Places a submenu flyout to the right of its parent item, flipping to the
 * item's left edge when it would overflow the right edge of the viewport
 * (spec 24) — the same flip/clamp idea as `placeMenu`, but anchored to the
 * PARENT ITEM's left/right edges rather than a single point, so a flip never
 * makes the flyout overlap its own parent.
 */
export function placeSubmenu(
  anchor: SubmenuAnchor,
  menu: MenuBox,
  viewport: MenuBox,
  margin = 4,
): MenuPlacement {
  let left = anchor.right;
  if (left + menu.width > viewport.width - margin) {
    left = anchor.left - menu.width;
  }

  let top = anchor.top;
  if (top + menu.height > viewport.height - margin) {
    top = viewport.height - margin - menu.height;
  }

  return { left: Math.max(left, margin), top: Math.max(top, margin) };
}
