// 読み上げ：渡すテキスト・音声の選び方・pitch・場面の間隔（speechSynthesis をスタブにして確認）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newPage, goto, LEVEL_DATA } from './helpers.js';
import { rubySpeech } from '../../js/ruby.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

// voices: [{name, lang}]、endMs: 読み上げにかかる時間（null なら onend を返さない）
function speechStub(voices, endMs) {
  return `
    window.__spoken = [];
    const V = ${JSON.stringify(voices)};
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    const ss = window.speechSynthesis;
    ss.getVoices = () => V;
    ss.cancel = () => {};
    ss.speak = (u) => {
      window.__spoken.push({ text: u.text, lang: u.lang, pitch: u.pitch, rate: u.rate, voice: u.voice ? u.voice.name : null });
      ${endMs === null ? '' : `setTimeout(() => u.onend && u.onend(), ${endMs});`}
    };
  `;
}

const VOICES = [
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Kyoko', lang: 'ja-JP' },
  { name: 'Otoya', lang: 'ja-JP' },
  { name: 'Kyoko (Enhanced)', lang: 'ja-JP' },
  { name: 'Premium English', lang: 'en-GB' },
];

test('読み上げには rubySpeech のテキスト・ja-JP・pitch 1.0・高品質な日本語音声を使う', async () => {
  const { page, context, errors } = await newPage(env, { init: speechStub(VOICES, 100) });
  await goto(page, env, '#/video/1/jomon');
  await page.click('[data-testid=video-start]');
  await page.waitForFunction(() => window.__spoken.length >= 1);
  const [u] = await page.evaluate(() => window.__spoken);
  assert.equal(u.text, rubySpeech(LEVEL_DATA[1].jomon.video[0].text));
  assert.equal(u.lang, 'ja-JP');
  assert.equal(u.pitch, 1);
  assert.equal(u.rate, 1);
  assert.equal(u.voice, 'Kyoko (Enhanced)');
  assert.deepEqual(errors, []);
  await context.close();
});

test('高品質な音声が無ければ Kyoko 等、それも無ければ最初の日本語音声（ja_JP 表記も可）', async () => {
  for (const [voices, want] of [
    [[{ name: 'Samantha', lang: 'en-US' }, { name: 'Otoya', lang: 'ja-JP' }, { name: 'Kyoko', lang: 'ja-JP' }], 'Kyoko'],
    [[{ name: 'Samantha', lang: 'en-US' }, { name: 'ja voice', lang: 'ja_JP' }], 'ja voice'],
    [[{ name: 'Samantha', lang: 'en-US' }], null],
  ]) {
    const { page, context } = await newPage(env, { init: speechStub(voices, 100) });
    await goto(page, env, '#/video/1/jomon');
    await page.click('[data-testid=video-start]');
    await page.waitForFunction(() => window.__spoken.length >= 1);
    assert.equal((await page.evaluate(() => window.__spoken))[0].voice, want, JSON.stringify(voices));
    await context.close();
  }
});

test('読み上げが終わったら、短い間（1.5秒より長い場面は約0.25秒）で次の場面へ進む', async () => {
  const { page, context, errors } = await newPage(env, { init: speechStub(VOICES, 3000) });
  await page.clock.install();
  await goto(page, env, '#/video/1/jomon');
  await page.click('[data-testid=video-start]');
  const on = () => page.locator('#dots i.on').count();
  await page.clock.runFor(3000); // 読み上げ終了
  assert.equal(await on(), 1);
  await page.clock.runFor(400);
  assert.equal(await on(), 2, '読み上げ終了から0.4秒たっても次の場面に進まない');
  // 短い読み上げでも最低1.5秒＋0.25秒は表示する
  await context.close();

  const p2 = await newPage(env, { init: speechStub(VOICES, 100) });
  await p2.page.clock.install();
  await goto(p2.page, env, '#/video/1/jomon');
  await p2.page.click('[data-testid=video-start]');
  await p2.page.clock.runFor(1500);
  assert.equal(await p2.page.locator('#dots i.on').count(), 1, '1.5秒未満で次へ進んでしまう');
  await p2.page.clock.runFor(500);
  assert.equal(await p2.page.locator('#dots i.on').count(), 2);
  assert.deepEqual([...errors, ...p2.errors], []);
  await p2.context.close();
});

test('一時停止中は次の場面へ進まず、読み上げも始まらない', async () => {
  const { page, context, errors } = await newPage(env, { init: speechStub(VOICES, 500) });
  await page.clock.install();
  await goto(page, env, '#/video/1/jomon');
  await page.click('[data-testid=video-start]');
  await page.click('#play'); // 一時停止
  const n = await page.evaluate(() => window.__spoken.length);
  await page.clock.runFor(10_000);
  assert.equal(await page.locator('#dots i.on').count(), 1);
  assert.equal(await page.evaluate(() => window.__spoken.length), n);
  assert.deepEqual(errors, []);
  await context.close();
});

test('動画の途中で画面を出たら、その後に読み上げが始まらない', async () => {
  const { page, context, errors } = await newPage(env, { init: speechStub(VOICES, 500) });
  await page.clock.install();
  await goto(page, env, '#/video/1/jomon');
  await page.click('[data-testid=video-start]');
  await page.click('.bar-head .back');
  await page.waitForSelector('.level-map');
  const n = await page.evaluate(() => window.__spoken.length);
  await page.clock.runFor(20_000);
  assert.equal(await page.evaluate(() => window.__spoken.length), n);
  assert.deepEqual(errors, []);
  await context.close();
});
