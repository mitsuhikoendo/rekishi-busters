// メインの流れ：ホーム→Lv1→縄文→動画→バトル→クリア→アイテム→弥生解放→リロード
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, newPage, goto, watchVideoBySkipping, playBattle, answer, next, heartsLeft, clearStage, setDebugDate, passRetry,
} from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

test('縄文を全問正解でクリア→★3・アイテム→弥生解放→リロードでも残る', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/home');
  await page.click('[data-testid=level-1]');
  await page.waitForSelector('[data-testid=era-jomon]');
  assert.equal(await page.locator('[data-testid=era-yayoi]').evaluate((e) => e.classList.contains('locked')), true);

  await page.click('[data-testid=era-jomon]');
  // 動画を見る前はバトルボタンが無効
  assert.match(await page.locator('[data-testid=btn-battle]').getAttribute('class'), /disabled/);
  await page.click('[data-testid=btn-video]');
  await page.waitForURL(/#\/video\/1\/jomon$/);
  await watchVideoBySkipping(page);
  await page.click('[data-testid=video-to-battle]');
  await page.waitForURL(/#\/battle\/1\/jomon$/);
  await playBattle(page);

  const result = page.locator('[data-testid=result]');
  await result.waitFor();
  assert.equal(await result.locator('.result-stars').textContent(), '★★★');
  assert.match(await result.textContent(), /🪙 \+50/);
  const card = page.locator('[data-testid=item-card]');
  assert.match(await card.textContent(), /縄文土器/);
  assert.match(await card.getAttribute('class'), /new/);

  // マップで弥生が解放され、縄文は★3
  await page.goto(`${env.base}#/level/1`);
  await page.waitForSelector('[data-testid=era-yayoi]');
  assert.equal(await page.locator('[data-testid=era-yayoi]').evaluate((e) => e.classList.contains('locked')), false);
  await page.reload();
  await page.waitForSelector('[data-testid=era-jomon]');
  assert.equal(await page.locator('[data-testid=era-jomon]').evaluate((e) => e.classList.contains('cleared')), true);
  assert.match(await page.locator('[data-testid=era-jomon] .stars').textContent(), /★★★/);
  assert.equal(await page.locator('[data-testid=era-yayoi]').evaluate((e) => e.classList.contains('locked')), false);
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-001
test('クリア画面の「つぎの時代へ」がボタンとして押せて、次の動画へ進む', async () => {
  const { page, context, errors } = await newPage(env);
  await clearStage(page, env, 1, 'jomon');
  const btn = page.locator('[data-testid=next-era]');
  assert.equal(await btn.count(), 1, '「つぎの時代へ」がHTMLとして表示されていない（文字列のまま）');
  await btn.click();
  await page.waitForURL(/#\/video\/1\/yayoi$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('わざと3回まちがえる→負け画面→リトライでバトルをやりなおせる', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/video/1/jomon');
  await watchVideoBySkipping(page);
  await page.click('[data-testid=video-to-battle]');
  await page.click('[data-testid=battle-start]');
  for (let i = 0; i < 3; i++) {
    await answer(page, false);
    assert.equal(await heartsLeft(page), 2 - i);
    if (i < 2) await passRetry(page); // まちがえたら、れんしゅうを正解で通してから次の問題へ
    else await next(page);
  }
  await page.waitForSelector('[data-testid=lose]');
  await page.click('[data-testid=retry]');
  await page.waitForSelector('[data-testid=battle-start]');
  assert.equal(await heartsLeft(page), 3);
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
  assert.deepEqual(errors, []);
  await context.close();
});

test('まちがえた問題は当日は出ず、翌日ふくしゅうボックスに出て、正解すると消える', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/home');
  await setDebugDate(page, '2026-10-11');
  await clearStage(page, env, 1, 'jomon', { mistakes: 1 });
  assert.match(await page.locator('.result-stars').textContent(), /★★☆/);

  await page.goto(`${env.base}#/home`);
  await page.waitForSelector('.home');
  assert.equal(await page.locator('[data-testid=review-btn]').count(), 0, '当日はふくしゅうに出ない');

  await setDebugDate(page, '2026-10-12');
  await page.reload();
  await page.waitForSelector('[data-testid=review-btn]');
  assert.match(await page.locator('[data-testid=review-btn]').textContent(), /1\s*問/);
  await page.click('[data-testid=review-btn]', { force: true }); // ずっとアニメしているので stable にならない
  await page.waitForURL(/#\/review$/);
  await playBattle(page);
  await page.waitForSelector('[data-testid=result]');
  assert.match(await page.locator('[data-testid=result]').textContent(), /🪙 \+5/);

  await page.goto(`${env.base}#/home`);
  await page.waitForSelector('.home');
  assert.equal(await page.locator('[data-testid=review-btn]').count(), 0, '正解したら消える');
  // 直接URLで来てもホームに戻される
  await page.goto(`${env.base}#/review`);
  await page.waitForURL(/#\/home$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('図鑑にアイテムが反映される', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/zukan');
  await page.waitForSelector('[data-testid=zk-1-jomon]');
  assert.equal(await page.locator('[data-testid=zk-1-jomon] .zk-emoji').textContent(), '❓');
  await clearStage(page, env, 1, 'jomon');
  await page.goto(`${env.base}#/home`);
  await page.click('[data-testid=zukan-btn]');
  await page.waitForSelector('[data-testid=zk-1-jomon]');
  const cell = page.locator('[data-testid=zk-1-jomon]');
  assert.match(await cell.getAttribute('class'), /got/);
  assert.equal(await cell.locator('.zk-emoji').textContent(), '🏺');
  assert.match(await page.locator('.bh-sub').textContent(), /1\/84/);
  await cell.click();
  await page.waitForSelector('.modal .item-card');
  assert.match(await page.locator('.modal .item-card').textContent(), /縄文土器/);
  // 未獲得
  await page.click('.modal [data-close]');
  await page.click('[data-testid=zk-1-yayoi]');
  assert.match(await page.locator('.modal').textContent(), /クリアすると/);
  assert.deepEqual(errors, []);
  await context.close();
});
