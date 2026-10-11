// バトル画面：時代の人物が近づいてくる。問題に正解するとその時代の武器でやっつける。
import { ERA_IDS, getEra } from '../../data/eras.js';
import { getLevel, LEVEL_COUNT } from '../../data/levels.js';
import {
  getState, getStage, isStageUnlocked, isLevelUnlocked, recordClear, addReview, removeReview,
  dueReviews, addCoins, touchStreak, save,
} from '../state.js';
import { getStageContent } from '../content.js';
import { Battle, buildEnemies, checkAnswer, correctText, qType, COIN_REVIEW, COIN_BOSS, COIN_MINION } from '../battleLogic.js';
import { r, go, shuffle, sleep, confetti, stars, toast } from '../ui.js';
import { sfx } from '../audio.js';

const TIME_CHOICE = 25;
const TIME_ORDER = 45;
const REVIEW_MAX = 7;

export async function render(root, params) {
  const setup = params.review ? await setupReview() : await setupStage(params);
  if (!setup) return;
  return runBattle(root, setup);
}

async function setupStage({ lv, era: eraId }) {
  const era = getEra(eraId);
  const level = getLevel(lv);
  if (!era || !level || !isStageUnlocked(lv, eraId)) {
    go(level && isLevelUnlocked(lv) ? `#/level/${lv}` : '#/home');
    return null;
  }
  const content = await getStageContent(lv, eraId).catch(() => null);
  if (!content) {
    go(`#/level/${lv}`);
    return null;
  }
  if (!getStage(lv, eraId).watched) {
    go(`#/video/${lv}/${eraId}`);
    return null;
  }
  return {
    mode: 'stage',
    lv, era, content,
    color: era.color,
    title: era.name,
    weapon: era.weapon,
    questions: content.questions.map((q, qi) => ({ ...q, ref: { lv, era: eraId, qi } })),
    enemies: buildEnemies(era, content.boss),
    backHref: `#/level/${lv}`,
  };
}

async function setupReview() {
  const due = dueReviews().slice(0, REVIEW_MAX);
  const questions = [];
  for (const d of due) {
    let c;
    try {
      c = await getStageContent(d.lv, d.era);
    } catch {
      continue; // 読み込めなかった（オフライン等）ときは消さずに、こんかいはとばす
    }
    const q = c?.questions?.[d.qi];
    if (q) questions.push({ ...q, ref: { lv: d.lv, era: d.era, qi: d.qi } });
    else removeReview(d.lv, d.era, d.qi); // データが変わって存在しない問題は消す
  }
  if (!questions.length) {
    go('#/home');
    return null;
  }
  return {
    mode: 'review',
    color: '#5e35b1',
    title: 'ふくしゅうボックス',
    weapon: { name: 'ふくしゅうハンマー', emoji: '🔨' },
    questions,
    enemies: [{
      name: 'わすれんぼオバケ', emoji: '👻', boss: true,
      hp: questions.length, maxHp: questions.length, coin: questions.length * COIN_REVIEW,
    }],
    backHref: '#/home',
  };
}

function runBattle(root, setup) {
  const battle = new Battle({ questions: setup.questions, enemies: setup.enemies });
  const useTimer = getState().settings.timer;
  let timerId = null;
  let destroyed = false;
  let locked = false;

  root.innerHTML = `
    <div class="screen battle-screen" style="--c:${setup.color}">
      <header class="battle-hud">
        <a class="back" href="${setup.backHref}" aria-label="にげる">◀</a>
        <div class="hearts" id="hearts" data-testid="hearts"></div>
        <div class="bh-era">${r(setup.title)}</div>
        <div class="enemy-count" id="ecount"></div>
      </header>
      <div class="arena" id="arena">
        <div class="enemy-wrap" id="enemy-wrap">
          <div class="enemy-name" id="ename"></div>
          <div class="enemy-hp" id="ehp"></div>
          <div class="enemy" id="enemy"></div>
          <div class="speech" id="speech"></div>
        </div>
        <div class="weapon-fly" id="weapon"></div>
        <div class="fx" id="fx"></div>
        <div class="timer"><i id="timer-bar"></i></div>
      </div>
      <div class="qpanel" id="qpanel"></div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const enemyWrap = $('#enemy-wrap');
  const enemyEl = $('#enemy');
  const qpanel = $('#qpanel');
  const screenEl = $('.battle-screen');
  const timerBar = $('#timer-bar');

  function drawHud() {
    $('#hearts').innerHTML = Array.from({ length: battle.maxHearts }, (_, i) => (i < battle.hearts ? '❤️' : '🖤')).join('');
    $('#ecount').textContent = `👾 ${Math.min(battle.enemyIdx + 1, battle.enemies.length)}/${battle.enemies.length}`;
  }

  function drawEnemy() {
    const en = battle.enemy;
    if (!en) return;
    $('#ename').innerHTML = `${en.boss ? '<b class="boss-tag">BOSS</b>' : ''}${r(en.name)}`;
    $('#ehp').innerHTML = Array.from({ length: en.maxHp }, (_, i) => `<i class="${i < en.hp ? 'on' : ''}"></i>`).join('');
    enemyEl.textContent = en.emoji;
    enemyWrap.classList.toggle('is-boss', !!en.boss);
  }

  function say(text, ms = 1600) {
    const sp = $('#speech');
    sp.innerHTML = r(text);
    sp.classList.add('show');
    setTimeout(() => sp.classList.remove('show'), ms);
  }

  // 敵が近づいてくる演出（制限時間と連動）
  function startApproach(sec) {
    enemyWrap.style.transition = 'none';
    enemyWrap.style.setProperty('--near', '0');
    void enemyWrap.offsetWidth;
    enemyWrap.style.transition = `transform ${sec}s linear`;
    enemyWrap.style.setProperty('--near', '1');
  }

  function stopApproach() {
    const cs = getComputedStyle(enemyWrap).transform;
    enemyWrap.style.transition = 'none';
    enemyWrap.style.transform = cs === 'none' ? '' : cs;
  }

  function resetApproach() {
    enemyWrap.style.transform = '';
    enemyWrap.style.transition = 'none';
    enemyWrap.style.setProperty('--near', '0');
  }

  // 動いているタイマー（裏に回ったときに止めて、もどったら残り時間から再開する）
  let timer = null; // { sec, end, onTimeout } / 止めている間は { sec, left, onTimeout }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    timer = null;
  }

  function runTimer(sec, leftMs, onTimeout) {
    const end = Date.now() + leftMs;
    timer = { sec, end, onTimeout };
    timerId = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      timerBar.style.width = `${(left / (sec * 1000)) * 100}%`;
      timerBar.classList.toggle('danger', left < 5000);
      if (left <= 0) {
        stopTimer();
        onTimeout();
      }
    }, 100);
  }

  function startTimer(sec, onTimeout) {
    stopTimer();
    timerBar.parentElement.classList.toggle('hidden', !useTimer);
    if (!useTimer) {
      // 時間制限なし：敵はゆっくり半分まで近づくだけ
      enemyWrap.style.transition = 'transform 8s ease-out';
      enemyWrap.style.setProperty('--near', '0.5');
      return;
    }
    startApproach(sec);
    timerBar.style.width = '100%';
    runTimer(sec, sec * 1000, onTimeout);
  }

  function pauseTimer() {
    if (!timerId || !timer) return;
    const { sec, end, onTimeout } = timer;
    clearInterval(timerId);
    timerId = null;
    timer = { sec, left: Math.max(0, end - Date.now()), onTimeout };
    stopApproach();
  }

  function resumeTimer() {
    if (timerId || !timer || timer.left === undefined || destroyed) return;
    const { sec, left, onTimeout } = timer;
    // 止めた位置から、残り時間で近づきなおす
    enemyWrap.style.transition = `transform ${left / 1000}s linear`;
    enemyWrap.style.transform = '';
    runTimer(sec, left, onTimeout);
  }

  function onVisibility() {
    if (document.hidden) pauseTimer();
    else resumeTimer();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---- 出題 ----
  function ask() {
    if (destroyed) return;
    const qi = battle.nextQuestion();
    const q = battle.questions[qi];
    locked = false;
    resetApproach();
    drawHud();
    drawEnemy();
    const type = qType(q);
    let body = '';
    if (type === 'choice') {
      const opts = shuffle(q.choices.map((c, i) => ({ c, i })));
      body = `<div class="choices">${opts.map((o) => `<button class="choice" data-i="${o.i}">${r(o.c)}</button>`).join('')}</div>`;
    } else if (type === 'tf') {
      body = `<div class="choices tf">
          <button class="choice maru" data-tf="1">⭕</button>
          <button class="choice batsu" data-tf="0">❌</button>
        </div>`;
    } else if (type === 'order') {
      const opts = shuffle(q.items.map((c, i) => ({ c, i })));
      body = `<div class="order-slots" id="slots">${q.items.map((_, i) => `<button class="slot" data-pos="${i}" disabled>${i + 1}</button>`).join('')}</div>
        <div class="order-pool">${opts.map((o) => `<button class="chip" data-i="${o.i}">${r(o.c)}</button>`).join('')}</div>
        <p class="order-hint">まちがえたら、ならべたことばをタップするとはずせるよ</p>
        <div class="order-actions">
          <button class="btn small order-sub" id="order-undo" disabled data-testid="order-undo">↩️ 1つもどす</button>
          <button class="btn small order-sub" id="order-reset" disabled data-testid="order-reset">🔄 リセット</button>
        </div>
        <button class="btn order-ok" id="order-ok" disabled data-testid="order-ok">けってい！</button>`;
    }
    qpanel.innerHTML = `
      <div class="qtext" data-testid="question">${type === 'order' ? '<span class="qtag">ならべかえ</span>' : type === 'tf' ? '<span class="qtag">○×</span>' : ''}${r(q.q)}</div>
      ${body}`;
    qpanel.dataset.type = type;
    // 並べかえは高さが要るので、アリーナを小さくする
    screenEl.classList.toggle('is-order', type === 'order');

    if (type === 'choice') {
      qpanel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => submit(Number(b.dataset.i), b)));
    } else if (type === 'tf') {
      qpanel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => submit(b.dataset.tf === '1', b)));
    } else {
      const picked = [];
      const slots = [...qpanel.querySelectorAll('.slot')];
      const okBtn = qpanel.querySelector('#order-ok');
      const undoBtn = qpanel.querySelector('#order-undo');
      const resetBtn = qpanel.querySelector('#order-reset');
      const chips = [...qpanel.querySelectorAll('.chip')];
      const chipOf = (i) => chips.find((c) => Number(c.dataset.i) === i);
      // 選んだ順番（picked）にあわせて、枠・ことば・ボタンの状態をかきなおす
      const redraw = () => {
        slots.forEach((sl, pos) => {
          const i = picked[pos];
          const filled = i !== undefined;
          sl.innerHTML = filled ? chipOf(i).innerHTML : String(pos + 1);
          sl.classList.toggle('filled', filled);
          sl.disabled = !filled;
        });
        chips.forEach((c) => { c.disabled = picked.includes(Number(c.dataset.i)); });
        undoBtn.disabled = resetBtn.disabled = picked.length === 0;
        okBtn.disabled = picked.length !== q.items.length;
      };
      chips.forEach((c) => c.addEventListener('click', () => {
        if (locked || c.disabled) return;
        sfx('tap');
        picked.push(Number(c.dataset.i));
        redraw();
        // 小さい画面でも、全部ならべたら「けってい！」が見えるように
        if (picked.length === q.items.length) okBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }));
      // ならべたことばをタップすると、その1つだけはずす
      slots.forEach((sl) => sl.addEventListener('click', () => {
        const pos = Number(sl.dataset.pos);
        if (locked || pos >= picked.length) return;
        sfx('tap');
        picked.splice(pos, 1);
        redraw();
      }));
      undoBtn.addEventListener('click', () => {
        if (locked || !picked.length) return;
        sfx('tap');
        picked.pop();
        redraw();
      });
      resetBtn.addEventListener('click', () => {
        if (locked || !picked.length) return;
        sfx('tap');
        picked.length = 0;
        redraw();
      });
      okBtn.addEventListener('click', () => submit([...picked], okBtn));
    }

    startTimer(type === 'order' ? TIME_ORDER : TIME_CHOICE, () => submit(undefined, null, true));
  }

  async function submit(response, btn, timeout = false) {
    if (locked || destroyed) return;
    locked = true;
    stopTimer();
    stopApproach();
    const q = battle.questions[battle.currentQi];
    const ok = !timeout && checkAnswer(q, response);
    qpanel.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    markChoices(q, btn, ok);

    const ev = battle.answer(ok);
    // 勝ちが決まった時点で保存（「けっかを見る」の前にアプリを閉じても消えないように）
    if (ev.status === 'win') saveWin();
    if (setup.mode === 'review') {
      if (ok) removeReview(q.ref.lv, q.ref.era, q.ref.qi);
    } else if (!ok) {
      addReview(q.ref.lv, q.ref.era, q.ref.qi);
    }

    if (ok) await attackAnim(ev);
    else await damageAnim(timeout);
    if (destroyed) return;
    drawHud();
    showFeedback(q, ok, timeout, ev);
  }

  function markChoices(q, btn, ok) {
    const type = qType(q);
    if (type === 'choice') {
      qpanel.querySelectorAll('.choice').forEach((b) => {
        if (Number(b.dataset.i) === q.answer) b.classList.add('right');
      });
    } else if (type === 'tf') {
      qpanel.querySelector(q.answer ? '.maru' : '.batsu')?.classList.add('right');
    }
    if (btn && !ok && type !== 'order') btn.classList.add('wrong');
  }

  async function attackAnim(ev) {
    sfx('correct');
    const w = $('#weapon');
    w.textContent = setup.weapon.emoji;
    w.className = 'weapon-fly';
    void w.offsetWidth;
    w.classList.add('go');
    sfx('throw');
    await sleep(550);
    if (destroyed) return;
    sfx('hit');
    enemyEl.classList.remove('hit');
    void enemyEl.offsetWidth;
    enemyEl.classList.add('hit');
    fx(`💥`);
    drawEnemyHp(ev);
    await sleep(450);
    if (destroyed) return;
    if (ev.defeated) {
      enemyEl.textContent = '😵';
      enemyEl.classList.add('dizzy');
      say(ev.defeated.boss ? 'まいった〜！ おぼえておれ〜' : 'まいった〜！');
      await sleep(900);
      if (destroyed) return;
      sfx('poof');
      enemyEl.classList.remove('dizzy');
      enemyEl.textContent = '💨';
      enemyEl.classList.add('poof');
      toast(`<b>やっつけた！</b> 🪙+${ev.defeated.coin ?? (ev.defeated.boss ? COIN_BOSS : COIN_MINION)}`, 1200);
      sfx('coin');
      await sleep(700);
      enemyEl.classList.remove('poof');
    }
  }

  function drawEnemyHp(ev) {
    const en = ev.defeated || battle.enemy;
    if (!en) return;
    $('#ehp').innerHTML = Array.from({ length: en.maxHp }, (_, i) => `<i class="${i < en.hp ? 'on' : ''}"></i>`).join('');
  }

  async function damageAnim(timeout) {
    sfx('wrong');
    say(timeout ? 'おそいぞ〜！' : 'ちがうぞ〜！', 1200);
    enemyWrap.classList.remove('lunge');
    void enemyWrap.offsetWidth;
    enemyWrap.classList.add('lunge');
    await sleep(350);
    if (destroyed) return;
    sfx('damage');
    root.querySelector('.battle-screen').classList.add('shake');
    fx('💢');
    await sleep(500);
    root.querySelector('.battle-screen')?.classList.remove('shake');
    enemyWrap.classList.remove('lunge');
  }

  function fx(t) {
    const el = $('#fx');
    el.textContent = t;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function showFeedback(q, ok, timeout, ev) {
    const head = ok ? '⭕ せいかい！' : timeout ? '⏰ じかんぎれ…' : '❌ ざんねん…';
    screenEl.classList.remove('is-order');
    qpanel.innerHTML = `
      <div class="feedback ${ok ? 'ok' : 'ng'}" data-testid="feedback">
        <div class="fb-head">${head}</div>
        ${ok ? '' : `<div class="fb-answer">こたえ：<b>${r(correctText(q))}</b></div>`}
        <div class="fb-exp">💡 ${r(q.exp || '')}</div>
        <button class="btn big" id="next-q" data-testid="next">${ev.status === 'playing' ? 'つぎへ ▶' : 'けっかを見る ▶'}</button>
      </div>`;
    $('#next-q').addEventListener('click', () => {
      sfx('tap');
      if (ev.status === 'win') showWin();
      else if (ev.status === 'lose') showLose();
      else ask();
    });
  }

  // ---- 勝ち・負け ----
  let winResult = null;

  function saveWin() {
    let newItem = false;
    let levelUnlockedNow = false;
    if (setup.mode === 'stage') {
      const wasNextLevelOpen = setup.lv < LEVEL_COUNT && isLevelUnlocked(setup.lv + 1);
      ({ newItem } = recordClear(setup.lv, setup.era.id, battle.stars(), battle.coins));
      levelUnlockedNow = setup.lv < LEVEL_COUNT && !wasNextLevelOpen && isLevelUnlocked(setup.lv + 1);
    } else {
      addCoins(battle.coins);
      touchStreak();
      save();
    }
    winResult = { newItem, levelUnlockedNow };
  }

  // 保存ずみの結果を表示するだけ
  function showWin() {
    const earned = battle.coins;
    const st = battle.stars();
    const { newItem, levelUnlockedNow } = winResult;
    sfx('win');
    confetti();

    let itemHtml = '';
    let nextBtn = '';
    if (setup.mode === 'stage') {
      const it = setup.content.item;
      itemHtml = `
        <div class="item-card ${newItem ? 'new' : ''}" data-testid="item-card">
          ${newItem ? '<div class="new-badge">NEW!</div>' : ''}
          <div class="ic-emoji">${it.emoji}</div>
          <div class="ic-name">${r(it.name)}</div>
          <div class="ic-desc">${r(it.desc)}</div>
        </div>`;
      const idx = ERA_IDS.indexOf(setup.era.id);
      if (idx < ERA_IDS.length - 1) {
        nextBtn = `<a class="btn big" href="#/video/${setup.lv}/${ERA_IDS[idx + 1]}" data-testid="next-era">${r('つぎの{時代|じだい}へ ▶')}</a>`;
      } else if (setup.lv < LEVEL_COUNT) {
        nextBtn = `<a class="btn big" href="#/level/${setup.lv + 1}" data-testid="next-level">レベル${setup.lv + 1}へ ▶</a>`;
      }
      if (newItem) setTimeout(() => sfx('item'), 600);
    }

    qpanel.innerHTML = '';
    root.querySelector('.arena').innerHTML = `
      <div class="result" data-testid="result">
        <h2>🎉 ステージクリア！</h2>
        ${setup.mode === 'stage' ? `<div class="result-stars">${stars(st)}</div>` : '<p>ふくしゅう かんりょう！</p>'}
        <div class="result-coins">🪙 +${earned}</div>
        ${levelUnlockedNow ? `<div class="level-up">🔓 レベル${setup.lv + 1} かいほう！</div>` : ''}
        ${itemHtml ? `<p class="got">アイテムをゲット！</p>${itemHtml}` : ''}
      </div>`;
    qpanel.innerHTML = `
      <div class="result-actions">
        ${nextBtn}
        <div class="result-sub">
          <a class="btn ghost" href="${setup.backHref}">${setup.mode === 'stage' ? 'マップへ' : 'ホームへ'}</a>
          ${setup.mode === 'stage' ? '<button class="btn ghost" id="again">🔁 もういちど</button>' : ''}
        </div>
      </div>`;
    root.querySelector('#again')?.addEventListener('click', () => go(location.hash));
  }

  function showLose() {
    sfx('lose');
    root.querySelector('.arena').innerHTML = `
      <div class="result lose" data-testid="lose">
        <h2>😣 まけちゃった…</h2>
        <p>${r('まちがえた{問題|もんだい}は ふくしゅうボックスに{入|はい}ったよ。')}<br>もういちど ちょうせんしよう！</p>
      </div>`;
    qpanel.innerHTML = `
      <div class="result-actions">
        <button class="btn big" id="retry" data-testid="retry">🔁 もういちど</button>
        <div class="result-sub">
          ${setup.mode === 'stage' ? `<a class="btn ghost" href="#/video/${setup.lv}/${setup.era.id}">📺 どうがを見なおす</a>` : ''}
          <a class="btn ghost" href="${setup.backHref}">もどる</a>
        </div>
      </div>`;
    root.querySelector('#retry').addEventListener('click', () => go(location.hash));
  }

  // ---- はじまり ----
  drawHud();
  drawEnemy();
  const names = battle.enemies.map((e) => r(e.name)).join('、');
  qpanel.innerHTML = `
    <div class="intro">
      <p>⚠️ ${names} が あらわれた！</p>
      <p class="weapon-info">${r('ぶき')}：${setup.weapon.emoji} ${r(setup.weapon.name)}</p>
      <p class="small">${r('{問題|もんだい}に{正解|せいかい}して こうげきしよう！ ハートが0になるとまけ。')}</p>
      <button class="btn big battle" id="go" data-testid="battle-start">⚔️ たたかう！</button>
    </div>`;
  $('#go').addEventListener('click', () => { sfx('tap'); ask(); });

  return () => {
    destroyed = true;
    stopTimer();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

