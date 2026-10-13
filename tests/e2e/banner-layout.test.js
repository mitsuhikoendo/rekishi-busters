// 敵の名前の看板（#ename）が、スマホ2サイズで、長い名前でもはみ出さないか（ふつうの問題・並べかえ is-order の両方）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, goto, progressScript, LEVEL_DATA, clickAnswer } from './helpers.js';
import { SHOT_DIR } from './layoutUtil.js';
import { ERAS, ERA_IDS } from '../../data/eras.js';
import { rubyHtml, rubyPlain } from '../../js/ruby.js';

const SIZES = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
// 看板の名前は「おぼえられるように大きく」。fitBanner で小さくしても、この大きさ以上は保つ
const MIN_FONT_PX = 16;
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

// 敵として出る名前すべて（時代の人物・各レベルのボス・ふくしゅうのオバケ）
const NAMES = new Map();
for (const e of ERAS) for (const c of e.characters) NAMES.set(c.name, { boss: false, where: `人物 ${e.id}` });
for (const [lv, data] of Object.entries(LEVEL_DATA)) {
  for (const [era, st] of Object.entries(data)) NAMES.set(st.boss.name, { boss: true, where: `ボス lv${lv}.${era}` });
}
NAMES.set('わすれんぼオバケ', { boss: true, where: 'ふくしゅう' });
const LONGEST = [...NAMES.keys()].sort((a, b) => rubyPlain(b).length - rubyPlain(a).length)[0];

async function pageFor(size, init) {
  const context = await env.browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, context, errors };
}

// 看板の測定：はみ出し・行数・敵のHPバーや敵との重なり
async function measure(page) {
  return page.evaluate(() => {
    const b = document.querySelector('[data-testid=enemy-name]');
    const a = document.querySelector('#arena').getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const hp = document.querySelector('#ehp').getBoundingClientRect();
    const en = document.querySelector('#enemy').getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(b).lineHeight);
    return {
      overflowX: b.scrollWidth > b.clientWidth + 1,
      outside: r.left < a.left - 1 || r.right > a.right + 1 || r.top < a.top - 1,
      lines: Math.round((r.height - parseFloat(getComputedStyle(b).paddingTop) - parseFloat(getComputedStyle(b).paddingBottom)) / lh),
      coversHp: r.bottom > hp.top + 1,
      coversEnemy: r.bottom > en.top + en.height * 0.25,
      bottom: Math.round(r.bottom), hpTop: Math.round(hp.top), enemyTop: Math.round(en.top),
      fontPx: parseFloat(getComputedStyle(b).fontSize),
      scroll: b.classList.contains('scroll'),
    };
  });
}

async function setName(page, name, boss) {
  await page.evaluate(([html]) => { document.querySelector('[data-testid=enemy-name]').innerHTML = html; },
    [`${boss ? '<b class="boss-tag">BOSS</b>' : ''}${rubyHtml(name)}`]);
}

for (const size of SIZES) {
  const tag = `${size.width}×${size.height}`;

  test(`${tag}: いちばん長い名前（${rubyPlain(LONGEST)}）が実際のバトルで看板からはみ出さず、敵やHPバーにかぶらない`, async () => {
    // Lv5 安土桃山のボス（ザビエル）まで進める
    const cleared = [];
    for (let l = 1; l <= 4; l++) cleared.push(...ERA_IDS.map((e) => `${l}-${e}`));
    cleared.push(...ERA_IDS.slice(0, ERA_IDS.indexOf('azuchi')).map((e) => `5-${e}`));
    const { page, context, errors } = await pageFor(size, progressScript(cleared, {
      settings: { sound: false, voice: false, timer: true },
      stages: Object.fromEntries([...cleared.map((id) => [id, { stars: 3, cleared: true, watched: true }]), ['5-azuchi', { stars: 0, cleared: false, watched: true }]]),
    }));
    assert.equal(LEVEL_DATA[5].azuchi.boss.name, LONGEST, 'いちばん長い名前が Lv5 安土桃山のボスでなくなった');
    await page.clock.install();
    await goto(page, env, '#/battle/5/azuchi');
    await page.click('[data-testid=battle-start]');
    for (let n = 0; n < 2; n++) {
      await clickAnswer(page, true, { lv: 5, era: 'azuchi' });
      await page.clock.runFor(5000);
      await page.click('[data-testid=next]');
      await page.waitForSelector('[data-testid=question]');
    }
    assert.ok((await page.locator('[data-testid=enemy-name]').textContent()).includes('ザビエル'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOT_DIR}/${size.width}x${size.height}-banner-longest.png` });
    const m = await measure(page);
    assert.equal(m.overflowX, false, `${tag}: 名前が看板から横にはみ出す`);
    assert.equal(m.outside, false, `${tag}: 看板がアリーナの外に出る`);
    assert.equal(m.coversHp, false, `${tag}: 看板が敵のHPバーにかぶる（看板の下=${m.bottom}, HP=${m.hpTop}, ${m.lines}行）`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  for (const mode of ['ふつう', '並べかえ（is-order）']) {
    test(`${tag}・${mode}: 敵として出るすべての名前（${NAMES.size}こ）が看板からはみ出さず、HPバーにかぶらない`, async () => {
      const order = mode !== 'ふつう';
      const qi = LEVEL_DATA[1].jomon.questions.findIndex((q) => (order ? q.type === 'order' : (q.type || 'choice') === 'choice'));
      const { page, context, errors } = await pageFor(size, progressScript([], {
        settings: { sound: false, voice: false, timer: false },
        review: [{ lv: 1, era: 'jomon', qi, added: '2000-01-01' }],
      }));
      await goto(page, env, '#/review');
      await page.click('[data-testid=battle-start]');
      await page.waitForSelector('[data-testid=question]');
      assert.equal(await page.locator('.battle-screen.is-order').count(), order ? 1 : 0);
      await page.waitForTimeout(300);
      const bad = [];
      const fonts = [];
      for (const [name, { boss, where }] of NAMES) {
        await setName(page, name, boss);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); // MutationObserver の fitBanner を待つ
        const m = await measure(page);
        fonts.push({ name: rubyPlain(name), px: m.fontPx });
        if (m.scroll) bad.push(`${rubyPlain(name)}（${where}）：小さくしても入らず横スクロール`);
        if (m.fontPx < MIN_FONT_PX) bad.push(`${rubyPlain(name)}（${where}）：文字が小さすぎる(${m.fontPx}px)`);
        const why = [m.overflowX && '横はみ出し', m.outside && 'アリーナの外', m.coversHp && `HPバーにかぶる(${m.lines}行)`].filter(Boolean);
        if (why.length) bad.push(`${rubyPlain(name)}（${where}）：${why.join('・')}`);
      }
      await setName(page, LONGEST, true);
      await page.screenshot({ path: `${SHOT_DIR}/${size.width}x${size.height}-banner-${order ? 'order' : 'normal'}.png` });
      fonts.sort((a, b) => a.px - b.px);
      console.log(`# ${tag}・${mode}：看板の文字がいちばん小さい名前 ${fonts.slice(0, 3).map((f) => `${f.name}=${f.px}px`).join('、')}`);
      assert.deepEqual(bad, [], `${tag}・${mode}`);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}
