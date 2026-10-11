// 全6レベル×14時代：動画→バトル→全問正解でクリア→「つぎの時代へ」で次へ、を縄文〜令和まで通しでプレイする。
// アニメの待ち時間は page.clock で早送りする。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, LEVEL_DATA, clickAnswer } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';
import { LEVEL_COUNT } from '../../data/levels.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const NO_VOICE = { sound: false, voice: false, timer: true };

for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
  test(`lv${lv}: 縄文〜平成・令和の14時代を順にクリアできる`, { skip: LEVEL_DATA[lv] ? false : `lv${lv}.js は未作成` }, async () => {
    const cleared = [];
    for (let l = 1; l < lv; l++) cleared.push(...ERA_IDS.map((e) => `${l}-${e}`));
    const { page, context, errors } = await newPage(env, { init: progressScript(cleared, { settings: NO_VOICE }) });
    await page.clock.install();
    await goto(page, env, `#/level/${lv}`);
    await page.click('[data-testid=era-jomon]');
    await page.click('[data-testid=btn-video]');

    for (const [idx, era] of ERA_IDS.entries()) {
      const where = `lv${lv}.${era}`;
      await page.waitForURL(new RegExp(`#/video/${lv}/${era}$`));
      // 動画：⏭ で最後まで
      await page.click('[data-testid=video-start]');
      for (let i = 0; i < 40 && !(await page.locator('[data-testid=video-to-battle]').isVisible()); i++) await page.click('#next');
      await page.click('[data-testid=video-to-battle]');
      await page.waitForURL(new RegExp(`#/battle/${lv}/${era}$`));
      await page.click('[data-testid=battle-start]');
      // バトル：全問正解
      for (let n = 0; n < 20; n++) {
        await clickAnswer(page, true, { lv, era });
        await page.clock.runFor(4000);
        await page.waitForSelector('[data-testid=feedback].ok', { timeout: 5000 }).catch(() => {
          throw new Error(`${where}: 正解のはずが不正解（データの answer とずれている？）`);
        });
        const label = await page.locator('[data-testid=next]').textContent();
        await page.click('[data-testid=next]');
        if (label.includes('けっか')) break;
      }
      await page.waitForSelector('[data-testid=result]');
      assert.equal(await page.locator('.result-stars').textContent(), '★★★', where);
      assert.match(await page.locator('[data-testid=item-card]').innerHTML(), /ic-name/, where);
      if (idx < ERA_IDS.length - 1) {
        await page.click('[data-testid=next-era]');
      } else if (lv < LEVEL_COUNT) {
        assert.match(await page.locator('[data-testid=result]').textContent(), new RegExp(`レベル${lv + 1} かいほう`));
        await page.click('[data-testid=next-level]');
        await page.waitForURL(new RegExp(`#/level/${lv + 1}$`));
      } else {
        assert.equal(await page.locator('[data-testid=next-level], [data-testid=next-era]').count(), 0);
      }
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rekishi-busters-v1')));
    assert.equal(ERA_IDS.filter((e) => saved.stages[`${lv}-${e}`]?.cleared).length, 14);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
