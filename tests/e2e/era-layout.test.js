// 時代べつまとめの画面のレイアウト（390×844 / 375×667）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, goto, clickAnswer, passRetry } from './helpers.js';
import { horizontalOverflow, lowContrast, shot } from './layoutUtil.js';
import { LEGACY_JSON, LEGACY_TODAY } from '../fixtures/legacySave.js';

const SIZES = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

async function pageFor(size) {
  const context = await env.browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const saved = JSON.parse(LEGACY_JSON);
  saved.settings = { sound: false, voice: false, timer: false };
  saved.eras = { edo: { stars: 2, plays: 3 } };
  await context.addInitScript(`if (!sessionStorage.getItem('__s')) { localStorage.setItem('rekishi-busters-v1', ${JSON.stringify(JSON.stringify(saved))}); localStorage.setItem('rekishi-busters-debug-date', '${LEGACY_TODAY}'); sessionStorage.setItem('__s', '1'); }`);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, context, errors };
}

async function check(page, where, { buttons = 'a.btn, button.btn' } = {}) {
  const o = await horizontalOverflow(page);
  assert.ok(o.sw <= o.w, `${where}: 横スクロールが出る（scrollWidth=${o.sw} > ${o.w}）${o.out.join(' / ')}`);
  assert.deepEqual(o.out, [], `${where}: 横にはみ出す要素`);
  assert.deepEqual(await lowContrast(page, buttons), [], `${where}: 文字が読めないボタン`);
}

for (const size of SIZES) {
  const tag = `${size.width}×${size.height}`;

  test(`${tag}: ホームの「時代べつ まとめ」・一覧・まとめページ`, async () => {
    const { page, context, errors } = await pageFor(size);
    await goto(page, env, '#/home');
    await page.waitForSelector('[data-testid=eras-btn]');
    await check(page, `${tag} home`);
    await page.locator('[data-testid=eras-btn]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${(await import('./layoutUtil.js')).SHOT_DIR}/${size.width}x${size.height}-home-erasbtn.png` });
    await page.click('[data-testid=eras-btn]');
    await page.waitForSelector('[data-testid=era-card-heisei]');
    await check(page, `${tag} eras`);
    await shot(page, 'eras', size);
    await page.goto(`${env.base}#/era/edo`);
    await page.waitForSelector('[data-testid=era-video-6]');
    await check(page, `${tag} era/edo`);
    assert.match(await page.locator('.ea-best').textContent(), /★★☆.*3\s*回/);
    await shot(page, 'era-detail', size);
    assert.deepEqual(errors, []);
    await context.close();
  });

  // BUG-020
  test(`${tag}: 「ぜんぶまとめて見る」の動画（60場面以上）が横にはみ出さない`, async () => {
    const { page, context, errors } = await pageFor(size);
    await goto(page, env, '#/eravideo/edo/all');
    await page.click('[data-testid=video-start]');
    await page.click('#play');
    await page.waitForTimeout(300);
    await shot(page, 'era-video-all', size);
    const dots = await page.locator('#dots i').count();
    assert.ok(dots >= 40, `場面の数 ${dots}`);
    await check(page, `${tag} eravideo all（${dots}場面）`, { buttons: '.ctl' });
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: まとめバトル（はじまり・問題・クリア・負け）`, async () => {
    const { page, context, errors } = await pageFor(size);
    await page.clock.install();
    await goto(page, env, '#/erabattle/meiji');
    await page.waitForSelector('[data-testid=battle-start]');
    await check(page, `${tag} erabattle intro`);
    await shot(page, 'erabattle-intro', size);
    await page.click('[data-testid=battle-start]');
    await page.waitForSelector('[data-testid=question]');
    await check(page, `${tag} erabattle question`);
    await shot(page, 'erabattle-question', size);
    for (let n = 0; n < 20; n++) {
      await clickAnswer(page, true, { era: 'meiji' });
      await page.clock.runFor(5000);
      const label = await page.locator('[data-testid=next]').textContent();
      await page.click('[data-testid=next]');
      if (label.includes('けっか')) break;
    }
    await page.waitForSelector('[data-testid=result]');
    await page.clock.runFor(1000);
    await page.waitForTimeout(600);
    await check(page, `${tag} erabattle result`);
    await shot(page, 'erabattle-result', size);
    await page.click('#again');
    await page.click('[data-testid=battle-start]');
    for (let n = 0; n < 3; n++) {
      await clickAnswer(page, false, { era: 'meiji' });
      await page.clock.runFor(5000);
      if (n < 2) await passRetry(page, { scope: { era: 'meiji' }, clock: true });
      else await page.click('[data-testid=next]');
    }
    await page.waitForSelector('[data-testid=lose]');
    await page.waitForTimeout(400);
    await check(page, `${tag} erabattle lose`);
    await shot(page, 'erabattle-lose', size);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
