// まちがえた問題の「れんしゅう」と、敵の名前の看板（コミット 1975dc3）
// れんしゅうの答えは、ハート・敵のHP・コイン・★・ふくしゅうボックス・Battle の状態に何も反映しないこと。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, LEVEL_DATA, clickAnswer, currentQuestion, heartsLeft } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';
import { rubyHtml } from '../../js/ruby.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const KEY = 'rekishi-busters-v1';
const QUIET = { sound: false, voice: false, timer: true };
const WATCHED = progressScript([], { settings: QUIET, stages: { '1-jomon': { stars: 0, cleared: false, watched: true } } });
const JOMON = { lv: 1, era: 'jomon' };

const raw = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const qHtml = (page) => page.locator('[data-testid=question]').innerHTML();
const label = (page) => page.locator('[data-testid=next]').textContent();

// 画面の状態（ハート・敵の数・敵のHP・看板）
async function hud(page) {
  return page.evaluate(() => ({
    hearts: document.querySelector('[data-testid=hearts]').textContent,
    ecount: document.querySelector('#ecount').textContent,
    hpOn: document.querySelectorAll('#ehp i.on').length,
    name: document.querySelector('[data-testid=enemy-name]').innerHTML,
  }));
}

// 答えてフィードバックまで（page.clock 使用）
async function answerClock(page, correct, scope) {
  const q = await clickAnswer(page, correct, scope);
  await page.clock.runFor(5000);
  await page.waitForSelector('[data-testid=feedback]');
  return q;
}

async function startStage(page, hash = '#/battle/1/jomon') {
  await page.clock.install();
  await goto(page, env, hash);
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
}

// ---- 1. 敵の名前の看板 ----
test('敵の名前は看板（#ename）に、ふりがな付きで大きく出る。近づく演出の外にあり、小さくならない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await goto(page, env, '#/battle/1/jomon');
  await page.waitForSelector('[data-testid=enemy-name]');
  const info = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=enemy-name]');
    return {
      id: b.id, cls: b.className, insideWrap: !!b.closest('#enemy-wrap'),
      font: parseFloat(getComputedStyle(b).fontSize), hasRuby: !!b.querySelector('ruby'), text: b.textContent,
    };
  });
  assert.equal(info.id, 'ename');
  assert.match(info.cls, /enemy-banner/);
  assert.equal(info.insideWrap, false, '看板が拡大縮小する enemy-wrap の中にある');
  assert.ok(info.font >= 24, `名前の文字が小さい（${info.font}px）`);
  // 最初の敵はザコ（縄文の人物はどれもふりがな付き）
  assert.ok(info.hasRuby, `ふりがながない: ${info.text}`);

  // 敵が近づいても（CSS の transition は実時間）看板の大きさは変わらない。敵（enemy-wrap）は大きくなる
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
  const size = () => page.evaluate(() => {
    const b = document.querySelector('[data-testid=enemy-name]').getBoundingClientRect();
    const w = document.querySelector('#enemy-wrap').getBoundingClientRect();
    return { bw: Math.round(b.width), bh: Math.round(b.height), font: getComputedStyle(document.querySelector('[data-testid=enemy-name]')).fontSize, ww: w.width };
  });
  const s0 = await size();
  await page.waitForTimeout(3000);
  const s1 = await size();
  assert.deepEqual({ bw: s1.bw, bh: s1.bh, font: s1.font }, { bw: s0.bw, bh: s0.bh, font: s0.font }, '近づく演出で看板の大きさが変わった');
  assert.ok(s1.ww > s0.ww, '敵が近づいていない（テストの前提がくずれている）');
  assert.deepEqual(errors, []);
  await context.close();
});

test('敵をたおすと看板が次の敵の名前になり、ボスには BOSS が付く', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startStage(page);
  const names = [];
  for (let n = 0; n < 2; n++) {
    names.push(await page.locator('[data-testid=enemy-name]').innerHTML());
    assert.equal(await page.locator('[data-testid=enemy-name] .boss-tag').count(), 0, 'ザコに BOSS が付いている');
    await answerClock(page, true, JOMON);
    await page.click('[data-testid=next]');
    await page.waitForSelector('[data-testid=question]');
  }
  assert.notEqual(names[0], names[1]);
  const boss = await page.locator('[data-testid=enemy-name]').innerHTML();
  assert.match(boss, /boss-tag/);
  assert.ok(boss.includes(rubyHtml(LEVEL_DATA[1].jomon.boss.name)), `看板がボスの名前でない: ${boss}`);
  assert.deepEqual(errors, []);
  await context.close();
});

// ---- 2・3. れんしゅう ----
test('4択：まちがえる→れんしゅうでまたまちがえる→正解→つぎへ。れんしゅうは何にも反映しない（画面・localStorage）', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startStage(page);
  // 4択が出るまで正解で進める（縄文は4択が多い）。れんしゅう以外で正解した数を数える
  let firstTryCorrect = 0;
  for (let n = 0; n < 4; n++) {
    const q = await currentQuestion(page, JOMON);
    if ((q.type || 'choice') === 'choice') break;
    await answerClock(page, true, JOMON);
    firstTryCorrect++;
    await page.click('[data-testid=next]');
    await page.waitForSelector('[data-testid=question]');
  }
  const q0 = await currentQuestion(page, JOMON);
  assert.equal(q0.type || 'choice', 'choice');
  const html0 = await qHtml(page);
  const hud0 = await hud(page);

  // 1回目：まちがい → ハートが減り、ふくしゅうに入る（これまでどおり）
  await answerClock(page, false, JOMON);
  assert.match(await label(page), /もういちど ちょうせん/);
  const hud1 = await hud(page);
  assert.equal(await heartsLeft(page), 2);
  assert.deepEqual({ ecount: hud1.ecount, hpOn: hud1.hpOn }, { ecount: hud0.ecount, hpOn: hud0.hpOn });
  const raw1 = await raw(page);
  const qi = LEVEL_DATA[1].jomon.questions.indexOf(q0);
  assert.ok(JSON.parse(raw1).review.some((r) => r.lv === 1 && r.era === 'jomon' && r.qi === qi), '1回目のまちがいがふくしゅうに入らない');

  // れんしゅう1回目：同じ問題、時間制限なし・敵は近づかない
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  assert.equal(await qHtml(page), html0, 'れんしゅうで別の問題が出た');
  assert.equal(await page.locator('.timer').evaluate((e) => e.classList.contains('hidden')), true, 'れんしゅうでタイマーが出ている');
  assert.equal(await page.locator('#enemy-wrap').evaluate((e) => e.style.getPropertyValue('--near')), '0', 'れんしゅうで敵が近づく設定になっている');
  await page.clock.fastForward(120_000);
  await page.clock.runFor(1000);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0, 'れんしゅうで時間切れになった');

  // れんしゅうで、またまちがえる → 何も変わらない。もう一度れんしゅう
  await answerClock(page, false, JOMON);
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /ざんねん/);
  assert.match(await label(page), /もういちど ちょうせん/);
  assert.deepEqual(await hud(page), hud1, 'れんしゅうのまちがいで画面（ハート・敵）が変わった');
  assert.equal(await raw(page), raw1, 'れんしゅうのまちがいで localStorage が変わった');
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  assert.equal(await qHtml(page), html0);

  // れんしゅうで正解 → 「おぼえたね」→ つぎへ。何も変わらない（敵のHPも減らない・ふくしゅうからも消えない）
  await answerClock(page, true, JOMON);
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /せいかい！ おぼえたね！/);
  assert.match(await label(page), /^つぎへ ▶$/);
  assert.deepEqual(await hud(page), hud1, 'れんしゅうの正解で画面（ハート・敵のHP）が変わった');
  assert.equal(await raw(page), raw1, 'れんしゅうの正解で localStorage が変わった');

  // つぎへ → 新しい問題（れんしゅうではない）・タイマーあり
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=question]');
  assert.equal(await page.locator('[data-testid=retry-tag]').count(), 0);
  assert.notEqual(await qHtml(page), html0, 'れんしゅうのあと、同じ問題がまた出た');
  assert.equal(await page.locator('.timer').evaluate((e) => e.classList.contains('hidden')), false, 'れんしゅうのあとタイマーがもどらない');

  // そのまま勝つ：れんしゅうの正解は敵へのこうげきに数えないので、れんしゅう以外の正解がちょうど5回（ザコ2＋ボス3）で勝つ
  for (let n = 0; n < 20; n++) {
    await answerClock(page, true, JOMON);
    firstTryCorrect++;
    const l = await label(page);
    await page.click('[data-testid=next]');
    if (l.includes('けっか')) break;
  }
  await page.waitForSelector('[data-testid=result]');
  assert.equal(firstTryCorrect, 5, 'れんしゅうの正解が敵へのこうげきに数えられた（または数えられなかった）');
  assert.equal(await page.locator('.result-stars').textContent(), '★★☆');
  assert.match(await page.locator('[data-testid=result]').textContent(), /🪙 \+50/);
  const s = JSON.parse(await raw(page));
  assert.equal(s.coins, 50);
  assert.equal(s.stages['1-jomon'].stars, 2);
  assert.ok(s.review.some((r) => r.lv === 1 && r.era === 'jomon' && r.qi === qi), 'れんしゅうの正解でふくしゅうから消えた');
  assert.deepEqual(errors, []);
  await context.close();
});

test('時間切れのあとも、れんしゅうになる（時間制限なし）', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startStage(page);
  const html0 = await qHtml(page);
  await page.clock.fastForward(46_000);
  await page.clock.runFor(5000);
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /じかんぎれ/);
  assert.equal(await heartsLeft(page), 2);
  assert.match(await label(page), /もういちど ちょうせん/);
  const raw1 = await raw(page);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  assert.equal(await qHtml(page), html0);
  await page.clock.fastForward(120_000);
  await page.clock.runFor(1000);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0, 'れんしゅうで時間切れになった');
  await answerClock(page, true, JOMON);
  assert.match(await label(page), /^つぎへ ▶$/);
  assert.equal(await heartsLeft(page), 2);
  assert.equal(await raw(page), raw1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('1回目のまちがいでハートが0になったら、れんしゅうは出ずに「けっかを見る」→負け画面', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startStage(page);
  for (let n = 0; n < 3; n++) {
    await answerClock(page, false, JOMON);
    if (n < 2) {
      assert.match(await label(page), /もういちど ちょうせん/);
      await page.click('[data-testid=next]');
      await page.waitForSelector('[data-testid=retry-tag]');
      await answerClock(page, true, JOMON);
      await page.click('[data-testid=next]');
      await page.waitForSelector('[data-testid=question]');
      assert.equal(await page.locator('[data-testid=retry-tag]').count(), 0);
    }
  }
  assert.equal(await heartsLeft(page), 0);
  assert.match(await label(page), /けっかを見る/);
  assert.doesNotMatch(await label(page), /もういちど/);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=lose]');
  assert.equal(await page.locator('[data-testid=retry-tag]').count(), 0);
  assert.equal(JSON.parse(await raw(page)).review.length, 3);
  assert.deepEqual(errors, []);
  await context.close();
});

// ふくしゅうモード：1問だけのふくしゅうに、並べかえ・○× を入れる
function reviewInit(entries) {
  return progressScript([], { settings: QUIET, review: entries.map((e) => ({ ...e, added: '2000-01-01' })) });
}
const ORDER_Q = { lv: 1, era: 'jomon', qi: LEVEL_DATA[1].jomon.questions.findIndex((q) => q.type === 'order') };
const TF_Q = { lv: 1, era: 'jomon', qi: LEVEL_DATA[1].jomon.questions.findIndex((q) => q.type === 'tf') };

test('ふくしゅうモード・並べかえ：れんしゅうで正解しても、ふくしゅうから消えず、わすれんぼオバケも倒れない', async () => {
  const { page, context, errors } = await newPage(env, { init: reviewInit([ORDER_Q]) });
  await startStage(page, '#/review');
  assert.equal(await page.locator('.battle-screen.is-order').count(), 1);
  const html0 = await qHtml(page);
  await answerClock(page, false, JOMON);
  const hud1 = await hud(page);
  const raw1 = await raw(page);
  assert.equal(JSON.parse(raw1).review.length, 1);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  assert.equal(await qHtml(page), html0);
  assert.ok(await page.locator('.order-pool .chip').count() >= 2, 'れんしゅうで並べかえの画面が出ない');
  assert.equal(await page.locator('.battle-screen.is-order').count(), 1, 'れんしゅうの並べかえで is-order にならない');
  // れんしゅうでまたまちがえる（逆順）→ 正解
  await answerClock(page, false, JOMON);
  assert.match(await label(page), /もういちど/);
  assert.equal(await raw(page), raw1);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  await answerClock(page, true, JOMON);
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /おぼえたね/);
  assert.match(await label(page), /^つぎへ ▶$/, 'れんしゅうの正解でオバケが倒れた（「けっかを見る」になった）');
  assert.deepEqual(await hud(page), hud1);
  assert.equal(await raw(page), raw1, 'れんしゅうの正解でふくしゅうから消えた');
  // つぎへ：未正解の同じ問題がふつうの問題として出る → 正解で勝ち・ふくしゅうから消える
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=question]');
  assert.equal(await page.locator('[data-testid=retry-tag]').count(), 0);
  await answerClock(page, true, JOMON);
  assert.match(await label(page), /けっか/);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=result]');
  assert.deepEqual(JSON.parse(await raw(page)).review, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ふくしゅうモード・○×：まちがい→れんしゅう→正解。ハートは1つ減ったまま', async () => {
  const { page, context, errors } = await newPage(env, { init: reviewInit([TF_Q, ORDER_Q]) });
  await startStage(page, '#/review');
  // ○× が出るまで（2問のどちらか）
  let q = await currentQuestion(page, JOMON);
  if (q.type !== 'tf') {
    await answerClock(page, true, JOMON);
    await page.click('[data-testid=next]');
    await page.waitForSelector('[data-testid=question]');
    q = await currentQuestion(page, JOMON);
  }
  assert.equal(q.type, 'tf');
  await answerClock(page, false, JOMON);
  const raw1 = await raw(page);
  const hud1 = await hud(page);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  assert.equal(await page.locator('.choices.tf .choice').count(), 2);
  await answerClock(page, false, JOMON);
  assert.deepEqual(await hud(page), hud1);
  await page.click('[data-testid=next]');
  await answerClock(page, true, JOMON);
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /おぼえたね/);
  assert.deepEqual(await hud(page), hud1);
  assert.equal(await raw(page), raw1);
  assert.equal(await heartsLeft(page), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('まとめバトル：れんしゅうは eras・コイン・ふくしゅうに反映しない', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  await startStage(page, '#/erabattle/edo');
  const hud0 = await hud(page);
  await answerClock(page, false, { era: 'edo' });
  const raw1 = await raw(page);
  const hud1 = await hud(page);
  assert.equal(JSON.parse(raw1).review.length, 1);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  await answerClock(page, false, { era: 'edo' });
  await page.click('[data-testid=next]');
  await answerClock(page, true, { era: 'edo' });
  assert.match(await label(page), /^つぎへ ▶$/);
  assert.deepEqual(await hud(page), hud1);
  assert.deepEqual({ ecount: hud1.ecount, hpOn: hud1.hpOn }, { ecount: hud0.ecount, hpOn: hud0.hpOn });
  assert.equal(await raw(page), raw1);
  assert.deepEqual(JSON.parse(raw1).eras, {});
  assert.deepEqual(errors, []);
  await context.close();
});

test('れんしゅうの途中で戻るボタン・裏に回る・もういちど入っても、エラーにならず何も記録されない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startStage(page);
  await answerClock(page, false, JOMON);
  const raw1 = await raw(page);
  await page.click('[data-testid=next]');
  await page.waitForSelector('[data-testid=retry-tag]');
  // 裏に回って戻る（タイマーがないので何も起きない）
  await page.evaluate(() => {
    for (const h of [true, false]) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  await page.clock.runFor(60_000);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  // 答えた直後（アニメ中）に戻る
  await clickAnswer(page, true, JOMON);
  await page.click('.battle-hud .back');
  await page.waitForSelector('.level-map');
  await page.clock.runFor(10_000);
  assert.equal(await raw(page), raw1);
  assert.deepEqual(errors, []);
  await context.close();
});
