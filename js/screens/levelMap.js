import { ERAS } from '../../data/eras.js';
import { getLevel } from '../../data/levels.js';
import { getStage, isStageUnlocked, isLevelUnlocked, levelProgress } from '../state.js';
import { r, openModal, go, stars } from '../ui.js';
import { sfx } from '../audio.js';
import { getStageContent } from '../content.js';

export async function render(root, { lv }) {
  const level = getLevel(lv);
  if (!level || !isLevelUnlocked(lv)) {
    go('#/home');
    return;
  }

  const nodes = ERAS.map((era, i) => {
    const st = getStage(lv, era.id);
    const unlocked = isStageUnlocked(lv, era.id);
    const side = i % 2 === 0 ? 'left' : 'right';
    return `
      <button class="era-node ${side} ${unlocked ? '' : 'locked'} ${st.cleared ? 'cleared' : ''}"
        style="--c:${era.color}" data-era="${era.id}" data-testid="era-${era.id}">
        <span class="en-icon">${unlocked ? era.icon : '🔒'}</span>
        <span class="en-body">
          <span class="en-name">${r(era.name)}</span>
          <span class="en-years">${era.years}</span>
          ${st.cleared ? stars(st.stars) : unlocked ? '<span class="en-new">NEW!</span>' : ''}
        </span>
      </button>`;
  }).join('<div class="path-dot"></div>');

  root.innerHTML = `
    <div class="screen level-map" style="--c:${level.color}">
      <header class="bar-head">
        <a class="back" href="#/home" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">レベル${lv}　${r(level.title)}</div>
          <div class="bh-sub">${levelProgress(lv)}/14 クリア</div>
        </div>
      </header>
      <p class="level-desc">${level.icon} ${r(level.desc)}</p>
      <div class="era-path">${nodes}</div>
    </div>`;

  root.querySelectorAll('.era-node').forEach((btn) => {
    btn.addEventListener('click', () => onEra(lv, btn.dataset.era, btn.classList.contains('locked')));
  });

  // いま遊ぶべき時代までスクロール
  const next = root.querySelector('.era-node:not(.locked):not(.cleared)');
  if (next) next.scrollIntoView({ block: 'center' });
}

let opening = false; // 読み込み中の連打でモーダルが重ならないように

async function onEra(lv, eraId, locked) {
  if (opening) return;
  if (locked) {
    sfx('wrong');
    openModal(`<p class="center">🔒 ${r('まえの{時代|じだい}をクリアしてね！')}</p><button class="btn" data-close>OK</button>`);
    return;
  }
  sfx('tap');
  const era = ERAS.find((e) => e.id === eraId);
  const st = getStage(lv, eraId);
  let content;
  opening = true;
  try {
    content = await getStageContent(lv, eraId);
  } catch {
    content = undefined;
  } finally {
    opening = false;
  }
  // 読み込み中に別の画面へ移動した
  if (location.hash !== `#/level/${lv}`) return;
  if (content === undefined) {
    openModal(`<p class="center">${r('よみこめなかったよ🙇 {電波|でんぱ}のよいところで もういちど おしてね')}</p><button class="btn" data-close>OK</button>`);
    return;
  }
  if (!content) {
    openModal(`<p class="center">このステージは じゅんびちゅう だよ🙇</p><button class="btn" data-close>OK</button>`);
    return;
  }
  const { el } = openModal(`
    <div class="stage-modal" style="--c:${era.color}">
      <div class="sm-icon">${era.icon}</div>
      <h2>${r(era.name)}</h2>
      <p class="sm-theme">${r(content.title || '')}</p>
      <div class="sm-boss">ボス：<b>${content.boss.emoji} ${r(content.boss.name)}</b></div>
      <div class="sm-item">ゲットできるアイテム：${st.cleared ? `${content.item.emoji} ${r(content.item.name)}` : '❓'}</div>
      <button class="btn big" data-act="video" data-testid="btn-video">📺 どうがを見る</button>
      <button class="btn big battle ${st.watched ? '' : 'disabled'}" data-act="battle" data-testid="btn-battle">
        ⚔️ バトル！${st.watched ? '' : '<small>（どうがを見るとあそべる）</small>'}
      </button>
      <button class="btn ghost" data-close>とじる</button>
    </div>`);
  el.querySelector('[data-act="video"]').addEventListener('click', () => go(`#/video/${lv}/${eraId}`));
  el.querySelector('[data-act="battle"]').addEventListener('click', () => {
    if (!st.watched) {
      sfx('wrong');
      return;
    }
    go(`#/battle/${lv}/${eraId}`);
  });
}
