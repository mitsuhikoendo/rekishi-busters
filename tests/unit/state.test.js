import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './_mockStorage.js';
import { ERA_IDS } from '../../data/eras.js';
import { LEVEL_COUNT } from '../../data/levels.js';

const ls = installStorage();
const S = await import('../../js/state.js');

function fresh() {
  ls.clear();
  S.load();
}
function clearLevel(lv, upToIdx = ERA_IDS.length - 1) {
  for (let i = 0; i <= upToIdx; i++) S.recordClear(lv, ERA_IDS[i], 3, 0);
}

beforeEach(fresh);

describe('日付', () => {
  test('addDays は月・年またぎ、うるう年に対応', () => {
    assert.equal(S.addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(S.addDays('2028-03-01', -1), '2028-02-29');
    assert.equal(S.addDays('2026-03-01', -1), '2026-02-28');
  });
  test('debug-date で今日を差しかえ。不正な形式は無視', () => {
    ls.setItem(S.DEBUG_DATE_KEY, '2030-05-06');
    assert.equal(S.todayStr(), '2030-05-06');
    ls.setItem(S.DEBUG_DATE_KEY, 'tomorrow');
    assert.match(S.todayStr(), /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(S.todayStr(), 'tomorrow');
    ls.removeItem(S.DEBUG_DATE_KEY);
  });
});

describe('解放条件', () => {
  test('レベル1は最初から、レベル2以降はロック', () => {
    assert.equal(S.isLevelUnlocked(1), true);
    assert.equal(S.isLevelUnlocked('1'), true);
    for (let lv = 2; lv <= LEVEL_COUNT; lv++) assert.equal(S.isLevelUnlocked(lv), false);
  });
  test('時代は順番に解放', () => {
    assert.equal(S.isStageUnlocked(1, 'jomon'), true);
    assert.equal(S.isStageUnlocked(1, 'yayoi'), false);
    S.recordClear(1, 'jomon', 3, 50);
    assert.equal(S.isStageUnlocked(1, 'yayoi'), true);
    assert.equal(S.isStageUnlocked(1, 'kofun'), false);
  });
  test('存在しない時代・レベルはロック', () => {
    assert.equal(S.isStageUnlocked(1, 'nope'), false);
    assert.equal(S.isStageUnlocked(2, 'jomon'), false);
  });
  test('レベル1を13時代クリアではレベル2はロック、14時代でレベル2解放', () => {
    clearLevel(1, ERA_IDS.length - 2);
    assert.equal(S.isLevelUnlocked(2), false);
    S.recordClear(1, ERA_IDS.at(-1), 1, 0);
    assert.equal(S.isLevelUnlocked(2), true);
    assert.equal(S.isStageUnlocked(2, 'jomon'), true);
    assert.equal(S.isStageUnlocked(2, 'yayoi'), false);
    assert.equal(S.isLevelUnlocked(3), false);
    assert.equal(S.levelProgress(1), ERA_IDS.length);
  });
  test('watched だけではクリア扱いにならない', () => {
    S.markWatched(1, 'jomon');
    assert.equal(S.getStage(1, 'jomon').watched, true);
    assert.equal(S.getStage(1, 'jomon').cleared, false);
    assert.equal(S.isStageUnlocked(1, 'yayoi'), false);
  });
});

describe('recordClear', () => {
  test('星は最高記録を保つ・アイテムは初回だけ・コインは加算', () => {
    let r = S.recordClear(1, 'jomon', 2, 50);
    assert.equal(r.newItem, true);
    r = S.recordClear(1, 'jomon', 3, 50);
    assert.equal(r.newItem, false);
    r = S.recordClear(1, 'jomon', 1, 20);
    const st = S.getStage(1, 'jomon');
    assert.deepEqual(st, { stars: 3, cleared: true, watched: true });
    assert.deepEqual(S.getState().items, ['1-jomon']);
    assert.equal(S.getState().coins, 120);
    assert.equal(S.hasItem('1-jomon'), true);
  });
  test('保存され、load で復元される', () => {
    S.recordClear(1, 'jomon', 3, 50);
    S.load();
    assert.equal(S.getStage(1, 'jomon').cleared, true);
    assert.equal(S.getState().coins, 50);
  });
  test('resetAll で全部消える', () => {
    S.recordClear(1, 'jomon', 3, 50);
    S.resetAll();
    S.load();
    assert.equal(S.getStage(1, 'jomon').cleared, false);
    assert.equal(S.getState().coins, 0);
  });
});

describe('きょうのミッション', () => {
  test('未クリアのステージを順に3つ・その日は固定', () => {
    S.recordClear(1, 'jomon', 3, 0);
    const m = S.getMission('2026-10-11');
    assert.deepEqual(m.map((x) => x.id), ['1-yayoi', '1-kofun', '1-asuka']);
    assert.ok(m.every((x) => !x.cleared));
    S.recordClear(1, 'yayoi', 3, 0);
    const m2 = S.getMission('2026-10-11');
    assert.deepEqual(m2.map((x) => x.id), ['1-yayoi', '1-kofun', '1-asuka']);
    assert.deepEqual(m2.map((x) => x.cleared), [true, false, false]);
  });
  test('翌日はクリア済みを除いて選びなおす', () => {
    S.getMission('2026-10-11');
    S.recordClear(1, 'jomon', 3, 0);
    const m = S.getMission('2026-10-12');
    assert.deepEqual(m.map((x) => x.id), ['1-yayoi', '1-kofun', '1-asuka']);
  });
  test('lv/era が正しく分解される', () => {
    const m = S.getMission('2026-10-11');
    assert.equal(m[0].lv, 1);
    assert.equal(m[0].era, 'jomon');
    assert.deepEqual(S.splitId('12-heian'), [12, 'heian']);
  });
  test('全クリアなら空', () => {
    for (let lv = 1; lv <= LEVEL_COUNT; lv++) clearLevel(lv);
    assert.deepEqual(S.getMission('2026-10-11'), []);
  });
});

describe('ふくしゅうボックス', () => {
  test('当日分は出ない・翌日に出る', () => {
    S.addReview(1, 'jomon', 2, '2026-10-11');
    assert.equal(S.dueReviews('2026-10-11').length, 0);
    assert.equal(S.dueReviews('2026-10-12').length, 1);
    assert.deepEqual(S.dueReviews('2026-10-20')[0], { lv: 1, era: 'jomon', qi: 2, added: '2026-10-11' });
  });
  test('同じ問題は重複しない（lv が文字列でも）', () => {
    S.addReview(1, 'jomon', 2, '2026-10-11');
    S.addReview('1', 'jomon', 2, '2026-10-12');
    S.addReview(1, 'jomon', 3, '2026-10-11');
    S.addReview(1, 'yayoi', 2, '2026-10-11');
    assert.equal(S.getState().review.length, 3);
  });
  test('removeReview で消える', () => {
    S.addReview(1, 'jomon', 2, '2026-10-11');
    S.removeReview('1', 'jomon', 2);
    assert.equal(S.getState().review.length, 0);
    S.load();
    assert.equal(S.getState().review.length, 0);
  });
});

describe('ストリーク', () => {
  test('連続で増え、同じ日は増えない', () => {
    assert.equal(S.touchStreak('2026-10-10'), 1);
    assert.equal(S.touchStreak('2026-10-10'), 1);
    assert.equal(S.touchStreak('2026-10-11'), 2);
    assert.equal(S.touchStreak('2026-10-12'), 3);
    assert.equal(S.currentStreak('2026-10-12'), 3);
    assert.equal(S.currentStreak('2026-10-13'), 3); // 昨日やっていれば表示は続く
  });
  test('1日あくと途切れる', () => {
    S.touchStreak('2026-10-10');
    S.touchStreak('2026-10-11');
    assert.equal(S.currentStreak('2026-10-13'), 0);
    assert.equal(S.touchStreak('2026-10-13'), 1);
  });
  test('月またぎでも連続', () => {
    S.touchStreak('2026-10-31');
    assert.equal(S.touchStreak('2026-11-01'), 2);
  });
  test('recordClear でストリークが進む', () => {
    ls.setItem(S.DEBUG_DATE_KEY, '2026-10-11');
    S.recordClear(1, 'jomon', 3, 0);
    assert.deepEqual(S.getState().streak, { count: 1, last: '2026-10-11' });
    ls.removeItem(S.DEBUG_DATE_KEY);
  });
});

describe('壊れた保存データからの load', () => {
  const cases = {
    'JSONでない': '{not json',
    'null': 'null',
    '数値': '42',
    '文字列': '"hello"',
    '配列': '[1,2,3]',
    '各フィールドが型ちがい': JSON.stringify({ stages: 'x', items: 'y', review: {}, streak: 5, mission: 'z', settings: null }),
    'stages が null': JSON.stringify({ stages: null }),
  };
  for (const [name, raw] of Object.entries(cases)) {
    test(name, () => {
      ls.setItem(S.STORAGE_KEY, raw);
      const st = S.load();
      assert.equal(typeof st.stages, 'object');
      assert.ok(st.stages !== null);
      assert.ok(Array.isArray(st.items));
      assert.ok(Array.isArray(st.review));
      assert.equal(typeof st.settings.timer, 'boolean');
      // 主要な関数が落ちない
      S.isStageUnlocked(1, 'yayoi');
      S.recordClear(1, 'jomon', 3, 50);
      S.dueReviews('2030-01-01');
      S.currentStreak('2030-01-01');
      S.getMission('2030-01-01');
    });
  }

  test('古いデータに無い設定はデフォルトで補われる', () => {
    ls.setItem(S.STORAGE_KEY, JSON.stringify({ settings: { sound: false } }));
    const st = S.load();
    assert.deepEqual(st.settings, { sound: false, voice: true, timer: true });
  });

  // BUG-005: coins が数値でないと文字列連結になる
  test('coins が数値でない保存データでもコインが数値で加算される', () => {
    ls.setItem(S.STORAGE_KEY, JSON.stringify({ coins: '10' }));
    S.load();
    S.recordClear(1, 'jomon', 3, 50);
    assert.equal(S.getState().coins, 60);
  });

  // BUG-005: mission.list が配列でないとホームが落ちる
  test('mission.list が壊れていても getMission が落ちない', () => {
    ls.setItem(S.STORAGE_KEY, JSON.stringify({ mission: { date: '2026-10-11', list: null } }));
    S.load();
    assert.doesNotThrow(() => S.getMission('2026-10-11'));
  });

  // BUG-005: review の要素が壊れていると addReview/dueReviews が落ちる
  test('review の要素に null が混じっていても落ちない', () => {
    ls.setItem(S.STORAGE_KEY, JSON.stringify({ review: [null, { lv: 1, era: 'jomon', qi: 0, added: '2026-10-01' }] }));
    S.load();
    assert.doesNotThrow(() => S.dueReviews('2026-10-11'));
    assert.doesNotThrow(() => S.addReview(1, 'jomon', 1, '2026-10-11'));
  });
});

describe('localStorage が例外を投げる環境', () => {
  test('setItem が例外（容量オーバー）でも落ちない', () => {
    const orig = ls.setItem;
    ls.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      assert.doesNotThrow(() => S.recordClear(1, 'jomon', 3, 50));
      assert.equal(S.getStage(1, 'jomon').cleared, true);
    } finally {
      ls.setItem = orig;
    }
  });
});
