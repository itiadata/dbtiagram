import type { GroupRect } from '../src/diagram/layoutGroups';

export function groupLabelOffset(
  box: GroupRect,
  viewport: GroupRect,
  label: { width: number; height: number },
): { x: number; y: number } {
  const intersectionLeft = Math.max(box.x, viewport.x);
  const intersectionTop = Math.max(box.y, viewport.y);
  const intersectionRight = Math.min(box.x + box.width, viewport.x + viewport.width);
  const intersectionBottom = Math.min(box.y + box.height, viewport.y + viewport.height);
  if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(intersectionLeft - box.x, box.width - label.width)),
    y: Math.max(0, Math.min(intersectionTop - box.y, box.height - label.height)),
  };
}
