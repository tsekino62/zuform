import { useState } from 'react';
import { TEMPLATES, USE_CASES, type DiagramTemplate } from '../flow/templates.ts';
import { ICONS } from '../aws/icons.ts';

interface Props {
  onSelect: (template: DiagramTemplate) => void;
  onClose: () => void;
}

export function TemplateGallery({ onSelect, onClose }: Props) {
  const [useCase, setUseCase] = useState<string | null>(null);
  const shown = useCase ? TEMPLATES.filter((t) => t.useCase === useCase) : TEMPLATES;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>テンプレートから始める</h2>
          <button type="button" className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="gallery__filters">
          <button
            type="button"
            className={`filter-chip${useCase === null ? ' is-active' : ''}`}
            onClick={() => setUseCase(null)}
          >
            すべて
          </button>
          {USE_CASES.map((uc) => (
            <button
              type="button"
              key={uc}
              className={`filter-chip${useCase === uc ? ' is-active' : ''}`}
              onClick={() => setUseCase(uc)}
            >
              {uc}
            </button>
          ))}
        </div>

        <div className="gallery__grid">
          {shown.map((t) => (
            <button type="button" key={t.id} className="template-card" onClick={() => onSelect(t)}>
              <div className="template-card__head">
                <span className={`level-badge level-badge--${t.level === '入門' ? 'easy' : 'mid'}`}>
                  {t.level}
                </span>
                <span className="template-card__usecase">{t.useCase}</span>
              </div>
              <h3>{t.title}</h3>
              <div className="template-card__icons">
                {t.services.map((s) => (
                  <img key={s} src={ICONS[s]} alt="" />
                ))}
              </div>
              <p>{t.description}</p>
              <span className="template-card__cta">この構成を使う →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
