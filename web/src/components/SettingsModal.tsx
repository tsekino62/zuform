import type { NamingConfig } from '@zuform/core/types';
import { applyNamingPattern, toKebabName } from '@zuform/core/generator';

interface Props {
  naming: NamingConfig;
  onChange: (naming: NamingConfig) => void;
  onClose: () => void;
}

export function SettingsModal({ naming, onChange, onClose }: Props) {
  const preview = applyNamingPattern(naming.pattern, {
    project: toKebabName(naming.project) || 'myapp',
    env: 'dev',
    name: 'user-api',
  });
  const patternValid = naming.pattern.includes('{name}');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>設定</h2>
          <button type="button" className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="inspector__field">
          <span>プロジェクト名（{'{project}'} に入ります）</span>
          <input
            value={naming.project}
            onChange={(e) => onChange({ ...naming, project: e.target.value })}
            placeholder="例: myapp"
          />
        </label>

        <label className="inspector__field">
          <span>命名規則パターン（使えるトークン: {'{project} {env} {name}'}）</span>
          <input
            value={naming.pattern}
            onChange={(e) => onChange({ ...naming, pattern: e.target.value })}
            placeholder="{project}-{env}-{name}"
          />
        </label>
        {!patternValid && (
          <p className="modal__error">パターンには {'{name}'} を含めてください</p>
        )}
        <p className="modal__preview">
          プレビュー: <code>{preview}</code>
          <span className="modal__preview-note">（DEV環境・名前 user-api の場合）</span>
        </p>

        <label className="modal__check">
          <input
            type="checkbox"
            checked={naming.commonTags}
            onChange={(e) => onChange({ ...naming, commonTags: e.target.checked })}
          />
          全リソースに共通タグを付与（Project / Environment / ManagedBy）
        </label>

        <p className="modal__note">
          設定は生成されるTerraformコードの物理リソース名とタグに反映されます。
          図と一緒にJSONへ保存されます。
        </p>
      </div>
    </div>
  );
}
