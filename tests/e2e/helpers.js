// E2E 共通：サーバー起動、ブラウザ、正解の引き方
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { chromium } from 'playwright';
import { rubyHtml } from '../../js/ruby.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// 存在する lvN.js を全部読む（正答を引くため）
export const LEVEL_DATA = {};
for (let lv = 1; lv <= 6; lv++) {
  const url = new URL(`../../data/levels/lv${lv}.js`, import.meta.url);
  if (existsSync(fileURLToPath(url))) LEVEL_DATA[lv] = (await import(url)).default;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
    s.on('error', rej);
  });
}

async function waitPort(port, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((res) => {
      const c = net.connect(port, '127.0.0.1', () => { c.end(); res(true); });
      c.on('error', () => res(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

// サーバー＋ブラウザを起動。after() で close() を呼ぶこと。
export async function startEnv() {
  const port = await freePort();
  // python3 -m http.server と同じサーバー。ただし listen のバックログ（既定 5）を 128 に増やす。
  // 既定のままだと、1ページで20以上のモジュールを並行して読むときに負荷がかかると ERR_CONNECTION_RESET になり、
  // アプリが起動せず（#app が空）テストがタイムアウトする（screens.test.js がときどき落ちていた原因）。
  const py = [
    'import sys, http.server as h',
    'h.ThreadingHTTPServer.request_queue_size = 128',
    "h.test(HandlerClass=h.SimpleHTTPRequestHandler, ServerClass=h.ThreadingHTTPServer, port=int(sys.argv[1]), bind='127.0.0.1')",
  ].join('\n');
  const server = spawn('python3', ['-c', py, String(port)], { cwd: ROOT, stdio: 'ignore' });
  await waitPort(port);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${port}/index.html?nosw`;
  return {
    base,
    browser,
    async close() {
      await browser.close().catch(() => {});
      server.kill();
    },
  };
}

// スマホサイズのページ。console error / pageerror を集める。
export async function newPage(env, { init } = {}) {
  const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    // 開発中で未作成の lvN.js の 404 は除外
    const lvm = url.match(/data\/levels\/lv(\d)\.js/);
    if (lvm && !existsSync(`${ROOT}data/levels/lv${lvm[1]}.js`)) return;
    errors.push(`console.error: ${m.text()} @ ${url}`);
  });
  if (init) await page.addInitScript(init);
  return { page, context, errors };
}

export async function goto(page, env, hash) {
  await page.goto(`${env.base}${hash}`);
  await page.waitForSelector('#app > *', { state: 'attached' });
}

// 未作成の lvN.js の番号一覧
export function missingLevels() {
  const out = [];
  for (let lv = 1; lv <= 6; lv++) if (!existsSync(`${ROOT}data/levels/lv${lv}.js`)) out.push(lv);
  return out;
}

export async function setDebugDate(page, date) {
  await page.evaluate((d) => localStorage.setItem('rekishi-busters-debug-date', d), date);
}

// 表示中の問題を data から探す。scope={lv, era} を渡すとそのステージから優先して探す。
export async function currentQuestion(page, scope) {
  const html = await page.locator('[data-testid=question]').innerHTML();
  const chips = await page.locator('.order-pool .chip').evaluateAll((els) => els.map((e) => e.innerHTML).sort());
  const choices = await page.locator('.choices .choice[data-i]').evaluateAll((els) => els.map((e) => e.innerHTML).sort());
  const stages = [];
  if (scope?.lv && scope?.era && LEVEL_DATA[scope.lv]?.[scope.era]) stages.push(LEVEL_DATA[scope.lv][scope.era]);
  for (const data of Object.values(LEVEL_DATA)) stages.push(...Object.values(data));
  for (const st of stages) {
    for (const q of st.questions) {
      if (!html.endsWith(rubyHtml(q.q))) continue;
      const type = q.type || 'choice';
      if (type === 'order' && JSON.stringify(q.items.map(rubyHtml).sort()) !== JSON.stringify(chips)) continue;
      if (type === 'choice' && JSON.stringify(q.choices.map(rubyHtml).sort()) !== JSON.stringify(choices)) continue;
      if (type === 'tf' && (chips.length || choices.length)) continue;
      return q;
    }
  }
  throw new Error(`question not found: ${html}`);
}

// 答えのボタンを押す（フィードバックは待たない）
export async function clickAnswer(page, correct, scope) {
  await page.waitForSelector('[data-testid=question]');
  const q = await currentQuestion(page, scope);
  const type = q.type || 'choice';
  if (type === 'choice') {
    const i = correct ? q.answer : (q.answer + 1) % 4;
    await page.click(`.choices .choice[data-i="${i}"]`);
  } else if (type === 'tf') {
    const v = correct ? q.answer : !q.answer;
    await page.click(`.choices .choice[data-tf="${v ? 1 : 0}"]`);
  } else {
    const n = q.items.length;
    const order = [...Array(n).keys()];
    if (!correct) order.reverse();
    for (const i of order) await page.click(`.order-pool .chip[data-i="${i}"]`);
    await page.click('#order-ok');
  }
  return q;
}

// 1問答えてフィードバックが出るまで待つ
export async function answer(page, correct, scope) {
  const q = await clickAnswer(page, correct, scope);
  await page.waitForSelector('[data-testid=feedback]', { timeout: 10000 });
  return q;
}

export async function next(page) {
  await page.click('[data-testid=next]');
}

export async function heartsLeft(page) {
  const t = await page.locator('[data-testid=hearts]').textContent();
  return [...t.matchAll(/❤️/g)].length;
}

// 動画を ⏭ で最後まで送る
export async function watchVideoBySkipping(page) {
  await page.click('[data-testid=video-start]');
  for (let i = 0; i < 30; i++) {
    if (await page.locator('[data-testid=video-to-battle]').isVisible()) return;
    await page.click('#next');
  }
  await page.waitForSelector('[data-testid=video-to-battle]', { state: 'visible' });
}

// 現在のバトルを最後まで（mistakes 回まちがえてから正解しつづける）
export async function playBattle(page, { mistakes = 0 } = {}) {
  await page.click('[data-testid=battle-start]');
  let m = 0;
  for (let i = 0; i < 30; i++) {
    const wrong = m < mistakes;
    if (wrong) m++;
    await answer(page, !wrong);
    const label = await page.locator('[data-testid=next]').textContent();
    await next(page);
    if (label.includes('けっか')) break;
  }
}

// ステージを最初からクリア（ホーム→マップ→動画→バトル）
export async function clearStage(page, env, lv, era, opts) {
  await goto(page, env, `#/level/${lv}`);
  await page.click(`[data-testid=era-${era}]`);
  await page.click('[data-testid=btn-video]');
  await watchVideoBySkipping(page);
  await page.click('[data-testid=video-to-battle]');
  await playBattle(page, opts);
  await page.waitForSelector('[data-testid=result]');
}

// localStorage に直接進捗を入れる（前提条件づくり用）
export function progressScript(stages, extra = {}) {
  const st = {};
  for (const id of stages) st[id] = { stars: 3, cleared: true, watched: true };
  const data = {
    stages: st, items: [...stages], coins: 0, review: [], streak: { count: 0, last: null },
    mission: { date: null, list: [] }, settings: { sound: true, voice: true, timer: true }, ...extra,
  };
  // リロードで上書きしないよう、最初の1回だけ入れる
  return `if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('rekishi-busters-v1', ${JSON.stringify(JSON.stringify(data))}); sessionStorage.setItem('__seeded', '1'); }`;
}
