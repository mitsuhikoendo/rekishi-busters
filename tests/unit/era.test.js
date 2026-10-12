// 時代べつまとめ：前の保存データの引きつぎ、state.eras、buildEnemies のオプション
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './_mockStorage.js';
import { ERAS, ERA_IDS, getEra } from '../../data/eras.js';
import { LEVEL_COUNT } from '../../data/levels.js';
import { buildEnemies, MINION_COUNT, BOSS_HP } from '../../js/battleLogic.js';
import { LEGACY_SAVE, LEGACY_JSON, LEGACY_TODAY } from '../fixtures/legacySave.js';

const ls = installStorage();
const S = await import('../../js/state.js');
const lv6 = (await import('../../data/levels/lv6.js')).default;

function loadLegacy() {
  ls.clear();
  ls.setItem(S.STORAGE_KEY, LEGACY_JSON);
  ls.setItem(S.DEBUG_DATE_KEY, LEGACY_TODAY);
  return S.load();
}
const saved = () => JSON.parse(ls.getItem(S.STORAGE_KEY));

describe('前の保存データ（eras なし）の引きつぎ', () => {
  beforeEach(loadLegacy);

  test('load しても、すべての項目が元のまま。eras は空でうまる', () => {
    const st = S.getState();
    for (const k of ['stages', 'items', 'coins', 'review', 'streak', 'mission', 'settings']) {
      assert.deepEqual(st[k], LEGACY_SAVE[k], k);
    }
    assert.deepEqual(st.eras, {});
  });

  test('レベルの解放・進捗・ふくしゅう・ストリークが元のまま', () => {
    assert.equal(S.isLevelUnlocked(2), true);
    assert.equal(S.isLevelUnlocked(3), true);
    assert.equal(S.isLevelUnlocked(4), false);
    assert.equal(S.levelProgress(1), 14);
    assert.equal(S.levelProgress(2), 14);
    assert.equal(S.levelProgress(3), 5);
    assert.equal(S.isStageUnlocked(3, 'heian'), true);
    assert.equal(S.isStageUnlocked(3, 'kamakura'), false);
    assert.equal(S.getStage(3, 'heian').watched, true);
    assert.deepEqual(S.dueReviews(LEGACY_TODAY).map((r) => `${r.lv}-${r.era}-${r.qi}`), ['2-kofun-1', '3-asuka-4']);
    assert.equal(S.currentStreak(LEGACY_TODAY), 5);
    assert.equal(S.hasItem('3-nara'), true);
    assert.equal(S.hasItem('3-heian'), false);
  });

  test('ミッションは前の日の分なので選びなおされ、レベル3の続きになる', () => {
    assert.deepEqual(S.getMission(LEGACY_TODAY).map((m) => m.id), ['3-heian', '3-kamakura', '3-muromachi']);
  });

  test('まとめバトルに何回勝っても、stages と items は1バイトも変わらない（保存データでも）', () => {
    const before = { stages: JSON.stringify(saved().stages), items: JSON.stringify(saved().items) };
    for (const era of ERA_IDS) S.recordEraClear(era, 3, 70);
    S.recordEraClear('heian', 1, 40);
    S.recordEraClear('edo', 2, 40);
    const after = saved();
    assert.equal(JSON.stringify(after.stages), before.stages);
    assert.equal(JSON.stringify(after.items), before.items);
    assert.deepEqual(after.review, LEGACY_SAVE.review);
    assert.deepEqual(after.settings, LEGACY_SAVE.settings);
    // レベルの解放も変わらない（未クリアの時代をまとめでクリアしても）
    assert.equal(S.isLevelUnlocked(4), false);
    assert.equal(S.levelProgress(3), 5);
    assert.equal(S.isStageUnlocked(3, 'kamakura'), false);
    assert.equal(S.getStage(3, 'heian').cleared, false);
    // コインとストリークはふえる
    assert.equal(after.coins, 1234 + 70 * 14 + 40 * 2);
    assert.deepEqual(after.streak, { count: 6, last: LEGACY_TODAY });
  });

  test('保存→読みなおしでも、前のデータと eras の両方が残る', () => {
    S.recordEraClear('jomon', 2, 50);
    S.load();
    assert.deepEqual(S.getState().stages, LEGACY_SAVE.stages);
    assert.deepEqual(S.getState().items, LEGACY_SAVE.items);
    assert.deepEqual(S.getEraRecord('jomon'), { stars: 2, plays: 1 });
  });

  test('eraLevelProgress は stages から数える（Lv1〜3 クリアの時代は3、平安は2）', () => {
    assert.equal(S.eraLevelProgress('jomon'), 3);
    assert.equal(S.eraLevelProgress('nara'), 3);
    assert.equal(S.eraLevelProgress('heian'), 2);
    assert.equal(S.eraLevelProgress('heisei'), 2);
    assert.equal(S.eraLevelProgress('nope'), 0);
  });
});

describe('state.eras', () => {
  beforeEach(() => { ls.clear(); ls.removeItem(S.DEBUG_DATE_KEY); S.load(); });

  test('記録がなければ {stars:0, plays:0}', () => {
    assert.deepEqual(S.getEraRecord('jomon'), { stars: 0, plays: 0 });
  });

  test('★はベストを残し、plays は勝つたびにふえる', () => {
    S.recordEraClear('jomon', 2, 10);
    S.recordEraClear('jomon', 3, 10);
    S.recordEraClear('jomon', 1, 10);
    assert.deepEqual(S.getEraRecord('jomon'), { stars: 3, plays: 3 });
    assert.deepEqual(S.getEraRecord('yayoi'), { stars: 0, plays: 0 });
    assert.equal(S.getState().coins, 30);
  });

  test('壊れた eras（配列・null・文字列・数値）は空にもどる', () => {
    for (const bad of [[1, 2], null, 'x', 5]) {
      ls.setItem(S.STORAGE_KEY, JSON.stringify({ eras: bad }));
      S.load();
      assert.deepEqual(S.getState().eras, {}, JSON.stringify(bad));
      assert.doesNotThrow(() => S.recordEraClear('jomon', 3, 0));
    }
  });

  test('eras の中身がおかしくても getEraRecord は数値を返す', () => {
    ls.setItem(S.STORAGE_KEY, JSON.stringify({ eras: { jomon: { stars: 'abc', plays: null }, yayoi: 'x', kofun: { stars: '2', plays: '4' } } }));
    S.load();
    assert.deepEqual(S.getEraRecord('jomon'), { stars: 0, plays: 0 });
    assert.deepEqual(S.getEraRecord('yayoi'), { stars: 0, plays: 0 });
    assert.deepEqual(S.getEraRecord('kofun'), { stars: 2, plays: 4 });
    S.recordEraClear('jomon', 1, 0);
    assert.deepEqual(S.getEraRecord('jomon'), { stars: 1, plays: 1 });
  });

  test('defaultState / resetAll に eras がある', () => {
    assert.deepEqual(S.defaultState().eras, {});
    S.recordEraClear('jomon', 3, 0);
    S.resetAll();
    assert.deepEqual(S.getState().eras, {});
  });
});

describe('buildEnemies のオプション', () => {
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

  test('オプションなしは今までどおり（ザコ2体＋ボスHP3）', () => {
    const era = getEra('edo');
    const en = buildEnemies(era, { name: 'x', emoji: 'x' }, seeded(1));
    assert.equal(en.length, MINION_COUNT + 1);
    assert.equal(en.at(-1).hp, BOSS_HP);
  });

  test('minions・bossHp を指定できる', () => {
    const en = buildEnemies(getEra('edo'), { name: 'x', emoji: 'x' }, seeded(2), { minions: 3, bossHp: 4 });
    assert.equal(en.length, 4);
    assert.deepEqual(en.map((e) => e.hp), [1, 1, 1, 4]);
    assert.equal(en.at(-1).maxHp, 4);
    assert.equal(new Set(en.slice(0, 3).map((e) => e.name)).size, 3);
  });

  // BUG-019: Lv6 のボスが人物リストにいる時代は、ザコが2体しか出ない
  test('全14時代で、まとめバトルの敵がザコ3体（Lv6のボス以外）＋ボスになる', () => {
    const short = [];
    for (const era of ERAS) {
      const boss = lv6[era.id].boss;
      const en = buildEnemies(era, boss, seeded(3), { minions: 3, bossHp: 4 });
      const minions = en.filter((e) => !e.boss);
      assert.ok(minions.every((m) => m.name !== boss.name), `${era.id}: ボスがザコにも出る`);
      if (minions.length !== 3) short.push(`${era.id}（ザコ${minions.length}体）`);
    }
    assert.deepEqual(short, [], 'ザコが3体にならない時代');
  });
});

test('まとめバトルに必要な問題数：全時代・全レベルで2問以上ある', async () => {
  for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
    const data = (await import(`../../data/levels/lv${lv}.js`)).default;
    for (const era of ERA_IDS) assert.ok(data[era].questions.length >= 2, `lv${lv}.${era}`);
  }
});
