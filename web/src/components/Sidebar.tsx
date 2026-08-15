import type { DragEvent } from 'react';
import { REGISTRY } from '@zuform/core/registry';
import { ICONS } from '../icons.ts';
import { CATEGORY_ORDER, categoryLabel, serviceDescription, useLang } from '../i18n.ts';

export function Sidebar() {
  const { lang, t } = useLang();

  const onDragStart = (event: DragEvent<HTMLDivElement>, type: string) => {
    event.dataTransfer.setData('application/zuform', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__intro">
        {t('sidebar.introLead')}
        <strong>{t('sidebar.introDragDrop')}</strong>
        {t('sidebar.introMiddle')}
        <strong>{t('sidebar.introConnect')}</strong>
        {t('sidebar.introTail')}
      </div>
      {CATEGORY_ORDER.map((category) => (
        <section key={category} className="sidebar__group">
          <h2 className="sidebar__category">{categoryLabel(lang, category)}</h2>
          {REGISTRY.filter((s) => s.category === category).map((s) => {
            const description = serviceDescription(lang, s.type, s.description);
            return (
              <div
                key={s.type}
                className={`palette-item${s.isGroup ? ' palette-item--group' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, s.type)}
                title={`${s.displayName}: ${description}`}
              >
                <img src={ICONS[s.type]} alt="" className="palette-item__icon" draggable={false} />
                <div className="palette-item__text">
                  <span className="palette-item__name">{s.displayName}</span>
                  <span className="palette-item__desc">{description}</span>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <div className="sidebar__footer">{t('sidebar.footer')}</div>
    </aside>
  );
}
