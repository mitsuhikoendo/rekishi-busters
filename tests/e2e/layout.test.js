// スマホ（390×844 / 375×667）でのレイアウト確認。データ中で一番長い字幕・選択肢・並べかえ・解説を使う。
// スクリーンショットは tests/e2e/screenshots/ に保存（目視確認用）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startEnv, goto, progressScript, LEVEL_DATA, clickAnswer, ROOT } from './helpers.js';
import { ERA_IDS } from '../../data/eras.js';
import { rubyPlain } from '../../js/ruby.js';

const SHOT_DIR = `${ROOT}tests/e2e/screenshots`;
mkdirSync(SHOT_DIR, { recursive: true });
const SIZES = [{ width: 390, height: 844 }, { width: 375, height: 667 }];

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

// データの中から一番長いものを探す
function findMax(score) {
  let best = null;
  for (const [lv, data] of Object.entries(LEVEL_DATA)) {
    for (const [era, st] of Object.entries(data)) {
      st.questions.forEach((q, qi) => {
        const s = score(q);
        if (s > (best?.s ?? -1)) best = { lv: Number(lv), era, qi, q, s };
      });
    }
  }
  return best;
}
const len = (t) => rubyPlain(t).length;
const LONG_CHOICE = findMax((q) => ((q.type || 'choice') === 'choice' ? Math.max(...q.choices.map(len)) * 4 + q.choices.reduce((a, c) => a + len(c), 0) + len(q.q) : -1));
const LONG_ORDER = findMax((q) => (q.type === 'order' ? q.items.reduce((a, c) => a + len(c), 0) + q.items.length * 10 + len(q.q) : -1));
const LONG_EXP = findMax((q) => len(q.exp) + len(q.q));
let LONG_ITEM = null;
for (const [lv, data] of Object.entries(LEVEL_DATA)) {
  for (const [era, st] of Object.entries(data)) {
    if (era === ERA_IDS.at(-1)) continue; // 「つぎの時代へ」が出るステージにする
    const n = len(st.item.desc) + len(st.item.name) * 2;
    if (n > (LONG_ITEM?.n ?? 0)) LONG_ITEM = { lv: Number(lv), era, n };
  }
}
let LONG_SCENE = null;
for (const [lv, data] of Object.entries(LEVEL_DATA)) {
  for (const [era, st] of Object.entries(data)) {
    st.video.forEach((sc, i) => { if (len(sc.text) > (LONG_SCENE?.n ?? 0)) LONG_SCENE = { lv: Number(lv), era, i, n: len(sc.text), text: sc.text }; });
  }
}

function allCleared() {
  const ids = [];
  for (let l = 1; l <= 6; l++) ids.push(...ERA_IDS.map((e) => `${l}-${e}`));
  return ids;
}

async function pageFor(size, extra = {}) {
  const context = await env.browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await context.addInitScript(progressScript(allCleared(), { settings: { sound: false, voice: false, timer: false }, ...extra }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, context, errors };
}

// 横にはみ出していないこと
async function assertNoHorizontalOverflow(page, where) {
  const r = await page.evaluate(() => {
    const w = window.innerWidth;
    const out = [...document.querySelectorAll('#app *, #modal-root *')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > w + 1 || b.left < -1); })
      .filter((el) => !el.closest('.weapon-fly, .fx, .confetti, .art-bg, .scene-art'))
      .slice(0, 5).map((el) => `${el.tagName}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`);
    return { sw: document.documentElement.scrollWidth, w, out };
  });
  assert.ok(r.sw <= r.w, `${where}: 横スクロールが出る（scrollWidth=${r.sw} > ${r.w}）`);
  assert.deepEqual(r.out, [], `${where}: 画面の横からはみ出す要素`);
}

// 要素が画面内（スクロールなし）に全部見えていること
async function inViewport(page, sel) {
  await page.evaluate(() => window.scrollTo(0, 0)); // クリック時の自動スクロールを戻してから測る
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => {
    const b = el.getBoundingClientRect();
    return { ok: b.top >= 0 && b.bottom <= window.innerHeight + 1 && b.left >= 0 && b.right <= window.innerWidth + 1, bottom: Math.round(b.bottom), h: window.innerHeight };
  }), sel);
}

// ボタンの文字色と、実際に見える背景色（ボタン→親へと半透明を重ねる）のコントラスト比が 3 未満のものを返す
async function lowContrastButtons(page, sel) {
  return page.$$eval(sel, (bs) => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 1) break;
      }
      let out = { r: 255, g: 255, b: 255 };
      for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) };
      return out;
    };
    return bs.map((b) => {
      const fg = parse(getComputedStyle(b).color);
      const L1 = lum(fg); const L2 = lum(bgOf(b));
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return { text: b.textContent.trim(), ratio: Math.round(ratio * 100) / 100 };
    }).filter((x) => x.ratio < 3).map((x) => `${x.text}（${x.ratio}）`);
  });
}

async function shot(page, name, size) {
  await page.screenshot({ path: `${SHOT_DIR}/${size.width}x${size.height}-${name}.png` });
}

for (const size of SIZES) {
  const tag = `${size.width}×${size.height}`;

  test(`${tag}: ホーム・マップ・図鑑が横にはみ出さない`, async () => {
    const { page, context, errors } = await pageFor(size, { review: [{ lv: 1, era: 'jomon', qi: 0, added: '2000-01-01' }] });
    for (const [hash, name] of [['#/home', 'home'], ['#/level/6', 'map'], ['#/zukan', 'zukan']]) {
      await goto(page, env, hash);
      await page.waitForTimeout(300);
      await assertNoHorizontalOverflow(page, `${tag} ${hash}`);
      await shot(page, name, size);
    }
    await goto(page, env, '#/level/1');
    await page.click('[data-testid=era-jomon]');
    await page.waitForSelector('.stage-modal');
    const mv = await inViewport(page, '.stage-modal [data-testid=btn-battle]');
    assert.ok(mv[0].ok, `${tag}: 時代メニューのバトルボタンが画面外`);
    await shot(page, 'era-modal', size);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 動画の一番長い字幕（${LONG_SCENE.n}文字）が全部読める`, async () => {
    const { page, context, errors } = await pageFor(size);
    await goto(page, env, `#/video/${LONG_SCENE.lv}/${LONG_SCENE.era}`);
    await page.click('[data-testid=video-start]');
    await page.click('#play'); // 止めてから目的の場面へ
    for (let k = 0; k < LONG_SCENE.i; k++) {
      await page.click('#next');
      await page.click('#play');
    }
    await page.waitForTimeout(800);
    await shot(page, 'video-long-caption', size);
    const cap = await page.evaluate(() => {
      const c = document.querySelector('.scene-caption');
      const s = c.firstElementChild;
      const cb = c.getBoundingClientRect();
      const sb = s.getBoundingClientRect();
      return { capTop: cb.top, capBottom: cb.bottom, textTop: sb.top, textBottom: sb.bottom, scrollH: c.scrollHeight, clientH: c.clientHeight, vh: window.innerHeight };
    });
    // 文字の先頭が字幕の枠より上に切れていない（flex の中央寄せ＋overflow で上が読めなくなる問題）
    assert.ok(cap.textTop >= cap.capTop - 1, `${tag}: 字幕の上の行が枠の外に切れて読めない（text.top=${Math.round(cap.textTop)} < 枠.top=${Math.round(cap.capTop)}）`);
    assert.ok(cap.textBottom <= cap.capBottom + 1, `${tag}: 字幕の下の行が枠の外に切れて読めない`);
    assert.ok(cap.capBottom <= cap.vh, `${tag}: 字幕が画面外`);
    const ctl = await inViewport(page, '.controls .ctl');
    assert.ok(ctl.every((x) => x.ok), `${tag}: 動画の操作ボタンが画面外（bottom=${ctl.map((x) => x.bottom)}, h=${size.height}）`);
    await assertNoHorizontalOverflow(page, `${tag} video`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 一番長い4択（lv${LONG_CHOICE.lv}.${LONG_CHOICE.era}[${LONG_CHOICE.qi}]）がスクロールなしで全部見える`, async () => {
    const { page, context, errors } = await pageFor(size, { review: [{ lv: LONG_CHOICE.lv, era: LONG_CHOICE.era, qi: LONG_CHOICE.qi, added: '2000-01-01' }] });
    await goto(page, env, '#/review');
    await page.click('[data-testid=battle-start]');
    await page.waitForSelector('.choices .choice');
    await page.waitForTimeout(300);
    await shot(page, 'battle-choice', size);
    await assertNoHorizontalOverflow(page, `${tag} choice`);
    const v = await inViewport(page, '[data-testid=question], .choices .choice');
    assert.ok(v.every((x) => x.ok), `${tag}: 問題文か選択肢が画面外（bottom=${v.map((x) => x.bottom)}, h=${size.height}）`);
    // 選択肢の文字がボタンからはみ出さない
    const clipped = await page.$$eval('.choices .choice', (bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).length);
    assert.equal(clipped, 0, `${tag}: 選択肢の文字がボタンからはみ出す`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 一番長い並べかえ（lv${LONG_ORDER.lv}.${LONG_ORDER.era}[${LONG_ORDER.qi}]）が、全部入れたあともスクロールなしで「けってい」まで押せる`, async () => {
    const { page, context, errors } = await pageFor(size, { review: [{ lv: LONG_ORDER.lv, era: LONG_ORDER.era, qi: LONG_ORDER.qi, added: '2000-01-01' }] });
    await goto(page, env, '#/review');
    await page.click('[data-testid=battle-start]');
    await page.waitForSelector('.order-pool .chip');
    await shot(page, 'battle-order', size);
    for (let i = 0; i < LONG_ORDER.q.items.length; i++) await page.click(`.order-pool .chip[data-i="${i}"]`);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'battle-order-filled', size);
    await assertNoHorizontalOverflow(page, `${tag} order`);
    assert.deepEqual(await lowContrastButtons(page, '.order-actions .btn'), [], `${tag}: 並べかえのボタンの文字が背景と同じ色で読めない`);
    const v = await inViewport(page, '[data-testid=question], .order-pool .chip, #order-ok');
    assert.ok(v.every((x) => x.ok), `${tag}: 並べかえの問題・カード・けっていボタンが画面外（bottom=${v.map((x) => x.bottom)}, h=${size.height}）`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 並べかえの「やりなおす」「けってい」の文字が読める`, async () => {
    const { page, context, errors } = await pageFor(size, { review: [{ lv: 1, era: 'jomon', qi: LEVEL_DATA[1].jomon.questions.findIndex((q) => q.type === 'order'), added: '2000-01-01' }] });
    await goto(page, env, '#/review');
    await page.click('[data-testid=battle-start]');
    await page.waitForSelector('.order-pool .chip');
    for (let i = 0; i < 3; i++) await page.click(`.order-pool .chip[data-i="${i}"]`);
    assert.deepEqual(await lowContrastButtons(page, '.order-actions .btn'), [], `${tag}: 並べかえのボタンの文字が背景と同じ色で読めない`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 一番長い解説（lv${LONG_EXP.lv}.${LONG_EXP.era}[${LONG_EXP.qi}]）で「つぎへ」がほぼスクロールなしで押せる`, async () => {
    const { page, context, errors } = await pageFor(size, { review: [{ lv: LONG_EXP.lv, era: LONG_EXP.era, qi: LONG_EXP.qi, added: '2000-01-01' }] });
    await goto(page, env, '#/review');
    await page.click('[data-testid=battle-start]');
    await clickAnswer(page, false, LONG_EXP);
    await page.waitForSelector('[data-testid=feedback]');
    await page.waitForTimeout(300);
    await shot(page, 'battle-feedback', size);
    await assertNoHorizontalOverflow(page, `${tag} feedback`);
    // 解説画面は時間制限がないので、少しのスクロールは許容する（画面の高さ+40px まで）
    const v = await inViewport(page, '[data-testid=next]');
    assert.ok(v[0].bottom <= size.height + 40, `${tag}: 解説が長いと「つぎへ」がかなり下（bottom=${v[0].bottom}, h=${size.height}）`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: クリア画面（一番長いアイテム説明 lv${LONG_ITEM.lv}.${LONG_ITEM.era}）：カードが切れず、ボタンの文字が読める`, async () => {
    const { page, context, errors } = await pageFor(size);
    await page.clock.install();
    await goto(page, env, `#/battle/${LONG_ITEM.lv}/${LONG_ITEM.era}`);
    await page.click('[data-testid=battle-start]');
    for (let n = 0; n < 10; n++) {
      await clickAnswer(page, true, LONG_ITEM);
      await page.clock.runFor(4000);
      const label = await page.locator('[data-testid=next]').textContent();
      await page.click('[data-testid=next]');
      if (label.includes('けっか')) break;
    }
    await page.waitForSelector('[data-testid=result]');
    await page.clock.runFor(1000);
    await page.waitForTimeout(800); // CSS アニメ（popin）は実時間
    await shot(page, 'result', size);
    await assertNoHorizontalOverflow(page, `${tag} result`);
    const v = await inViewport(page, '[data-testid=next-era], [data-testid=next-level]');
    assert.ok(v[0].ok, `${tag}: 「つぎへ」ボタンが画面外（bottom=${v[0].bottom}, h=${size.height}）`);
    const card = await page.evaluate(() => {
      const a = document.querySelector('.arena').getBoundingClientRect();
      const c = document.querySelector('[data-testid=item-card]').getBoundingClientRect();
      return { arenaBottom: Math.round(a.bottom), cardBottom: Math.round(c.bottom) };
    });
    assert.ok(card.cardBottom <= card.arenaBottom, `${tag}: アイテムカードの下が切れる（card.bottom=${card.cardBottom} > arena.bottom=${card.arenaBottom}）`);
    assert.deepEqual(await lowContrastButtons(page, '.result-actions .btn'), [], `${tag}: クリア画面のボタンの文字が背景と同じ色で読めない`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${tag}: 負け画面のボタンの文字が読める`, async () => {
    const { page, context, errors } = await pageFor(size);
    await page.clock.install();
    await goto(page, env, '#/battle/1/jomon');
    await page.click('[data-testid=battle-start]');
    for (let n = 0; n < 3; n++) {
      await clickAnswer(page, false, { lv: 1, era: 'jomon' });
      await page.clock.runFor(4000);
      await page.click('[data-testid=next]');
    }
    await page.waitForSelector('[data-testid=lose]');
    await page.waitForTimeout(500);
    await shot(page, 'lose', size);
    assert.deepEqual(await lowContrastButtons(page, '.result-actions .btn'), [], `${tag}: 負け画面のボタンの文字が背景と同じ色で読めない`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
