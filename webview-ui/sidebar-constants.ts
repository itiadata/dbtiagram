/**
 * Sidebar geometry (spec 11): the default/starting width and the drag clamps
 * for both the filter and the details sidebar. The collapsed state is a slim
 * rail (see `.rail` in styles.css), not a width change.
 */
export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 480;

export const clampSidebarWidth = (width: number): number =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
