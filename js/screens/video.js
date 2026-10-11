// アニメ紙芝居プレイヤー：場面ごとにイラスト＋字幕＋読み上げを自動再生する
import { getEra } from '../../data/eras.js';
import { getLevel } from '../../data/levels.js';
import { getStage, isStageUnlocked, isLevelUnlocked, markWatched } from '../state.js';
import { getStageContent } from '../content.js';
import { r, go, sleep } from '../ui.js';
import { speak, stopSpeak, sfx } from '../audio.js';
import { rubyPlain } from '../ruby.js';

export async function render(root, { lv, era: eraId }) {
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
  const scenes = content.video;
  const watchedBefore = getStage(lv, eraId).watched;

  root.innerHTML = `
    <div class="screen video" style="--c:${era.color}">
      <header class="bar-head">
        <a class="back" href="#/level/${lv}" aria-label="もどる">◀</a>
        <div>
          <div class="bh-title">📺 ${r(era.name)}</div>
          <div class="bh-sub">レベル${lv}：${r(content.title || level.title)}</div>
        </div>
      </header>
      <div class="stage-frame">
        <div class="scene-art" id="art"></div>
        <div class="scene-caption" id="caption"></div>
        <div class="start-cover" id="cover">
          <button class="btn big" id="start" data-testid="video-start">▶ どうがをはじめる</button>
          ${watchedBefore ? '<button class="btn ghost" id="skip" data-testid="video-skip">とばしてバトルへ ⏭</button>' : ''}
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
        <button class="btn big battle" id="to-battle" data-testid="video-to-battle">⚔️ バトルへ！</button>
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
      const minMs = 2200;
      const started = Date.now();
      const spoke = await speak(text);
      if (my !== token || destroyed) return;
      const elapsed = Date.now() - started;
      // 読み上げなし（または失敗）のときは文字数に合わせて待つ
      const wait = spoke ? Math.max(0, minMs - elapsed) + 500 : Math.max(3000, rubyPlain(text).length * 170) - elapsed;
      await sleep(Math.max(0, wait));
    }
    if (my !== token || destroyed) return;
    finish();
  }

  function finish() {
    playing = false;
    playBtn.textContent = '▶';
    markWatched(lv, eraId);
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
  root.querySelector('#skip')?.addEventListener('click', () => go(`#/battle/${lv}/${eraId}`));
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
  root.querySelector('#to-battle').addEventListener('click', () => go(`#/battle/${lv}/${eraId}`));
  root.querySelector('#replay').addEventListener('click', () => playFrom(0));

  show(0);

  return () => {
    destroyed = true;
    token++;
    stopSpeak();
  };
}
