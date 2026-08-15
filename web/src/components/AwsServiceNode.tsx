import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { AwsNodeData } from '@zuform/core/types';
import { ENV_IDS } from '@zuform/core/types';
import { ICONS } from '../icons.ts';

export function AwsServiceNode({ data, selected }: NodeProps<Node<AwsNodeData>>) {
  const restricted = data.envs && data.envs.length < ENV_IDS.length;
  return (
    <div className={`aws-node${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="aws-handle aws-handle--target" />
      <img src={ICONS[data.serviceType]} alt="" className="aws-node__icon" draggable={false} />
      <div className="aws-node__label">{data.label}</div>
      {restricted && (
        <div className="aws-node__envs">
          {data.envs!.map((e) => (
            <span key={e} className={`env-chip env-chip--${e}`}>
              {e.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="aws-handle aws-handle--source" />
    </div>
  );
}
