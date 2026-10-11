// アイテム図鑑
import { ERAS } from '../../data/eras.js';
import { LEVELS } from '../../data/levels.js';
import { getState, hasItem, stageId } from '../state.js';
import { loadLevel } from '../content.js';
import { r, openModal } from '../ui.js';
import { sfx } from '../audio.js';

export async function render(root) {
  const datas = await Promise.all(LEVELS.map((l) => loadLevel(l.lv).catch(() => ({}))));
  const total = LEVELS.length * ERAS.length;
  const owned = getState().items.length;

  const sections = LEVELS.map((l, li) => {
    const cells = ERAS.map((era) => {
      const id = stageId(l.lv, era.id);
      const item = datas[li]?.[era.id]?.item;
      const got = item && hasItem(id);
      return `<button class="zk-cell ${got ? 'got' : ''}" data-lv="${l.lv}" data-era="${era.id}" style="--c:${era.color}" data-testid="zk-${id}">
          <span class="zk-emoji">${got ? item.emoji : '❓'}</span>
          <span class="zk-era">${r(era.short)}</span>
        </button>`;
    }).join('');
    return `<section class="zk-level">
        <h3 style="--c:${l.color}">Lv${l.lv} ${r(l.title)}</h3>
        <div class="zk-grid">${cells}</div>
      </section>`;
  }).join('');

  root.innerHTML = `
    <div class="screen zukan">
      <header class="bar-head">
        <a class="back" href="#/home" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">🎁 アイテム${r('{図鑑|ずかん}')}</div>
          <div class="bh-sub">${owned}/${total}　コンプリートまで あと${total - owned}こ</div>
        </div>
      </header>
      <div class="bar wide"><i style="width:${(owned / total) * 100}%"></i></div>
      ${sections}
    </div>`;

  root.querySelectorAll('.zk-cell').forEach((c) => {
    c.addEventListener('click', () => {
      const lv = Number(c.dataset.lv);
      const era = ERAS.find((e) => e.id === c.dataset.era);
      const item = datas[lv - 1]?.[era.id]?.item;
      if (!item || !hasItem(stageId(lv, era.id))) {
        sfx('wrong');
        openModal(`<p class="center">❓ ${r(`レベル${lv}の${era.name}をクリアすると {手|て}に{入|はい}るよ！`)}</p><button class="btn" data-close>OK</button>`);
        return;
      }
      sfx('item');
      openModal(`
        <div class="item-card big" style="--c:${era.color}">
          <div class="ic-era">${r(era.name)}</div>
          <div class="ic-emoji">${item.emoji}</div>
          <div class="ic-name">${r(item.name)}</div>
          <div class="ic-desc">${r(item.desc)}</div>
        </div>
        <button class="btn" data-close>とじる</button>`);
    });
  });
}
