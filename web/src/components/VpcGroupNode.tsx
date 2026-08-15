import { NodeResizer } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { AwsNodeData } from '@zuform/core/types';
import { ENV_IDS } from '@zuform/core/types';
import { ICONS } from '../icons.ts';

export function VpcGroupNode({ data, selected }: NodeProps<Node<AwsNodeData>>) {
  const restricted = data.envs && data.envs.length < ENV_IDS.length;
  return (
    <div className={`vpc-node${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={200}
        lineClassName="vpc-resize-line"
        handleClassName="vpc-resize-handle"
      />
      <div className="vpc-node__tab">
        <img src={ICONS.vpc} alt="" draggable={false} />
        <span>{data.label}</span>
        {restricted &&
          data.envs!.map((e) => (
            <span key={e} className={`env-chip env-chip--${e}`}>
              {e.toUpperCase()}
            </span>
          ))}
      </div>
      <div className="vpc-node__hint">この枠の中にリソースをドラッグ</div>
    </div>
  );
}
