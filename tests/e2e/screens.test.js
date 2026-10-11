// 全画面を回って console error / pageerror が出ないこと。作成済みの全レベルの各時代が開けること。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, LEVEL_DATA, watchVideoBySkipping, playBattle } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

test('ホーム・マップ・動画・バトル・図鑑・設定・ふくしゅうを回ってもエラーが出ない', async () => {
  const { page, context, errors } = await newPage(env, {
    init: progressScript(['1-jomon'], {
      review: [{ lv: 1, era: 'jomon', qi: 0, added: '2000-01-01' }],
    }),
  });
  await goto(page, env, '#/home');
  await page.waitForSelector('[data-testid=review-btn]');
  assert.ok(await page.locator('.mission-chip').count() >= 1);
  await page.click('[data-testid=settings-btn]');
  await page.waitForSelector('.modal');
  await page.click('.modal [data-close]');
  for (const hash of ['#/level/1', '#/video/1/jomon', '#/battle/1/jomon', '#/zukan', '#/review', '#/video/1/yayoi', '#/home']) {
    await page.goto(`${env.base}${hash}`);
    await page.waitForTimeout(400);
    assert.doesNotMatch(await page.locator('#app').textContent(), /エラーがおきました/, hash);
  }
  // 動画の再生・一時停止・前へ
  await page.goto(`${env.base}#/video/1/jomon`);
  await page.click('[data-testid=video-start]');
  await page.click('#play');
  await page.click('#play');
  await page.click('#next');
  await page.click('#prev');
  await page.goto(`${env.base}#/home`);
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ミッションのリンクから遊べる', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/home');
  await page.click('[data-testid=mission-1-jomon]');
  await page.waitForURL(/#\/level\/1$/);
  assert.deepEqual(errors, []);
  await context.close();
});

// 作成済みの各レベル：全時代の動画・バトル画面が開け、1時代はクリアまで通る
for (const lv of Object.keys(LEVEL_DATA).map(Number)) {
  test(`lv${lv}: 全14時代のマップ→動画→バトル開始がエラーなく開ける`, async () => {
    const cleared = [];
    for (let l = 1; l < lv; l++) cleared.push(...ERA_IDS.map((e) => `${l}-${e}`));
    cleared.push(...ERA_IDS.map((e) => `${lv}-${e}`)); // その時代も開けるように全部クリア扱い
    const { page, context, errors } = await newPage(env, { init: progressScript(cleared) });
    for (const era of ERA_IDS) {
      await page.goto(`${env.base}#/level/${lv}`);
      await page.click(`[data-testid=era-${era}]`);
      await page.waitForSelector('[data-testid=btn-video]');
      await page.click('[data-testid=btn-video]');
      await page.waitForSelector('[data-testid=video-start]');
      await page.goto(`${env.base}#/battle/${lv}/${era}`);
      await page.click('[data-testid=battle-start]');
      await page.waitForSelector('[data-testid=question]');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`lv${lv}: 縄文を動画からクリアまで通せる（全問の正答がデータと一致）`, async () => {
    const cleared = [];
    for (let l = 1; l < lv; l++) cleared.push(...ERA_IDS.map((e) => `${l}-${e}`));
    const { page, context, errors } = await newPage(env, { init: progressScript(cleared) });
    await goto(page, env, `#/video/${lv}/jomon`);
    await watchVideoBySkipping(page);
    await page.click('[data-testid=video-to-battle]');
    await playBattle(page);
    await page.waitForSelector('[data-testid=result]');
    assert.equal(await page.locator('.result-stars').textContent(), '★★★');
    assert.deepEqual(errors, []);
    await context.close();
  });
}
