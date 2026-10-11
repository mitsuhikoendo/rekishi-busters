// data/levels/lvN.js の中身を検証する。未作成のレベルは skip。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ERAS, ERA_IDS } from '../../data/eras.js';
import { LEVELS, LEVEL_COUNT } from '../../data/levels.js';
import { rubyPlain } from '../../js/ruby.js';

const MIN_SCENES = 5;
const MIN_QUESTIONS = 6;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

// ふりがな記法の崩れ：rubyPlain の後に { } | が残っていたらNG
function assertRuby(text, where) {
  assert.ok(typeof text === 'string', `${where}: 文字列ではない`);
  const plain = rubyPlain(text);
  assert.ok(!/[{}|｛｝｜]/.test(plain), `${where}: ふりがな記法が崩れている → ${text}`);
}

const levelData = {};
for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
  const url = new URL(`../../data/levels/lv${lv}.js`, import.meta.url);
  if (existsSync(fileURLToPath(url))) levelData[lv] = (await import(url)).default;
}

describe('data/eras.js・levels.js', () => {
  test('14時代・6レベル・IDが重複しない', () => {
    assert.equal(ERAS.length, 14);
    assert.equal(new Set(ERA_IDS).size, 14);
    assert.equal(LEVELS.length, 6);
    ERA_IDS.forEach((id) => assert.match(id, /^[a-z]+$/, 'ルーティングの正規表現 [a-z]+ に合う'));
  });
  test('各時代のフィールド', () => {
    for (const e of ERAS) {
      for (const k of ['name', 'short', 'years', 'color', 'icon']) assert.ok(isStr(e[k]), `${e.id}.${k}`);
      assertRuby(e.name, `${e.id}.name`);
      assert.ok(isStr(e.weapon?.name) && isStr(e.weapon?.emoji), `${e.id}.weapon`);
      assert.ok(Array.isArray(e.characters) && e.characters.length >= 3, `${e.id}.characters は3人以上（ザコ2体＋ボス）`);
      e.characters.forEach((c, i) => { assert.ok(isStr(c.name) && isStr(c.emoji), `${e.id}.characters[${i}]`); assertRuby(c.name, `${e.id}.characters[${i}]`); });
    }
    for (const l of LEVELS) { assertRuby(l.title, `lv${l.lv}.title`); assertRuby(l.desc, `lv${l.lv}.desc`); }
  });
});

for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
  const data = levelData[lv];
  if (!data) {
    test(`lv${lv}.js`, { skip: `lv${lv}.js は未作成` }, () => {});
    continue;
  }
  describe(`lv${lv}.js`, () => {
    test('全14時代がそろっている・余計なキーがない', () => {
      const missing = ERA_IDS.filter((id) => !data[id]);
      assert.deepEqual(missing, [], `足りない時代: ${missing.join(', ')}`);
      const extra = Object.keys(data).filter((k) => !ERA_IDS.includes(k));
      assert.deepEqual(extra, [], `知らない時代キー: ${extra.join(', ')}`);
    });

    for (const eraId of ERA_IDS) {
      const st = data[eraId];
      if (!st) continue;
      const W = `lv${lv}.${eraId}`;
      test(`${eraId}: title / boss / item`, () => {
        assert.ok(isStr(st.title), `${W}.title`);
        assertRuby(st.title, `${W}.title`);
        assert.ok(isStr(st.boss?.name) && isStr(st.boss?.emoji), `${W}.boss`);
        assertRuby(st.boss.name, `${W}.boss.name`);
        for (const k of ['name', 'emoji', 'desc']) assert.ok(isStr(st.item?.[k]), `${W}.item.${k}`);
        assertRuby(st.item.name, `${W}.item.name`);
        assertRuby(st.item.desc, `${W}.item.desc`);
      });
      test(`${eraId}: video（${MIN_SCENES}場面以上）`, () => {
        assert.ok(Array.isArray(st.video), `${W}.video`);
        assert.ok(st.video.length >= MIN_SCENES, `${W}.video は ${st.video.length} 場面`);
        st.video.forEach((sc, i) => {
          assert.ok(isStr(sc.art), `${W}.video[${i}].art`);
          assert.ok(isStr(sc.text), `${W}.video[${i}].text`);
          assertRuby(sc.text, `${W}.video[${i}].text`);
          if (sc.anim !== undefined) assert.ok(['pop', 'slide', 'zoom', 'float', 'shake'].includes(sc.anim), `${W}.video[${i}].anim=${sc.anim}`);
          if (sc.bg !== undefined) assert.ok(isStr(sc.bg), `${W}.video[${i}].bg`);
        });
      });
      test(`${eraId}: questions（${MIN_QUESTIONS}問以上）`, () => {
        assert.ok(Array.isArray(st.questions), `${W}.questions`);
        assert.ok(st.questions.length >= MIN_QUESTIONS, `${W}.questions は ${st.questions.length} 問`);
        st.questions.forEach((q, i) => {
          const w = `${W}.questions[${i}]`;
          const type = q.type || 'choice';
          assert.ok(['choice', 'tf', 'order'].includes(type), `${w}.type=${q.type}`);
          assert.ok(isStr(q.q), `${w}.q`);
          assertRuby(q.q, `${w}.q`);
          assert.ok(isStr(q.exp), `${w}.exp が空`);
          assertRuby(q.exp, `${w}.exp`);
          if (type === 'choice') {
            assert.ok(Array.isArray(q.choices) && q.choices.length === 4, `${w}.choices は4つ`);
            q.choices.forEach((c, j) => { assert.ok(isStr(c), `${w}.choices[${j}]`); assertRuby(c, `${w}.choices[${j}]`); });
            assert.equal(new Set(q.choices.map(rubyPlain)).size, 4, `${w}.choices が重複`);
            assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${w}.answer=${q.answer}`);
          } else if (type === 'tf') {
            assert.equal(typeof q.answer, 'boolean', `${w}.answer は boolean`);
          } else {
            assert.ok(Array.isArray(q.items) && q.items.length >= 2, `${w}.items は2つ以上`);
            q.items.forEach((c, j) => { assert.ok(isStr(c), `${w}.items[${j}]`); assertRuby(c, `${w}.items[${j}]`); });
            assert.equal(new Set(q.items.map(rubyPlain)).size, q.items.length, `${w}.items が重複`);
          }
        });
      });
      test(`${eraId}: 同じ問題文が重複しない`, () => {
        const qs = st.questions.map((q) => rubyPlain(q.q));
        const dup = qs.filter((q, i) => qs.indexOf(q) !== i && !/ならべよう/.test(q));
        assert.deepEqual(dup, [], `${W}: 重複した問題文`);
      });
    }
  });
}

test('item 名が全レベルを通して重複しない', () => {
  const seen = new Map();
  const dups = [];
  for (const [lv, data] of Object.entries(levelData)) {
    for (const eraId of ERA_IDS) {
      const name = data[eraId]?.item?.name;
      if (!name) continue;
      const key = rubyPlain(name);
      if (seen.has(key)) dups.push(`${key}（${seen.get(key)} と lv${lv}.${eraId}）`);
      else seen.set(key, `lv${lv}.${eraId}`);
    }
  }
  assert.deepEqual(dups, []);
});
