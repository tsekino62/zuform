import type { AwsNode, EnvId } from '@zuform/core/types';
import { ENV_IDS } from '@zuform/core/types';
import { MODULES } from '@zuform/core/registry';
import { ICONS } from '../icons.ts';

interface Props {
  node: AwsNode;
  onRename: (id: string, label: string) => void;
  onChangeEnvs: (id: string, envs: EnvId[] | undefined) => void;
  onChangeExtraHcl: (id: string, extraHcl: string | undefined) => void;
  onDelete: (id: string) => void;
}

export function InspectorPanel({
  node,
  onRename,
  onChangeEnvs,
  onChangeExtraHcl,
  onDelete,
}: Props) {
  const def = MODULES[node.data.serviceType];
  const current: EnvId[] = node.data.envs ?? [...ENV_IDS];

  const toggleEnv = (env: EnvId) => {
    const next = current.includes(env)
      ? current.filter((e) => e !== env)
      : [...ENV_IDS.filter((e) => current.includes(e) || e === env)];
    if (next.length === 0) return; // 少なくとも1環境には含める
    onChangeEnvs(node.id, next.length === ENV_IDS.length ? undefined : next);
  };

  return (
    <div className="inspector">
      <div className="inspector__type">
        <img src={ICONS[node.data.serviceType]} alt="" />
        <span>{def.displayName}</span>
      </div>
      <label className="inspector__field">
        <span>名前（リソース名に使われます）</span>
        <input
          value={node.data.label}
          onChange={(e) => onRename(node.id, e.target.value)}
          placeholder="例: user-api"
        />
      </label>
      <div className="inspector__field">
        <span>作成する環境</span>
        <div className="inspector__envs">
          {ENV_IDS.map((env) => (
            <label key={env} className={`env-toggle${current.includes(env) ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={current.includes(env)}
                onChange={() => toggleEnv(env)}
              />
              {env.toUpperCase()}
            </label>
          ))}
        </div>
      </div>
      <label className="inspector__field">
        <span>追加HCL（上級者向け）</span>
        <textarea
          className="inspector__hcl"
          value={node.data.extraHcl ?? ''}
          onChange={(e) =>
            onChangeExtraHcl(node.id, e.target.value === '' ? undefined : e.target.value)
          }
          placeholder="memory_size = 512"
        />
        <small>このリソースのブロック末尾にそのまま挿入されます</small>
      </label>
      <button type="button" className="btn btn--danger" onClick={() => onDelete(node.id)}>
        削除（Deleteキーでも可）
      </button>
    </div>
  );
}
