// 制限時間・設定・バトル中の離脱
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, answer, heartsLeft, progressScript } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const WATCHED = progressScript([], { stages: { '1-jomon': { stars: 0, cleared: false, watched: true } } });

async function startBattle(page) {
  await goto(page, env, '#/battle/1/jomon');
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
}

test('タイマーON：時間切れでハートが減る', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await page.clock.install();
  await startBattle(page);
  assert.equal(await heartsLeft(page), 3);
  await page.clock.fastForward(46_000); // ならべかえ(45秒)でも切れる
  await page.clock.runFor(3000);
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /じかんぎれ/);
  assert.equal(await heartsLeft(page), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('設定でタイマーをオフにすると時間切れにならない（設定は保存される）', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await page.clock.install();
  await goto(page, env, '#/home');
  await page.click('[data-testid=settings-btn]');
  const cb = page.locator('input[data-key=timer]');
  assert.equal(await cb.isChecked(), true);
  await cb.uncheck();
  await page.click('.modal [data-close]');
  await page.reload();
  await page.waitForSelector('.home');
  await page.click('[data-testid=settings-btn]');
  assert.equal(await page.locator('input[data-key=timer]').isChecked(), false);
  await page.click('.modal [data-close]');

  await startBattle(page);
  assert.equal(await page.locator('.timer').evaluate((e) => e.classList.contains('hidden')), true);
  await page.clock.fastForward(120_000);
  await page.clock.runFor(3000);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  assert.equal(await heartsLeft(page), 3);
  // 普通に答えられる
  await answer(page, true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('バトル中に戻るボタンで抜けても、タイマーが動きつづけてエラーにならない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await page.clock.install();
  await startBattle(page);
  await page.click('.battle-hud .back');
  await page.waitForSelector('.level-map'); // hashchange の処理（cleanup）が終わるまで待つ
  await page.clock.fastForward(60_000);
  await page.clock.runFor(3000);
  assert.match(page.url(), /#\/level\/1$/);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  // ふくしゅうに勝手に追加されていない（時間切れ扱いになっていない）
  const review = await page.evaluate(() => JSON.parse(localStorage.getItem('rekishi-busters-v1')).review);
  assert.deepEqual(review, []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('攻撃アニメの途中で抜けてもエラーにならず、次の画面がこわれない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startBattle(page);
  const q = await page.evaluate(() => document.querySelector('[data-testid=question]').innerHTML);
  assert.ok(q);
  // 1つめの選択肢を押してすぐ戻る（正誤どちらでもアニメ中）
  await page.locator('.qpanel button').first().click();
  await page.click('.battle-hud .back');
  await page.waitForURL(/#\/level\/1$/);
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('.level-map').count(), 1);
  assert.equal(await page.locator('.battle-screen').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('アニメ中に「もういちど」バトルへ入りなおしても、前のバトルが新しい画面をこわさない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startBattle(page);
  await answer(page, false);
  await page.click('[data-testid=next]');
  await page.locator('.qpanel button').first().click();
  // アニメ中に同じバトルへ入りなおす
  await page.evaluate(() => { location.hash = '#/level/1'; });
  await page.evaluate(() => { location.hash = '#/battle/1/jomon'; });
  await page.waitForSelector('[data-testid=battle-start]');
  await page.waitForTimeout(3500);
  assert.equal(await heartsLeft(page), 3);
  assert.equal(await page.locator('.battle-screen.shake').count(), 0);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  assert.equal(await page.locator('[data-testid=battle-start]').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('選択肢の連打で2回答えたことにならない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await startBattle(page);
  const btns = page.locator('.qpanel .choices button');
  if (await btns.count() === 0) { await context.close(); return; }
  await btns.first().evaluate((b) => { b.click(); b.click(); b.parentElement.lastElementChild.click(); });
  await page.waitForSelector('[data-testid=feedback]');
  assert.ok(await heartsLeft(page) >= 2);
  assert.deepEqual(errors, []);
  await context.close();
});
