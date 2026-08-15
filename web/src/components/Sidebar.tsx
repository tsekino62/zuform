import type { DragEvent } from 'react';
import { REGISTRY } from '@zuform/core/registry';
import { ICONS } from '../icons.ts';

const CATEGORY_ORDER = [
  'ネットワーク',
  'コンピューティング',
  'アプリ統合',
  'データベース',
  'ストレージ',
];

export function Sidebar() {
  const onDragStart = (event: DragEvent<HTMLDivElement>, type: string) => {
    event.dataTransfer.setData('application/zuform', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__intro">
        アイコンをキャンバスへ<strong>ドラッグ&ドロップ</strong>して配置し、
        アイコンの端の丸から<strong>矢印でつなぐ</strong>と、右側にTerraformコードが生成されます。
      </div>
      {CATEGORY_ORDER.map((category) => (
        <section key={category} className="sidebar__group">
          <h2 className="sidebar__category">{category}</h2>
          {REGISTRY.filter((s) => s.category === category).map((s) => (
            <div
              key={s.type}
              className={`palette-item${s.isGroup ? ' palette-item--group' : ''}`}
              draggable
              onDragStart={(e) => onDragStart(e, s.type)}
              title={`${s.displayName}: ${s.description}`}
            >
              <img src={ICONS[s.type]} alt="" className="palette-item__icon" draggable={false} />
              <div className="palette-item__text">
                <span className="palette-item__name">{s.displayName}</span>
                <span className="palette-item__desc">{s.description}</span>
              </div>
            </div>
          ))}
        </section>
      ))}
      <div className="sidebar__footer">アイコン: AWS公式 Architecture Icons</div>
    </aside>
  );
}
