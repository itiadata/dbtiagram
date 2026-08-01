/**
 * Custom React Flow edge that draws the FK line along the polyline computed by
 * the pure router in `src/diagram/routing.ts` (spec 12), instead of letting
 * React Flow pick a `smoothstep` path that knows nothing about the other
 * cards.
 *
 * The endpoints always come from React Flow's own `sourceX/Y` and `targetX/Y`
 * (the mounted handle positions, including the shared-side ±5px dot offset of
 * spec 09); only the interior waypoints come from `data.points`. When no route
 * is present — the transient render where a node rect is still missing — the
 * edge degrades to a straight line so nothing ever disappears.
 *
 * `BaseEdge` renders the standard `.react-flow__edge-path` plus the invisible
 * `interactionWidth` hit band, so the hover class, `animated` and the dashed
 * virtual stroke from `styles.css` all keep working unchanged.
 */
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { EDGE_INTERACTION_WIDTH, type FlowEdge } from '../src/diagram/flow';
import type { Point } from '../src/diagram/routing';

/** Corner radius (px), clamped to half of the shorter adjacent segment. */
const CORNER_RADIUS = 8;

export function FkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  interactionWidth,
}: EdgeProps<FlowEdge>): JSX.Element {
  const routed = data?.points ?? [];
  // Replace the router's anchors with React Flow's live handle coordinates:
  // the interior waypoints are what the router contributes.
  const points: Point[] = [
    { x: sourceX, y: sourceY },
    ...routed.slice(1, -1),
    { x: targetX, y: targetY },
  ];
  return (
    <BaseEdge
      path={roundedPath(points)}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth ?? EDGE_INTERACTION_WIDTH}
    />
  );
}

/**
 * SVG path through `points` with rounded corners. Works for any polyline (the
 * corners are cut along the incoming/outgoing unit vectors), so a first or
 * last segment that is slightly off-axis — the shared-side dot offset — is
 * drawn just as cleanly as a purely orthogonal one.
 */
export function roundedPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLength = distance(previous, corner);
    const outLength = distance(corner, next);
    const radius = Math.min(CORNER_RADIUS, inLength / 2, outLength / 2);
    if (radius <= 0) continue;
    const start = towards(corner, previous, radius);
    const end = towards(corner, next, radius);
    path += ` L ${start.x},${start.y} Q ${corner.x},${corner.y} ${end.x},${end.y}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x},${last.y}`;
  return path;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point `length` px from `from` in the direction of `to`. */
function towards(from: Point, to: Point, length: number): Point {
  const total = distance(from, to);
  if (total === 0) return { ...from };
  return {
    x: from.x + ((to.x - from.x) / total) * length,
    y: from.y + ((to.y - from.y) / total) * length,
  };
}
