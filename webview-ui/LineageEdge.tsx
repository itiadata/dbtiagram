import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';
import type { FlowEdge } from '../src/diagram/flow';

export function LineageEdge(props: EdgeProps<FlowEdge>): JSX.Element {
  const [path] = getStraightPath(props);
  return <BaseEdge path={path} markerEnd={props.markerEnd} interactionWidth={props.interactionWidth} />;
}
