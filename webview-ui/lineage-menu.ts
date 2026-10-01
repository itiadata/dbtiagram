import type { DiagramEntityKind } from '../src/shared/entityId';

export type LineageDirection = 'upstream' | 'downstream';

const MODEL_DIRECTIONS = ['upstream', 'downstream'] as const;
const SOURCE_DIRECTIONS = ['downstream'] as const;

export function lineageDirectionsForEntity(
  kind: DiagramEntityKind,
): readonly LineageDirection[] {
  return kind === 'source' ? SOURCE_DIRECTIONS : MODEL_DIRECTIONS;
}
