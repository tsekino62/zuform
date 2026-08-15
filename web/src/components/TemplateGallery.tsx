import { useState } from 'react';
import { TEMPLATES, USE_CASES, type DiagramTemplate } from '@zuform/core/templates';
import { ICONS } from '../icons.ts';
import {
  LEVEL_EASY,
  levelLabel,
  templateDescription,
  templateTitle,
  useCaseLabel,
  useLang,
} from '../i18n.ts';

interface Props {
  onSelect: (template: DiagramTemplate) => void;
  onClose: () => void;
}

export function TemplateGallery({ onSelect, onClose }: Props) {
  const { lang, t } = useLang();
  const [useCase, setUseCase] = useState<string | null>(null);
  const shown = useCase ? TEMPLATES.filter((tpl) => tpl.useCase === useCase) : TEMPLATES;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>{t('gallery.title')}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <div className="gallery__filters">
          <button
            type="button"
            className={`filter-chip${useCase === null ? ' is-active' : ''}`}
            onClick={() => setUseCase(null)}
          >
            {t('gallery.filterAll')}
          </button>
          {USE_CASES.map((uc) => (
            <button
              type="button"
              key={uc}
              className={`filter-chip${useCase === uc ? ' is-active' : ''}`}
              onClick={() => setUseCase(uc)}
            >
              {useCaseLabel(lang, uc)}
            </button>
          ))}
        </div>

        <div className="gallery__grid">
          {shown.map((tpl) => (
            <button
              type="button"
              key={tpl.id}
              className="template-card"
              onClick={() => onSelect(tpl)}
            >
              <div className="template-card__head">
                <span
                  className={`level-badge level-badge--${tpl.level === LEVEL_EASY ? 'easy' : 'mid'}`}
                >
                  {levelLabel(lang, tpl.level)}
                </span>
                <span className="template-card__usecase">{useCaseLabel(lang, tpl.useCase)}</span>
              </div>
              <h3>{templateTitle(lang, tpl.id, tpl.title)}</h3>
              <div className="template-card__icons">
                {tpl.services.map((s) => (
                  <img key={s} src={ICONS[s]} alt="" />
                ))}
              </div>
              <p>{templateDescription(lang, tpl.id, tpl.description)}</p>
              <span className="template-card__cta">{t('gallery.cta')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
