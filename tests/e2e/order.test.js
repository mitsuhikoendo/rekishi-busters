// 並べかえ問題の操作：1つもどす・リセット・枠をタップしてはずす・答えたあとは押せない・375×667 でけっていまで押せる。
// ふくしゅうモードに対象の問題を1問だけ入れて、毎回同じ問題を出す。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, progressScript, LEVEL_DATA, heartsLeft, ROOT } from './helpers.js';
import { rubyHtml, rubyPlain } from '../../js/ruby.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

// 並べかえ問題：lv1 縄文（3項目）と、データ中で一番長いもの（4項目以上）
function findOrder(pred) {
  for (const [lv, data] of Object.entries(LEVEL_DATA)) {
    for (const [era, st] of Object.entries(data)) {
      const qi = st.questions.findIndex((q) => q.type === 'order' && pred(q));
      if (qi >= 0) return { lv: Number(lv), era, qi, q: st.questions[qi] };
    }
  }
  return null;
}
const SHORT = { lv: 1, era: 'jomon', qi: LEVEL_DATA[1].jomon.questions.findIndex((q) => q.type === 'order') };
SHORT.q = LEVEL_DATA[1].jomon.questions[SHORT.qi];
let LONG = null;
for (const [lv, data] of Object.entries(LEVEL_DATA)) {
  for (const [era, st] of Object.entries(data)) {
    st.questions.forEach((q, qi) => {
      if (q.type !== 'order') return;
      const n = q.items.reduce((a, c) => a + rubyPlain(c).length, 0) + q.items.length * 10;
      if (n > (LONG?.n ?? 0)) LONG = { lv: Number(lv), era, qi, q, n };
    });
  }
}
assert.ok(findOrder((q) => q.items.length >= 4), '4項目以上の並べかえ問題がデータにある');

async function openOrder(target, { size, clock = false } = {}) {
  const init = progressScript([], {
    review: [{ lv: target.lv, era: target.era, qi: target.qi, added: '2000-01-01' }],
    settings: { sound: false, voice: false, timer: true },
  });
  const ctx = size
    ? await (async () => {
      const context = await env.browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await context.addInitScript(init);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
      return { page, context, errors };
    })()
    : await newPage(env, { init });
  if (clock) await ctx.page.clock.install();
  await goto(ctx.page, env, '#/review');
  await ctx.page.click('[data-testid=battle-start]');
  await ctx.page.waitForSelector('.order-pool .chip');
  return ctx;
}

const pick = (page, i) => page.click(`.order-pool .chip[data-i="${i}"]`);

// 画面の状態をまとめて取る
async function state(page) {
  return page.evaluate(() => ({
    slots: [...document.querySelectorAll('.order-slots .slot')].map((s) => ({ html: s.innerHTML, filled: s.classList.contains('filled'), disabled: s.disabled })),
    chipsDisabled: Object.fromEntries([...document.querySelectorAll('.order-pool .chip')].map((c) => [c.dataset.i, c.disabled])),
    undo: document.querySelector('[data-testid=order-undo]')?.disabled,
    reset: document.querySelector('[data-testid=order-reset]')?.disabled,
    ok: document.querySelector('[data-testid=order-ok]')?.disabled,
  }));
}

// 枠に入っている順番（items の index。空なら null）
function slotOrder(st, q) {
  return st.slots.map((s) => (s.filled ? q.items.findIndex((it) => rubyHtml(it) === s.html) : null));
}

test('はじめは「1つもどす」「リセット」「けってい」が押せず、枠も押せない', async () => {
  const { page, context, errors } = await openOrder(SHORT);
  const st = await state(page);
  assert.equal(st.undo, true);
  assert.equal(st.reset, true);
  assert.equal(st.ok, true);
  assert.ok(st.slots.every((s) => !s.filled && s.disabled));
  assert.deepEqual(st.slots.map((s) => s.html), SHORT.q.items.map((_, i) => String(i + 1)));
  assert.deepEqual(errors, []);
  await context.close();
});

test('「1つもどす」で最後に並べたことばだけがはずれ、カードがまた押せるようになる', async () => {
  const { page, context, errors } = await openOrder(SHORT);
  const q = SHORT.q;
  await pick(page, 2);
  await pick(page, 0);
  let st = await state(page);
  assert.deepEqual(slotOrder(st, q), [2, 0, null]);
  assert.equal(st.undo, false);
  assert.equal(st.reset, false);
  assert.equal(st.chipsDisabled['0'], true);

  await page.click('[data-testid=order-undo]');
  st = await state(page);
  assert.deepEqual(slotOrder(st, q), [2, null, null]);
  assert.equal(st.chipsDisabled['0'], false, 'もどしたカードが押せない');
  assert.equal(st.chipsDisabled['2'], true);
  assert.equal(st.slots[1].html, '2', '空いた枠に番号がもどらない');

  await page.click('[data-testid=order-undo]');
  st = await state(page);
  assert.deepEqual(slotOrder(st, q), [null, null, null]);
  assert.equal(st.undo, true, '何も並べていないのに「1つもどす」が押せる');
  assert.equal(st.reset, true, '何も並べていないのに「リセット」が押せる');
  assert.ok(Object.values(st.chipsDisabled).every((d) => !d));

  // もどしたあとに正しく並べなおすと正解
  for (let i = 0; i < q.items.length; i++) await pick(page, i);
  assert.equal((await state(page)).ok, false);
  await page.click('[data-testid=order-ok]');
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').getAttribute('class'), /\bok\b/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('「リセット」で全部はずれて、はじめの状態にもどる', async () => {
  const { page, context, errors } = await openOrder(SHORT);
  const q = SHORT.q;
  for (const i of [1, 2, 0]) await pick(page, i);
  let st = await state(page);
  assert.equal(st.ok, false, '全部並べたのに「けってい」が押せない');
  await page.click('[data-testid=order-reset]');
  st = await state(page);
  assert.deepEqual(slotOrder(st, q), [null, null, null]);
  assert.deepEqual(st.slots.map((s) => s.html), q.items.map((_, i) => String(i + 1)));
  assert.ok(st.slots.every((s) => s.disabled));
  assert.ok(Object.values(st.chipsDisabled).every((d) => !d));
  assert.equal(st.undo, true);
  assert.equal(st.reset, true);
  assert.equal(st.ok, true);
  // ハートは減っていない（答えたことになっていない）
  assert.equal(await heartsLeft(page), 3);
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('並べたことば（枠）をタップすると、その1つだけはずれ、後ろがつめられる', async () => {
  const { page, context, errors } = await openOrder(SHORT);
  const q = SHORT.q;
  for (const i of [2, 0, 1]) await pick(page, i);
  // まんなかをはずす → [2, 1, 空]
  await page.click('.order-slots .slot[data-pos="1"]');
  let st = await state(page);
  assert.deepEqual(slotOrder(st, q), [2, 1, null]);
  assert.equal(st.chipsDisabled['0'], false);
  assert.equal(st.ok, true, '1つ空いたのに「けってい」が押せる');
  assert.equal(st.slots[2].disabled, true, '空の枠が押せる');
  // 先頭をはずす → [1, 空, 空]
  await page.click('.order-slots .slot[data-pos="0"]');
  st = await state(page);
  assert.deepEqual(slotOrder(st, q), [1, null, null]);
  // 空の枠は押しても何も起きない（force で押す）
  await page.click('.order-slots .slot[data-pos="2"]', { force: true });
  assert.deepEqual(slotOrder(await state(page), q), [1, null, null]);
  // 並べなおして正解
  await page.click('.order-slots .slot[data-pos="0"]');
  for (let i = 0; i < q.items.length; i++) await pick(page, i);
  await page.click('[data-testid=order-ok]');
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').getAttribute('class'), /\bok\b/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('まちがった順で「けってい」すると不正解になる', async () => {
  const { page, context, errors } = await openOrder(SHORT);
  for (const i of [...SHORT.q.items.keys()].reverse()) await pick(page, i);
  await page.click('[data-testid=order-ok]');
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').getAttribute('class'), /\bng\b/);
  assert.equal(await heartsLeft(page), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('「けってい」のあと（アニメ中・解説が出ているとき）は、もどす・リセット・枠・カードが押せない', async () => {
  const { page, context, errors } = await openOrder(SHORT, { clock: true });
  const q = SHORT.q;
  for (let i = 0; i < q.items.length; i++) await pick(page, i);
  await page.click('[data-testid=order-ok]');
  // アニメ中（時計を止めているので解説はまだ出ない）
  assert.equal(await page.locator('[data-testid=feedback]').count(), 0);
  const st = await state(page);
  assert.equal(st.undo, true, 'アニメ中に「1つもどす」が押せる');
  assert.equal(st.reset, true, 'アニメ中に「リセット」が押せる');
  assert.equal(st.ok, true, 'アニメ中に「けってい」が押せる');
  assert.ok(st.slots.every((s) => s.disabled), 'アニメ中に枠が押せる');
  assert.ok(Object.values(st.chipsDisabled).every((d) => d), 'アニメ中にカードが押せる');
  // 無理に押しても（disabled を外して click しても）変わらない
  const before = slotOrder(st, q);
  await page.evaluate(() => {
    for (const sel of ['[data-testid=order-undo]', '[data-testid=order-reset]', '.order-slots .slot[data-pos="0"]', '.order-pool .chip']) {
      const b = document.querySelector(sel);
      b.disabled = false;
      b.click();
    }
  });
  assert.deepEqual(slotOrder(await state(page), q), before, 'アニメ中にもどす・リセット・枠のタップが効いてしまう');
  // 解説が出たら、並べかえのボタンはもう無い（または押せない）
  await page.clock.runFor(5000);
  await page.waitForSelector('[data-testid=feedback]');
  for (const sel of ['[data-testid=order-undo]', '[data-testid=order-reset]', '[data-testid=order-ok]', '.order-slots .slot', '.order-pool .chip']) {
    const n = await page.locator(`${sel}:not([disabled])`).count();
    assert.equal(n, 0, `解説が出ているときに ${sel} が押せる`);
  }
  assert.match(await page.locator('[data-testid=feedback]').getAttribute('class'), /\bok\b/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('時間切れのあとも、もどす・リセット・枠が押せない', async () => {
  const { page, context, errors } = await openOrder(SHORT, { clock: true });
  await pick(page, 1);
  await page.clock.fastForward(46_000);
  await page.clock.runFor(200);
  const st = await state(page);
  if (await page.locator('[data-testid=feedback]').count() === 0) {
    assert.equal(st.undo, true);
    assert.equal(st.reset, true);
    assert.ok(st.slots.every((s) => s.disabled));
  }
  await page.clock.runFor(5000);
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').textContent(), /じかんぎれ/);
  assert.equal(await page.locator('[data-testid=order-undo]:not([disabled]), [data-testid=order-reset]:not([disabled]), .order-slots .slot:not([disabled])').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test(`375×667：一番長い並べかえ（lv${LONG.lv}.${LONG.era}、${LONG.q.items.length}項目）で、「けってい！」までスクロールして押せる`, async () => {
  const size = { width: 375, height: 667 };
  const { page, context, errors } = await openOrder(LONG, { size });
  const q = LONG.q;
  for (let i = 0; i < q.items.length; i++) await pick(page, i);
  // 横にはみ出さない
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= size.width, `横スクロールが出る（${sw}）`);
  // 「けってい！」までスクロールすると、画面内にあり、ほかの要素にかくれていない
  const ok = page.locator('[data-testid=order-ok]');
  await ok.scrollIntoViewIfNeeded();
  const vis = await ok.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inView: r.top >= 0 && r.bottom <= window.innerHeight, onTop: top === b || b.contains(top), w: Math.round(r.width), vw: window.innerWidth };
  });
  assert.ok(vis.inView, '「けってい！」がスクロールしても画面内に入らない');
  assert.ok(vis.onTop, '「けってい！」がほかの要素にかくれている');
  assert.ok(vis.w >= vis.vw * 0.7, `「けってい！」が横いっぱいになっていない（幅 ${vis.w}px）`);
  await page.screenshot({ path: `${ROOT}tests/e2e/screenshots/375x667-order-ok-scrolled.png` });
  await ok.click();
  await page.waitForSelector('[data-testid=feedback]');
  assert.match(await page.locator('[data-testid=feedback]').getAttribute('class'), /\bok\b/);
  assert.deepEqual(errors, []);
  await context.close();
});
