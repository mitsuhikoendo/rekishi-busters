// アニメ紙芝居プレイヤー：場面ごとにイラスト＋字幕＋読み上げを自動再生する
import { getEra } from '../../data/eras.js';
import { getLevel, LEVELS } from '../../data/levels.js';
import { getStage, isStageUnlocked, isLevelUnlocked, markWatched } from '../state.js';
import { getStageContent } from '../content.js';
import { r, go, sleep } from '../ui.js';
import { speak, stopSpeak, sfx } from '../audio.js';
import { rubyPlain } from '../ruby.js';

export async function render(root, params) {
  return params.eraMode ? renderEraMode(root, params) : renderStage(root, params);
}

async function renderStage(root, { lv, era: eraId }) {
  const era = getEra(eraId);
  const level = getLevel(lv);
  if (!era || !level || !isStageUnlocked(lv, eraId)) {
    go(level && isLevelUnlocked(lv) ? `#/level/${lv}` : '#/home');
    return;
  }
  const content = await getStageContent(lv, eraId).catch(() => null);
  if (!content) {
    go(`#/level/${lv}`);
    return;
  }
  return play(root, {
    era,
    scenes: content.video,
    sub: `レベル${lv}：${r(content.title || level.title)}`,
    backHref: `#/level/${lv}`,
    battleHref: `#/battle/${lv}/${eraId}`,
    canSkip: getStage(lv, eraId).watched,
    onFinish: () => markWatched(lv, eraId),
  });
}

// 時代べつまとめ：レベルの解放に関係なく見られる。視聴のきろく（watched）はつけない。
// lv が 'all' なら、レベル1〜6の動画を、レベルの見出しをはさんでつなげて再生する。
async function renderEraMode(root, { era: eraId, lv }) {
  const era = getEra(eraId);
  const lvs = lv === 'all' ? LEVELS.map((l) => l.lv) : [Number(lv)];
  if (!era || lvs.some((n) => !getLevel(n))) {
    go(era ? `#/era/${eraId}` : '#/eras');
    return;
  }
  const scenes = [];
  for (const n of lvs) {
    const content = await getStageContent(n, eraId).catch(() => null);
    if (!content) continue;
    const level = getLevel(n);
    if (lvs.length > 1) {
      scenes.push({ art: level.icon, anim: 'pop', text: `レベル${n}「${level.title}」　${content.title}` });
    }
    scenes.push(...content.video);
  }
  if (!scenes.length) {
    go(`#/era/${eraId}`);
    return;
  }
  return play(root, {
    era,
    scenes,
    sub: lvs.length > 1 ? r('{時代|じだい}べつまとめ：ぜんぶ（Lv1〜6）') : r(`{時代|じだい}べつまとめ：レベル${lvs[0]}`),
    backHref: `#/era/${eraId}`,
    battleHref: `#/erabattle/${eraId}`,
    battleLabel: '⚔️ まとめバトルへ！',
    canSkip: false,
    onFinish: () => {},
  });
}

function play(root, { era, scenes, sub, backHref, battleHref, battleLabel = '⚔️ バトルへ！', canSkip, onFinish }) {
  root.innerHTML = `
    <div class="screen video" style="--c:${era.color}">
      <header class="bar-head">
        <a class="back" href="${backHref}" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">📺 ${r(era.name)}</div>
          <div class="bh-sub">${sub}</div>
        </div>
      </header>
      <div class="stage-frame">
        <div class="scene-art" id="art"></div>
        <div class="scene-caption" id="caption"></div>
        <div class="start-cover" id="cover">
          <button class="btn big" id="start" data-testid="video-start">▶ どうがをはじめる</button>
          ${canSkip ? '<button class="btn ghost" id="skip" data-testid="video-skip">とばしてバトルへ ⏭</button>' : ''}
        </div>
      </div>
      <div class="scene-dots" id="dots">${scenes.map(() => '<i></i>').join('')}</div>
      <div class="controls">
        <button class="ctl" id="prev" aria-label="まえ">⏮</button>
        <button class="ctl" id="play" aria-label="さいせい/ていし">⏸</button>
        <button class="ctl" id="next" aria-label="つぎ">⏭</button>
      </div>
      <div class="video-end hidden" id="end">
        <p>${r('{動画|どうが}おわり！ つぎは バトルだ！')}</p>
        <button class="btn big battle" id="to-battle" data-testid="video-to-battle">${battleLabel}</button>
        <button class="btn ghost" id="replay">🔁 もういちど見る</button>
      </div>
    </div>`;

  const art = root.querySelector('#art');
  const caption = root.querySelector('#caption');
  const dots = [...root.querySelectorAll('#dots i')];
  const playBtn = root.querySelector('#play');
  const endBox = root.querySelector('#end');

  let idx = 0;
  let playing = false;
  let token = 0;
  let destroyed = false;

  function show(i) {
    idx = i;
    const sc = scenes[i];
    art.className = `scene-art anim-${sc.anim || 'pop'}`;
    // アニメーションを毎回はじめから
    void art.offsetWidth;
    art.innerHTML = `${sc.bg ? `<div class="art-bg">${sc.bg}</div>` : ''}<div class="art-main">${sc.art}</div>`;
    caption.innerHTML = `<span>${r(sc.text)}</span>`;
    dots.forEach((d, j) => d.classList.toggle('on', j <= i));
  }

  async function playFrom(i) {
    const my = ++token;
    playing = true;
    playBtn.textContent = '⏸';
    endBox.classList.add('hidden');
    for (let k = i; k < scenes.length; k++) {
      if (my !== token || destroyed) return;
      show(k);
      const text = scenes[k].text;
      const minMs = 1500;
      const started = Date.now();
      const spoke = await speak(text);
      if (my !== token || destroyed) return;
      const elapsed = Date.now() - started;
      // 読み上げなし（または失敗）のときは文字数に合わせて待つ
      const wait = spoke ? Math.max(0, minMs - elapsed) + 250 : Math.max(3000, rubyPlain(text).length * 170) - elapsed;
      await sleep(Math.max(0, wait));
    }
    if (my !== token || destroyed) return;
    finish();
  }

  function finish() {
    playing = false;
    playBtn.textContent = '▶';
    onFinish();
    sfx('win');
    endBox.classList.remove('hidden');
  }

  function pause() {
    token++;
    playing = false;
    stopSpeak();
    playBtn.textContent = '▶';
  }

  root.querySelector('#start').addEventListener('click', () => {
    root.querySelector('#cover').remove();
    playFrom(0);
  });
  root.querySelector('#skip')?.addEventListener('click', () => go(battleHref));
  playBtn.addEventListener('click', () => {
    if (root.querySelector('#cover')) return;
    if (playing) pause();
    else playFrom(endBox.classList.contains('hidden') ? idx : 0);
  });
  root.querySelector('#prev').addEventListener('click', () => {
    if (root.querySelector('#cover')) return;
    stopSpeak();
    playFrom(Math.max(0, idx - 1));
  });
  root.querySelector('#next').addEventListener('click', () => {
    if (root.querySelector('#cover')) return;
    stopSpeak();
    if (idx + 1 >= scenes.length) { token++; finish(); } else playFrom(idx + 1);
  });
  root.querySelector('#to-battle').addEventListener('click', () => go(battleHref));
  root.querySelector('#replay').addEventListener('click', () => playFrom(0));

  show(0);

  return () => {
    destroyed = true;
    token++;
    stopSpeak();
  };
}
