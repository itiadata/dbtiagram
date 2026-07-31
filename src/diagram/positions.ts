/**
 * Pure position-preservation logic for the webview diagram. MUST NOT import
 * `vscode`.
 *
 * Live diagram updates (spec 04) must not snap manually dragged tables back to
 * their automatic layout. React Flow's own node state is the source of truth
 * for positions; `mergeFlowNodes` maps a freshly laid-out node list onto the
 * current node list, keeping existing positions and giving only brand-new ids
 * an automatic slot. New nodes keep their dagre slot when it is free and are
 * nudged downward until they no longer overlap an already-placed table.
 */
import type { Node } from '@xyflow/react';
import { HEADER_HEIGHT, NODE_WIDTH } from './layout';

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeRect extends NodePosition {
  width: number;
  height: number;
}

/** Extra breathing room used when deciding whether two cards overlap. */
export const OVERLAP_PADDING = 12;
/** Vertical step used to nudge a new card below existing ones. */
export const OVERLAP_STEP_Y = 8;
/** Safety bound for the nudge loop; always terminates well before this. */
const MAX_NUDGE_STEPS = 100_000;

/** True when two rectangles overlap, allowing a small breathing margin. */
export function rectsOverlap(a: NodeRect, b: NodeRect, padding = OVERLAP_PADDING): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

/**
 * Returns the first position at or below `position.y` (stepping by
 * `OVERLAP_STEP_Y`) whose rectangle of `width` x `height` does not overlap any
 * rect in `occupied`. X is never changed.
 */
export function avoidOverlap(
  position: NodePosition,
  width: number,
  height: number,
  occupied: readonly NodeRect[],
): NodePosition {
  for (let step = 0; step < MAX_NUDGE_STEPS; step += 1) {
    const y = position.y + step * OVERLAP_STEP_Y;
    const rect: NodeRect = { x: position.x, y, width, height };
    if (!occupied.some((other) => rectsOverlap(rect, other))) {
      return { x: position.x, y };
    }
  }
  return { x: position.x, y: position.y + MAX_NUDGE_STEPS * OVERLAP_STEP_Y };
}

/**
 * Maps freshly laid-out flow nodes onto the current node list:
 *
 * - ids present in `current` keep their current `position` (manual drags and
 *   previous layout survive) and their `selected` flag, but adopt the fresh
 *   `data`/`width`/`height` from the flow node;
 * - brand-new ids take the flow (dagre) position, nudged by `avoidOverlap`
 *   against every already-kept card;
 * - ids that disappeared from the flow are dropped.
 */
export function mergeFlowNodes(flowNodes: readonly Node[], current: readonly Node[]): Node[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  const occupied: NodeRect[] = [];
  const merged: Node[] = [];

  for (const node of flowNodes) {
    const width = node.width ?? NODE_WIDTH;
    const height = node.height ?? HEADER_HEIGHT;
    const existing = currentById.get(node.id);

    if (existing !== undefined) {
      const position = { x: existing.position.x, y: existing.position.y };
      occupied.push({ ...position, width, height });
      merged.push({
        ...node,
        position,
        selected: existing.selected ?? node.selected,
      });
      continue;
    }

    const position = avoidOverlap(node.position, width, height, occupied);
    occupied.push({ ...position, width, height });
    merged.push({ ...node, position });
  }

  return merged;
}
