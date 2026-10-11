// 修正の確認（BUG-009 裏に回ったときのタイマー、BUG-010 Service Worker のオフライン動作）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, heartsLeft, progressScript } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const WATCHED = progressScript([], { stages: { '1-jomon': { stars: 0, cleared: false, watched: true } } });

async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

// BUG-009
test('バトル中にアプリを裏にすると制限時間が止まり、もどると残り時間から再開する', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await page.clock.install();
  await goto(page, env, '#/battle/1/jomon');
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
  await page.clock.runFor(5000);
  await setHidden(page, true);
  await page.clock.fastForward(120_000); // 裏で2分
  await page.clock.runFor(1000);
  await setHidden(page, false);
  await page.clock.runFor(1000);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0, 'もどった直後に時間切れになった');
  assert.equal(await heartsLeft(page), 3);
  // 残り時間がたてば時間切れになる（タイマーが止まったままではない）
  await page.clock.runFor(45_000);
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /じかんぎれ/);
  assert.equal(await heartsLeft(page), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('バトルを出たあとに裏⇔表を切りかえても、前のバトルのタイマーが動き出さない', async () => {
  const { page, context, errors } = await newPage(env, { init: WATCHED });
  await page.clock.install();
  await goto(page, env, '#/battle/1/jomon');
  await page.click('[data-testid=battle-start]');
  await page.waitForSelector('[data-testid=question]');
  await setHidden(page, true);
  await page.click('.battle-hud .back');
  await page.waitForSelector('.level-map');
  await setHidden(page, false);
  await page.clock.runFor(60_000);
  const review = await page.evaluate(() => JSON.parse(localStorage.getItem('rekishi-busters-v1')).review);
  assert.deepEqual(review, []);
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-010
test('Service Worker：一度開いたあとはオフラインでも全レベルのデータが読める', async () => {
  const { page, context, errors } = await newPage(env);
  const swBase = env.base.replace('?nosw', '');
  await page.goto(`${swBase}#/home`);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch((e) => { throw new Error(`SW が制御を始めない: ${e.message}`); });
  // install 時のキャッシュが終わるのを待つ
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const c = await caches.open(keys[0]);
    return !!(await c.match('data/levels/lv6.js'));
  }, null, { timeout: 15000 }).catch((e) => { throw new Error(`キャッシュが終わらない: ${e.message}`); });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.home');
  const ok = await page.evaluate(async () => {
    const out = [];
    for (let lv = 1; lv <= 6; lv++) {
      try { const m = await import(`./data/levels/lv${lv}.js`); out.push(Object.keys(m.default).length); } catch { out.push(0); }
    }
    return out;
  });
  assert.deepEqual(ok, [14, 14, 14, 14, 14, 14]);
  await page.goto(`${swBase}#/zukan`);
  await page.waitForSelector('[data-testid=zk-6-heisei]');
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  await context.close();
});
