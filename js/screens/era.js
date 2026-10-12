// 時代べつまとめ：1つの時代を、レベル1〜6の解説と問題でまとめて学ぶ。
// レベルの進みぐあいとは別あつかい（ここで遊んでもステージのクリアやアイテムは変わらない）。
import { ERAS, getEra } from '../../data/eras.js';
import { LEVELS } from '../../data/levels.js';
import { getStage, getEraRecord, eraLevelProgress } from '../state.js';
import { loadLevel } from '../content.js';
import { r, go, stars } from '../ui.js';

export const ERA_BATTLE_PER_LEVEL = 2;

export async function render(root, { era: eraId }) {
  if (!eraId) return renderList(root);
  const era = getEra(eraId);
  if (!era) {
    go('#/eras');
    return;
  }
  return renderDetail(root, era);
}

function renderList(root) {
  const cards = ERAS.map((era) => {
    const rec = getEraRecord(era.id);
    const prog = eraLevelProgress(era.id);
    return `
      <a class="era-card" href="#/era/${era.id}" style="--c:${era.color}" data-testid="era-card-${era.id}">
        <span class="ec-icon">${era.icon}</span>
        <span class="ec-name">${r(era.short)}</span>
        <span class="ec-years">${era.years}</span>
        <span class="ec-prog">Lv ${prog}/${LEVELS.length}</span>
        ${rec.stars ? stars(rec.stars) : ''}
      </a>`;
  }).join('');

  root.innerHTML = `
    <div class="screen era-list">
      <header class="bar-head">
        <a class="back" href="#/home" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">📚 ${r('{時代|じだい}べつ まとめ')}</div>
          <div class="bh-sub">${r('1つの{時代|じだい}を、レベル1〜6でまとめて{学|まな}ぼう')}</div>
        </div>
      </header>
      <p class="level-desc">${r('レベルの{進|すす}みぐあいはそのまま。ここで{遊|あそ}んでも、レベルのきろくは{変|か}わらないよ。')}</p>
      <div class="era-grid">${cards}</div>
    </div>`;
}

async function renderDetail(root, era) {
  const datas = await Promise.all(LEVELS.map((l) => loadLevel(l.lv).catch(() => null)));
  const rec = getEraRecord(era.id);

  const rows = LEVELS.map((l, i) => {
    const c = datas[i]?.[era.id];
    const cleared = getStage(l.lv, era.id).cleared;
    return `
      <div class="era-lv-row" style="--c:${l.color}">
        <div class="elr-badge">Lv${l.lv}</div>
        <div class="elr-body">
          <div class="elr-theme">${l.icon} ${r(l.title)}</div>
          <div class="elr-title">${c ? r(c.title) : r('よみこめなかったよ')}</div>
        </div>
        ${cleared ? '<span class="elr-done" title="クリアずみ">✅</span>' : ''}
        <a class="btn small elr-play ${c ? '' : 'disabled'}" href="${c ? `#/eravideo/${era.id}/${l.lv}` : `#/era/${era.id}`}" data-testid="era-video-${l.lv}">📺 ${r('{見|み}る')}</a>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="screen era-detail" style="--c:${era.color}">
      <header class="bar-head">
        <a class="back" href="#/eras" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">${era.icon} ${r(era.name)}</div>
          <div class="bh-sub">${era.years}　${r('まとめ')}</div>
        </div>
      </header>
      <section class="card era-actions">
        <a class="btn big" href="#/eravideo/${era.id}/all" data-testid="era-video-all">📺 ${r('ぜんぶまとめて{見|み}る')}<small>${r('レベル1〜6を つづけて{再生|さいせい}')}</small></a>
        <a class="btn big battle" href="#/erabattle/${era.id}" data-testid="era-battle">⚔️ まとめバトル（${LEVELS.length * ERA_BATTLE_PER_LEVEL}${r('{問|もん}')}）</a>
        <p class="ea-best">${rec.plays ? `ベスト ${stars(rec.stars)}　（${rec.plays}${r('{回|かい}')}クリア）` : r('まとめバトルは、レベル1〜6の{問題|もんだい}から{出|で}るよ')}</p>
      </section>
      <h3 class="era-sec">${r('レベルごとの{解説|かいせつ}')}</h3>
      <div class="era-lv-list">${rows}</div>
    </div>`;
}
