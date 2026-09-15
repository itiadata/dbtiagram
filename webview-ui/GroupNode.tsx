import { useLayoutEffect, useRef, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { GroupNodeData } from './hooks/useGroups';
import { groupLabelOffset } from './group-label';

export function GroupNode({ data, width, height }: NodeProps<Node<GroupNodeData, 'group'>>): JSX.Element {
  const labelRef = useRef<HTMLDivElement | null>(null);
  const [labelSize, setLabelSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const rect = labelRef.current?.getBoundingClientRect();
    if (rect !== undefined) setLabelSize({ width: rect.width / data.zoom, height: rect.height / data.zoom });
  }, [data.group.name, data.zoom]);
  const offset = groupLabelOffset(
    {
      x: 0,
      y: 0,
      width: width ?? 0,
      height: height ?? 0,
    },
    data.viewport,
    labelSize,
  );
  return (
    <div className={`group group--${data.group.color}`}>
      <div ref={labelRef} className="group__label" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        {data.group.name}
      </div>
    </div>
  );
}
