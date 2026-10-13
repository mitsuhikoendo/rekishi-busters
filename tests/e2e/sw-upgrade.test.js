// Service Worker の更新（v3 → 最新の VERSION）：前の版（ad231cb、時代べつまとめの前）で遊んでいた端末に、新しい版を配信する。
// 一時ディレクトリに旧版・新版を用意し、配信ディレクトリ（app/ のシンボリックリンク）を差しかえる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, unlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, ROOT, poll } from './helpers.js';
import { LEGACY_JSON, LEGACY_SAVE, LEGACY_TODAY } from '../fixtures/legacySave.js';

const OLD_REV = 'ad231cb'; // sw.js VERSION = 'v3'、時代べつまとめの前
// 新版の VERSION はリポジトリの sw.js から読む（リリースごとに上がるので）
const NEW = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/VERSION = '(v\d+)'/)[1];
const NEW_CACHE = `rekishi-busters-${NEW}`;
const KEY = 'rekishi-busters-v1';
const APP_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons'];

let env;
let tmp;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'rekishi-sw-'));
  const oldDir = join(tmp, 'old');
  const newDir = join(tmp, 'new');
  mkdirSync(oldDir);
  mkdirSync(newDir);
  mkdirSync(join(tmp, 'root'));
  execFileSync('tar', ['-x', '-C', oldDir], { input: execFileSync('git', ['archive', OLD_REV], { cwd: ROOT, maxBuffer: 1 << 28 }) });
  for (const f of APP_FILES) cpSync(join(ROOT, f), join(newDir, f), { recursive: true });
  assert.match(readFileSync(join(oldDir, 'sw.js'), 'utf8'), /VERSION = 'v3'/);
  assert.match(readFileSync(join(newDir, 'sw.js'), 'utf8'), new RegExp(`VERSION = '${NEW}'`));
  symlinkSync(oldDir, join(tmp, 'root', 'app'));
  env = await startEnv({ root: join(tmp, 'root'), path: 'app/' });
});
after(async () => {
  await env?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function deploy(which) {
  unlinkSync(join(tmp, 'root', 'app'));
  symlinkSync(join(tmp, which), join(tmp, 'root', 'app'));
}

async function waitCache(page, name, file) {
  await poll(page, async ([n, f]) => {
    const keys = await caches.keys();
    if (!keys.includes(n)) return false;
    return !!(await (await caches.open(n)).match(f));
  }, [name, file], { what: `${name} に ${file}` });
}

// 2つのテストで同じ端末（context・page）を使う
let context;
let page;
const errors = [];
const KEEP = ['stages', 'items', 'coins', 'review', 'streak', 'settings'];

test(`v3 → ${NEW} の更新で、localStorage（進みぐあい）がそのまま残る`, async () => {
  context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await context.addInitScript(`if (!localStorage.getItem('${KEY}')) {
    localStorage.setItem('${KEY}', ${JSON.stringify(LEGACY_JSON)});
    localStorage.setItem('rekishi-busters-debug-date', '${LEGACY_TODAY}');
  }`);

  // ---- 旧版（v3）で開く ----
  await page.goto(`${env.origin}/app/index.html#/home`);
  await page.waitForSelector('[data-testid=level-3]');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await waitCache(page, 'rekishi-busters-v3', 'data/levels/lv6.js');
  assert.equal(await page.locator('[data-testid=eras-btn]').count(), 0, '旧版に「時代べつまとめ」がある？');
  const rawBefore = await page.evaluate((k) => localStorage.getItem(k), KEY);

  // ---- 新版を配信して開きなおす ----
  deploy('new');
  await page.reload();
  // 新しい sw.js が入り、古いキャッシュ（v3）が消えるまで待つ
  await poll(page, async (n) => {
    const keys = await caches.keys();
    return keys.length === 1 && keys[0] === n;
  }, NEW_CACHE, { what: `キャッシュが ${NEW} だけになる` });
  await page.reload();
  await page.waitForSelector('[data-testid=level-3]');
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), rawBefore, '更新しただけで localStorage が変わった');
  assert.equal(await page.locator('[data-testid=level-3] .lc-prog').textContent(), '5/14');
  assert.match(await page.locator('[data-testid=level-4]').getAttribute('class'), /locked/);
  // オフラインでも、進みぐあいはそのまま
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-testid=level-3]', { timeout: 15000 });
  assert.equal(await page.locator('[data-testid=level-3] .lc-prog').textContent(), '5/14');
  await context.setOffline(false);
  const s = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  for (const k of KEEP) assert.deepEqual(s[k], LEGACY_SAVE[k], k);
  assert.deepEqual(errors, []);
});

// BUG-021: install と fetch が HTTP キャッシュを通るので、v4 のキャッシュに旧版のファイルが入り、新旧がまざる
test(`${NEW} に更新したら、${NEW} のキャッシュは新版のファイルになり、すぐ「時代べつまとめ」が使える（オフラインでも）`, async () => {
  assert.ok(page, '前のテストが失敗している');
  const cached = await page.evaluate(async (n) => {
    const c = await caches.open(n);
    const t = async (f) => { const r = await c.match(f); return r ? r.text() : ''; };
    return {
      'js/main.js': (await t('js/main.js')).includes('erabattle'),
      'js/state.js': (await t('js/state.js')).includes('recordEraClear'),
      'js/screens/home.js': (await t('js/screens/home.js')).includes('eras-btn'),
      'js/screens/battle.js': (await t('js/screens/battle.js')).includes('setupEra'),
      'js/screens/video.js': (await t('js/screens/video.js')).includes('renderEraMode'),
      'js/screens/era.js': (await t('js/screens/era.js')).length > 0,
    };
  }, NEW_CACHE);
  const old = Object.entries(cached).filter(([, ok]) => !ok).map(([f]) => f);
  assert.deepEqual(old, [], `${NEW} のキャッシュに旧版のまま（または無い）ファイルがある`);
  await page.goto(`${env.origin}/app/index.html#/home`);
  await page.reload();
  await page.waitForSelector('[data-testid=level-3]');
  assert.equal(await page.locator('[data-testid=eras-btn]').count(), 1, '更新後のホームに「時代べつまとめ」が出ない');
  await context.setOffline(true);
  await page.goto(`${env.origin}/app/index.html#/era/edo`);
  await page.reload();
  await page.waitForSelector('[data-testid=era-video-6]', { timeout: 15000 });
  await context.setOffline(false);
  assert.deepEqual(errors, []);
});

after(async () => { await context?.close().catch(() => {}); });
