// 時代べつまとめ（#/eras・#/era/<era>・#/eravideo・#/erabattle）と、前の保存データの引きつぎ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, LEVEL_DATA, clickAnswer, passRetry } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';
import { LEGACY_JSON, LEGACY_SAVE, LEGACY_TODAY } from '../fixtures/legacySave.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const KEY = 'rekishi-busters-v1';
const QUIET = { sound: false, voice: false, timer: true };

// 前の保存データを最初の1回だけ入れる
const LEGACY_INIT = `if (!sessionStorage.getItem('__seeded')) {
  localStorage.setItem('${KEY}', ${JSON.stringify(LEGACY_JSON)});
  localStorage.setItem('rekishi-busters-debug-date', '${LEGACY_TODAY}');
  sessionStorage.setItem('__seeded', '1');
}`;

const raw = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const parsed = async (page) => JSON.parse(await raw(page));

function levelOf(era, q) {
  for (const [lv, data] of Object.entries(LEVEL_DATA)) if (data[era]?.questions.includes(q)) return Number(lv);
  return null;
}

// まとめバトルを最後まで。mistakes 回まちがえる。出た問題のレベルを返す。
async function playEraBattle(page, era, { mistakes = 0, untilLose = false } = {}) {
  await page.click('[data-testid=battle-start]');
  const seen = [];
  let m = 0;
  for (let n = 0; n < 30; n++) {
    const wrong = untilLose || m < mistakes;
    if (wrong) m++;
    const q = await clickAnswer(page, !wrong, { era });
    seen.push({ lv: levelOf(era, q), q });
    await page.clock.runFor(5000);
    await page.waitForSelector('[data-testid=feedback]');
    const label = await page.locator('[data-testid=next]').textContent();
    if (label.includes('けっか')) { await page.click('[data-testid=next]'); break; }
    if (wrong) await passRetry(page, { scope: { era }, clock: true }); // れんしゅうを正解で通す
    else await page.click('[data-testid=next]');
  }
  return seen;
}

async function skipVideoToEnd(page) {
  await page.click('[data-testid=video-start]');
  const total = await page.locator('#dots i').count();
  for (let i = 0; i < total + 5 && !(await page.locator('[data-testid=video-to-battle]').isVisible()); i++) await page.click('#next');
  await page.waitForSelector('[data-testid=video-to-battle]', { state: 'visible' });
  return total;
}

// ---- 前の保存データの引きつぎ ----
test('前の保存データ：ホーム・マップ・図鑑・コイン・ふくしゅう・ストリークが元のまま', async () => {
  const { page, context, errors } = await newPage(env, { init: LEGACY_INIT });
  await goto(page, env, '#/home');
  await page.waitForSelector('[data-testid=eras-btn]');
  const prog = (lv) => page.locator(`[data-testid=level-${lv}] .lc-prog`).textContent();
  assert.equal(await prog(1), '14/14');
  assert.equal(await prog(2), '14/14');
  assert.equal(await prog(3), '5/14');
  assert.match(await page.locator('[data-testid=level-4]').getAttribute('class'), /locked/);
  const hud = await page.locator('.hud').textContent();
  assert.match(hud, /1234/, 'コイン');
  assert.match(hud, /5日/, 'ストリーク');
  assert.match(hud, /33こ/, 'アイテム数');
  assert.match(await page.locator('[data-testid=review-btn]').textContent(), /2\s*問/);
  // マップの★
  await page.goto(`${env.base}#/level/3`);
  await page.waitForSelector('[data-testid=era-heian]');
  for (const [i, era] of ERA_IDS.slice(0, 5).entries()) {
    assert.equal(await page.locator(`[data-testid=era-${era}] .stars`).textContent(), i === 2 ? '★☆☆' : '★★☆', era);
  }
  assert.doesNotMatch(await page.locator('[data-testid=era-heian]').getAttribute('class'), /locked|cleared/);
  assert.match(await page.locator('[data-testid=era-kamakura]').getAttribute('class'), /locked/);
  await page.click('[data-testid=era-heian]');
  assert.doesNotMatch(await page.locator('[data-testid=btn-battle]').getAttribute('class'), /disabled/, '平安は動画を見たのでバトルできる');
  // 図鑑
  await page.goto(`${env.base}#/zukan`);
  await page.waitForSelector('[data-testid=zk-3-nara]');
  assert.match(await page.locator('.bh-sub').textContent(), /33\/84/);
  assert.match(await page.locator('[data-testid=zk-3-nara]').getAttribute('class'), /got/);
  assert.doesNotMatch(await page.locator('[data-testid=zk-3-heian]').getAttribute('class'), /got/);
  // まとめ一覧：レベルモードでの進みぐあい（縄文は Lv1〜3 クリア、平安は Lv1〜2）
  await page.goto(`${env.base}#/eras`);
  await page.waitForSelector('[data-testid=era-card-heian]');
  assert.match(await page.locator('[data-testid=era-card-jomon] .ec-prog').textContent(), /3\/6/);
  assert.match(await page.locator('[data-testid=era-card-heian] .ec-prog').textContent(), /2\/6/);
  await page.click('[data-testid=era-card-nara]');
  await page.waitForSelector('[data-testid=era-video-6]');
  assert.equal(await page.locator('.elr-done').count(), 3, '奈良のまとめページの ✅ が Lv1〜3 の3つでない');
  // 開いただけでは stages・items・coins・review・streak・settings は変わらない（ミッションだけ日付で選びなおし）
  const s = await parsed(page);
  for (const k of ['stages', 'items', 'coins', 'review', 'streak', 'settings']) assert.deepEqual(s[k], LEGACY_SAVE[k], k);
  assert.deepEqual(errors, []);
  await context.close();
});

test('前の保存データ：まとめ動画・まとめバトル（勝ち・負け）で遊んでも stages と items は1バイトも変わらない', async () => {
  const { page, context, errors } = await newPage(env, { init: LEGACY_INIT });
  await page.clock.install();
  await goto(page, env, '#/home');
  const before = await parsed(page);
  const stagesJson = JSON.stringify(before.stages);
  const itemsJson = JSON.stringify(before.items);

  // まだ遊べない時代（Lv3 鎌倉は未解放、Lv4〜6 も未解放）のまとめ
  await page.click('[data-testid=eras-btn]');
  await page.click('[data-testid=era-card-kamakura]');
  await page.waitForURL(/#\/era\/kamakura$/);
  await page.click('[data-testid=era-video-all]');
  await skipVideoToEnd(page);
  await page.click('[data-testid=video-to-battle]');
  await page.waitForURL(/#\/erabattle\/kamakura$/);
  await playEraBattle(page, 'kamakura');
  await page.waitForSelector('[data-testid=result]');
  // レベルごとの動画（Lv5）と、平安（Lv3 は動画だけ見た）のまとめ
  await page.goto(`${env.base}#/eravideo/heian/5`);
  await skipVideoToEnd(page);
  await page.goto(`${env.base}#/eravideo/heian/3`);
  await skipVideoToEnd(page);
  // 負け
  await page.goto(`${env.base}#/erabattle/heian`);
  await playEraBattle(page, 'heian', { untilLose: true });
  await page.waitForSelector('[data-testid=lose]');

  const after = await parsed(page);
  assert.equal(JSON.stringify(after.stages), stagesJson, 'stages が変わった');
  assert.equal(JSON.stringify(after.items), itemsJson, 'items が変わった');
  assert.deepEqual(after.settings, LEGACY_SAVE.settings);
  assert.equal(after.eras.kamakura.plays, 1);
  assert.equal(after.eras.heian, undefined, '負けたのに eras に記録された');
  assert.ok(after.coins > LEGACY_SAVE.coins, 'まとめバトルの勝ちでコインがふえない');
  // まちがえた問題は、ふくしゅうに入る（前のものは消えない）
  for (const r of LEGACY_SAVE.review) assert.ok(after.review.some((x) => x.lv === r.lv && x.era === r.era && x.qi === r.qi), JSON.stringify(r));
  assert.ok(after.review.filter((x) => x.era === 'heian').length >= 3, 'まちがえた問題がふくしゅうに入っていない');

  // 画面上も元のまま
  await page.goto(`${env.base}#/home`);
  await page.waitForSelector('[data-testid=level-3]');
  assert.equal(await page.locator('[data-testid=level-3] .lc-prog').textContent(), '5/14');
  assert.match(await page.locator('[data-testid=level-4]').getAttribute('class'), /locked/);
  await page.goto(`${env.base}#/level/3`);
  await page.waitForSelector('[data-testid=era-kamakura]');
  assert.match(await page.locator('[data-testid=era-kamakura]').getAttribute('class'), /locked/, 'まとめで遊んだらレベル3の鎌倉が解放された');
  await page.goto(`${env.base}#/zukan`);
  await page.waitForSelector('.bh-sub');
  assert.match(await page.locator('.bh-sub').textContent(), /33\/84/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('時代べつの動画を最後まで見ても、そのレベルの watched はつかない（バトルは動画を見るまでロックのまま）', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  await goto(page, env, '#/eravideo/jomon/1');
  await skipVideoToEnd(page);
  assert.equal((await parsed(page)).stages['1-jomon'], undefined);
  await page.goto(`${env.base}#/battle/1/jomon`);
  await page.waitForURL(/#\/video\/1\/jomon$/);
  assert.deepEqual(errors, []);
  await context.close();
});

// ---- 全14時代 ----
test('全14時代：一覧→まとめページが開け、Lv1〜6 の見るボタンがそろい、「ぜんぶ」の動画が最後まで行ける', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  await goto(page, env, '#/eras');
  assert.equal(await page.locator('[data-testid^=era-card-]').count(), 14);
  for (const era of ERA_IDS) {
    await page.goto(`${env.base}#/eras`);
    await page.click(`[data-testid=era-card-${era}]`);
    await page.waitForURL(new RegExp(`#/era/${era}$`));
    await page.waitForSelector('[data-testid=era-video-6]');
    assert.doesNotMatch(await page.locator('.era-lv-list').textContent(), /よみこめなかった/, era);
    for (let lv = 1; lv <= 6; lv++) {
      assert.equal(await page.locator(`[data-testid=era-video-${lv}]`).getAttribute('href'), `#/eravideo/${era}/${lv}`, `${era} lv${lv}`);
    }
    await page.click('[data-testid=era-video-all]');
    const total = await skipVideoToEnd(page);
    const expected = [1, 2, 3, 4, 5, 6].reduce((a, lv) => a + LEVEL_DATA[lv][era].video.length + 1, 0);
    assert.equal(total, expected, `${era}: 場面の数（各レベルの動画＋見出し6つ）`);
    await page.click('[data-testid=video-to-battle]');
    await page.waitForURL(new RegExp(`#/erabattle/${era}$`));
    await page.waitForSelector('[data-testid=battle-start]');
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('レベルごとの「見る」：その時代・そのレベルの動画だけが流れる（見出しなし）', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  for (const [era, lv] of [['jomon', 1], ['nara', 4], ['heisei', 6]]) {
    await goto(page, env, `#/era/${era}`);
    await page.click(`[data-testid=era-video-${lv}]`);
    await page.waitForURL(new RegExp(`#/eravideo/${era}/${lv}$`));
    assert.equal(await skipVideoToEnd(page), LEVEL_DATA[lv][era].video.length, `${era} lv${lv}`);
    assert.match(await page.locator('[data-testid=video-to-battle]').textContent(), /まとめバトル/);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('まちがったURL：知らない時代・レベルはまとめ一覧／まとめページにもどる', async () => {
  const { page, context, errors } = await newPage(env);
  for (const [hash, want] of [['#/era/nope', /#\/eras$/], ['#/eravideo/nope/all', /#\/eras$/], ['#/eravideo/jomon/7', /#\/era\/jomon$/], ['#/eravideo/jomon/0', /#\/era\/jomon$/], ['#/erabattle/nope', /#\/eras$/]]) {
    await page.goto(`${env.base}${hash}`);
    await page.waitForURL(want);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

// ---- まとめバトル ----
test('まとめバトル：ザコ3体（HP1）＋Lv6のボス（HP4）、レベルごとに2問まで、勝つと★とコインが残る。2回目以降もベストが残る', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  await page.clock.install();
  await goto(page, env, '#/erabattle/jomon');
  await page.waitForSelector('[data-testid=battle-start]');
  assert.match(await page.locator('#ecount').textContent(), /1\/4/);
  assert.match(await page.locator('.intro').textContent(), new RegExp(LEVEL_DATA[6].jomon.boss.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1').slice(0, 2)));
  const seen = await playEraBattle(page, 'jomon');
  await page.waitForSelector('[data-testid=result]');
  assert.equal(seen.length, 3 + 4, '勝つのに必要な正解の数（ザコ3＋ボス4）');
  const perLv = {};
  for (const s of seen) { assert.ok(s.lv, '出た問題が縄文のどのレベルにもない'); perLv[s.lv] = (perLv[s.lv] || 0) + 1; }
  assert.ok(Object.values(perLv).every((n) => n <= 2), `1つのレベルから3問以上出た ${JSON.stringify(perLv)}`);
  assert.equal(new Set(seen.map((s) => s.q)).size, seen.length, '同じ問題が2回出た');
  assert.equal(await page.locator('.result-stars').textContent(), '★★★');
  assert.match(await page.locator('[data-testid=result]').textContent(), /まとめクリア/);
  assert.equal(await page.locator('[data-testid=item-card]').count(), 0, 'まとめバトルでアイテムが出た');
  let s = await parsed(page);
  assert.deepEqual(s.eras.jomon, { stars: 3, plays: 1 });
  assert.equal(s.coins, 3 * 10 + 30);
  assert.deepEqual(s.stages, {});
  assert.deepEqual(s.items, []);

  // 2回目：2回まちがえて★1 → ベストは★3のまま、plays は2
  await page.click('#again');
  await page.waitForSelector('[data-testid=battle-start]');
  await playEraBattle(page, 'jomon', { mistakes: 2 });
  await page.waitForSelector('[data-testid=result]');
  assert.equal(await page.locator('.result-stars').textContent(), '★☆☆');
  s = await parsed(page);
  assert.deepEqual(s.eras.jomon, { stars: 3, plays: 2 });
  // まとめページと一覧に反映
  await page.click('.result-actions a.btn.ghost');
  await page.waitForURL(/#\/era\/jomon$/);
  await page.waitForSelector('.ea-best');
  assert.match(await page.locator('.ea-best').textContent(), /★★★.*2\s*回/);
  await page.goto(`${env.base}#/eras`);
  assert.match(await page.locator('[data-testid=era-card-jomon] .stars').textContent(), /★★★/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('まとめバトル：負け→負け画面→リトライでやりなおせる。「まとめて見なおす」でまとめ動画へ', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  await page.clock.install();
  await goto(page, env, '#/erabattle/edo');
  await playEraBattle(page, 'edo', { untilLose: true });
  await page.waitForSelector('[data-testid=lose]');
  const s = await parsed(page);
  assert.equal(s.eras.edo, undefined);
  assert.equal(s.review.length, 3);
  assert.ok(s.review.every((r) => r.era === 'edo' && r.lv >= 1 && r.lv <= 6));
  await page.click('[data-testid=retry]');
  await page.waitForSelector('[data-testid=battle-start]');
  assert.match(page.url(), /#\/erabattle\/edo$/);
  await playEraBattle(page, 'edo', { untilLose: true });
  await page.waitForSelector('[data-testid=lose]');
  await page.click('a[href="#/eravideo/edo/all"]');
  await page.waitForURL(/#\/eravideo\/edo\/all$/);
  await page.waitForSelector('[data-testid=video-start]');
  assert.deepEqual(errors, []);
  await context.close();
});

// BUG-019
test('まとめバトル：全14時代で敵が4体（ザコ3＋ボス）になる', async () => {
  const { page, context, errors } = await newPage(env, { init: progressScript([], { settings: QUIET }) });
  const bad = [];
  for (const era of ERA_IDS) {
    await page.goto(`${env.base}#/erabattle/${era}`);
    await page.waitForSelector('[data-testid=battle-start]');
    const c = await page.locator('#ecount').textContent();
    if (!/\/4$/.test(c.trim())) bad.push(`${era}（${c.trim()}）`);
  }
  assert.deepEqual(bad, [], '敵が4体でない時代');
  assert.deepEqual(errors, []);
  await context.close();
});
