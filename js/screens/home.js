import { LEVELS } from '../../data/levels.js';
import { getEra, ERA_IDS } from '../../data/eras.js';
import {
  getState, getMission, currentStreak, isLevelUnlocked, levelProgress,
  dueReviews, setSetting, resetAll,
} from '../state.js';
import { r, openModal, go } from '../ui.js';
import { sfx } from '../audio.js';

export function render(root) {
  const s = getState();
  const mission = getMission();
  const due = dueReviews();
  const streak = currentStreak();
  const doneCount = mission.filter((m) => m.cleared).length;

  const missionHtml = mission.length
    ? mission.map((m) => {
      const era = getEra(m.era);
      return `<a class="mission-chip ${m.cleared ? 'done' : ''}" href="#/level/${m.lv}" data-testid="mission-${m.id}">
          <span class="mc-icon">${m.cleared ? '✅' : era.icon}</span>
          <span class="mc-text"><small>Lv${m.lv}</small> ${r(era.short)}</span>
        </a>`;
    }).join('')
    : `<p class="all-clear">🎉 ぜんぶクリア！ すごい！</p>`;

  const levelsHtml = LEVELS.map((l) => {
    const unlocked = isLevelUnlocked(l.lv);
    const prog = levelProgress(l.lv);
    return `<a class="level-card ${unlocked ? '' : 'locked'}" style="--c:${l.color}"
        href="${unlocked ? `#/level/${l.lv}` : '#/home'}" data-lv="${l.lv}" data-testid="level-${l.lv}">
        <div class="lc-icon">${unlocked ? l.icon : '🔒'}</div>
        <div class="lc-body">
          <div class="lc-title">レベル${l.lv}　${r(l.title)}</div>
          <div class="lc-desc">${r(l.desc)}</div>
          <div class="bar"><i style="width:${(prog / ERA_IDS.length) * 100}%"></i></div>
        </div>
        <div class="lc-prog">${prog}/${ERA_IDS.length}</div>
      </a>`;
  }).join('');

  root.innerHTML = `
    <div class="screen home">
      <header class="home-head">
        <h1 class="logo">れきし<span>バスターズ</span></h1>
        <p class="sub">${r('{縄文|じょうもん}から{令和|れいわ}まで、{歴史|れきし}の{人物|じんぶつ}をやっつけろ！')}</p>
        <div class="hud">
          <span class="pill" data-testid="streak">🔥 ${streak}日れんぞく</span>
          <span class="pill" data-testid="coins">🪙 ${s.coins}</span>
          <span class="pill">🎁 ${s.items.length}こ</span>
        </div>
      </header>

      <section class="card mission">
        <h2>きょうのミッション <small>${doneCount}/${mission.length}</small></h2>
        <div class="mission-list">${missionHtml}</div>
      </section>

      ${due.length ? `
      <a class="card review-banner" href="#/review" data-testid="review-btn">
        <span class="rb-icon">📦</span>
        <span><b>ふくしゅうボックス</b><br><small>${r(`まえにまちがえた{問題|もんだい}が ${due.length}{問|もん}あるよ`)}</small></span>
        <span class="rb-go">▶</span>
      </a>` : ''}

      <section class="levels">${levelsHtml}</section>

      <nav class="home-nav">
        <a class="btn big era-btn" href="#/eras" data-testid="eras-btn">📚 ${r('{時代|じだい}べつ まとめ')}<small>${r('1つの{時代|じだい}をレベル1〜6でまとめて{学|まな}ぶ')}</small></a>
        <a class="btn big" href="#/zukan" data-testid="zukan-btn">🎁 アイテム${r('{図鑑|ずかん}')}</a>
        <button class="btn ghost" id="settings-btn" data-testid="settings-btn">⚙️ せってい</button>
      </nav>
    </div>`;

  root.querySelectorAll('.level-card.locked').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      sfx('wrong');
      const lv = Number(el.dataset.lv);
      openModal(`<p class="center">🔒 レベル${lv - 1}を ぜんぶクリアすると<br>あそべるようになるよ！</p>
        <button class="btn" data-close>OK</button>`);
    });
  });

  root.querySelector('#settings-btn').addEventListener('click', openSettings);
}

function openSettings() {
  const st = getState().settings;
  const row = (key, label) => `
    <label class="switch-row">
      <span>${label}</span>
      <input type="checkbox" data-key="${key}" ${st[key] ? 'checked' : ''}>
    </label>`;
  const { el, close } = openModal(`
    <h2>⚙️ せってい</h2>
    ${row('sound', '🔊 こうかおん')}
    ${row('voice', '🗣️ よみあげ（どうが）')}
    ${row('timer', '⏱️ じかんせいげん（バトル）')}
    <button class="btn" data-close>とじる</button>
    <button class="btn danger small" id="reset-btn">さいしょからやりなおす</button>
  `);
  el.querySelectorAll('input[data-key]').forEach((inp) => {
    inp.addEventListener('change', () => setSetting(inp.dataset.key, inp.checked));
  });
  el.querySelector('#reset-btn').addEventListener('click', () => {
    if (confirm('ほんとうに さいしょから やりなおしますか？（きろくが きえます）')) {
      resetAll();
      close();
      go('#/home');
    }
  });
}
