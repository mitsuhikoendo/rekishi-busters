// 入れないはずの画面に入れないこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, missingLevels } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

test('動画を見ていないとバトルに入れない（ボタンも直接URLも）', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/level/1');
  await page.click('[data-testid=era-jomon]');
  await page.click('[data-testid=btn-battle]');
  await page.waitForTimeout(300);
  assert.match(page.url(), /#\/level\/1$/);

  await page.goto(`${env.base}#/battle/1/jomon`);
  await page.waitForURL(/#\/video\/1\/jomon$/);
  assert.equal(await page.locator('[data-testid=battle-start]').count(), 0);
  // 初回はスキップボタンが無い
  assert.equal(await page.locator('[data-testid=video-skip]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ロックされた時代に直接URLで入れない（動画・バトル）', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/video/1/yayoi');
  await page.waitForURL(/#\/level\/1$/);
  await page.goto(`${env.base}#/battle/1/kofun`);
  await page.waitForURL(/#\/level\/1$/);
  // ロックされた時代のノードを押すとモーダル
  await page.click('[data-testid=era-yayoi]');
  assert.match(await page.locator('.modal').textContent(), /クリアしてね/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('watched が保存データにあっても、前の時代が未クリアなら入れない', async () => {
  const { page, context, errors } = await newPage(env, {
    init: progressScript([], { stages: { '1-kofun': { stars: 0, cleared: false, watched: true } } }),
  });
  await goto(page, env, '#/battle/1/kofun');
  await page.waitForURL(/#\/level\/1$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ロックされたレベルのマップに直接URLで入れない', async () => {
  const { page, context, errors } = await newPage(env);
  await goto(page, env, '#/level/2');
  await page.waitForURL(/#\/home$/);
  await page.goto(`${env.base}#/level/9`);
  await page.waitForURL(/#\/home$/);
  await page.goto(`${env.base}#/nope`);
  await page.waitForURL(/#\/home$/);
  // ロックされたレベルカードを押すとモーダル
  await page.click('[data-testid=level-2]');
  assert.match(await page.locator('.modal').textContent(), /レベル1/);
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-002: lvN.js が無いレベルだと、リダイレクトされずにエラー画面＋console.error
test('ロックされたレベル（2〜6）の動画・バトルに直接URLで来たらマップかホームに戻される（エラー画面にならない）', async () => {
  const { page, context, errors } = await newPage(env);
  const hashes = [2, 3, 4, 5, 6].flatMap((lv) => [`#/video/${lv}/jomon`, `#/battle/${lv}/jomon`]);
  for (const hash of hashes) {
    await page.goto(`${env.base}${hash}`);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-testid=battle-start]').count(), 0, `${hash}: バトルに入れてしまう`);
    assert.equal(await page.locator('[data-testid=video-start]').count(), 0, `${hash}: 動画に入れてしまう`);
    assert.doesNotMatch(await page.locator('#app').textContent(), /エラーがおきました/, `${hash}: エラー画面になった`);
    assert.match(page.url(), /#\/(home|level\/\d)$/, `${hash}: リダイレクトされない`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-002: 前のレベルを全クリア後、未作成のレベルの時代を押すと「じゅんびちゅう」が出ずに unhandled rejection
test('未作成のレベルの時代を押すと「じゅんびちゅう」が出る', async (t) => {
  const lv = missingLevels()[0];
  if (!lv) { t.skip('全レベル作成済み'); return; }
  const cleared = [];
  for (let l = 1; l < lv; l++) cleared.push(...ERA_IDS.map((e) => `${l}-${e}`));
  const { page, context, errors } = await newPage(env, { init: progressScript(cleared) });
  await goto(page, env, '#/home');
  await page.click(`[data-testid=level-${lv}]`);
  await page.waitForURL(new RegExp(`#/level/${lv}$`));
  await page.click('[data-testid=era-jomon]');
  await page.waitForTimeout(500);
  assert.match(await page.locator('#modal-root').textContent(), /じゅんびちゅう/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('レベル1を全クリアするとレベル2が解放されて表示される', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript(ERA_IDS.map((e) => `1-${e}`)) });
  await goto(page, env, '#/home');
  assert.doesNotMatch(await page.locator('[data-testid=level-2]').getAttribute('class'), /locked/);
  assert.match(await page.locator('[data-testid=level-3]').getAttribute('class'), /locked/);
  assert.match(await page.locator('[data-testid=level-1] .lc-prog').textContent(), /14\/14/);
  assert.deepEqual(errors, []);
  await context.close();
});
