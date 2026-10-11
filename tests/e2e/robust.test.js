// 探索的に見つけた問題の再現
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, answer, progressScript } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const WATCHED = progressScript([], { stages: { '1-jomon': { stars: 0, cleared: false, watched: true } } });

// BUG-006: 最後の一撃のあと「けっかを見る」を押す前にアプリを閉じるとクリアが記録されない
test('ボスを倒した時点でクリアが保存される（けっかを見る前にアプリを閉じても消えない）', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await goto(page, env, '#/battle/1/jomon');
  await page.click('[data-testid=battle-start]');
  for (let i = 0; i < 5; i++) {
    await answer(page, true);
    if (i < 4) await page.click('[data-testid=next]');
  }
  assert.match(await page.locator('[data-testid=next]').textContent(), /けっか/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rekishi-busters-v1')).stages['1-jomon']);
  assert.equal(saved.cleared, true, 'ボスを倒したのにクリアが保存されていない');
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-007: 読み上げの onend/onerror が来ない（iOS Safari でよくある）と動画が先へ進まない
test('読み上げの終了イベントが来なくても、動画は一定時間で次の場面へ進む', async () => {
  const { page, context, errors } = await newPage(env, {
    init: `
      window.speechSynthesis.speak = () => {};   // 何もしない（onend が来ない）
      window.speechSynthesis.cancel = () => {};
    `,
  });
  await page.clock.install();
  await goto(page, env, '#/video/1/jomon');
  await page.click('[data-testid=video-start]');
  const on = () => page.locator('#dots i.on').count();
  assert.equal(await on(), 1);
  await page.clock.runFor(30_000);
  assert.ok(await on() >= 2, '30秒たっても1場面目のまま');
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-008: lvN.js の読み込みに1回失敗すると（オフライン・電波が悪い等）、リロードするまでずっと失敗する
test('レベルデータの読み込みに1回失敗しても、つぎのタップで読みなおせる', async () => {
  const { page, context } = await newPage(env);
  let fail = true;
  await page.route(/data\/levels\/lv1\.js/, (route) => (fail ? route.abort('internetdisconnected') : route.continue()));
  await goto(page, env, '#/level/1');
  await page.click('[data-testid=era-jomon]');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-testid=btn-video]').count(), 0);
  // 電波がもどった
  fail = false;
  await page.locator('#modal-root').evaluate((e) => { e.innerHTML = ''; });
  await page.click('[data-testid=era-jomon]');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[data-testid=btn-video]').count(), 1, '電波がもどっても時代のメニューが開かない');
  await context.close();
});

// BUG-002 の一部：読み込み失敗時に、タップしても何も起きない（エラー表示が無い）
test('レベルデータの読み込みに失敗したら、タップしたときに何かメッセージが出る', async () => {
  const { page, context, errors } = await newPage(env);
  await page.route(/data\/levels\/lv1\.js/, (route) => route.abort('internetdisconnected'));
  await goto(page, env, '#/level/1');
  await page.click('[data-testid=era-jomon]');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#modal-root .modal').count() >= 1, 'タップしても何も表示されない');
  assert.equal(errors.filter((e) => e.startsWith('pageerror')).length, 0, `unhandled rejection: ${errors}`);
  await context.close();
});

// 時代メニューの連打でモーダルが重ならない
test('時代ボタンの連打でモーダルが2枚重ならない', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/level/1');
  await page.locator('[data-testid=era-jomon]').evaluate((b) => { b.click(); b.click(); });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#modal-root .modal').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});
