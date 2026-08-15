import type { NamingConfig } from '@zuform/core/types';
import { applyNamingPattern, toKebabName } from '@zuform/core/generator';
import { useLang } from '../i18n.ts';

interface Props {
  naming: NamingConfig;
  onChange: (naming: NamingConfig) => void;
  onClose: () => void;
}

export function SettingsModal({ naming, onChange, onClose }: Props) {
  const { t } = useLang();
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
          <h2>{t('settings.title')}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <label className="inspector__field">
          <span>{t('settings.projectLabel')}</span>
          <input
            value={naming.project}
            onChange={(e) => onChange({ ...naming, project: e.target.value })}
            placeholder={t('settings.projectPlaceholder')}
          />
        </label>

        <label className="inspector__field">
          <span>{t('settings.patternLabel')}</span>
          <input
            value={naming.pattern}
            onChange={(e) => onChange({ ...naming, pattern: e.target.value })}
            placeholder="{project}-{env}-{name}"
          />
        </label>
        {!patternValid && <p className="modal__error">{t('settings.patternError')}</p>}
        <p className="modal__preview">
          {t('settings.previewLabel')}
          <code>{preview}</code>
          <span className="modal__preview-note">{t('settings.previewNote')}</span>
        </p>

        <label className="modal__check">
          <input
            type="checkbox"
            checked={naming.commonTags}
            onChange={(e) => onChange({ ...naming, commonTags: e.target.checked })}
          />
          {t('settings.commonTags')}
        </label>

        <p className="modal__note">{t('settings.note')}</p>
      </div>
    </div>
  );
}
