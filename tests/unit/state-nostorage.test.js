// localStorage が無い環境（Node そのまま）での動作
import { test } from 'node:test';
import assert from 'node:assert/strict';

delete globalThis.localStorage;
const S = await import('../../js/state.js');

test('localStorage が無くても load/save/recordClear が動き、メモリに保存される', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined');
  S.load();
  assert.equal(S.getStage(1, 'jomon').cleared, false);
  S.recordClear(1, 'jomon', 3, 50);
  S.addReview(1, 'jomon', 0, '2026-10-10');
  // メモリから読み直しても残っている
  S.load();
  assert.equal(S.getStage(1, 'jomon').cleared, true);
  assert.equal(S.getState().coins, 50);
  assert.equal(S.dueReviews('2026-10-11').length, 1);
  assert.match(S.todayStr(), /^\d{4}-\d{2}-\d{2}$/);
});

test('localStorage のアクセスで例外が出る環境（Safari プライベート等）でも動く', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.doesNotThrow(() => S.load());
    assert.doesNotThrow(() => S.recordClear(1, 'yayoi', 3, 10));
    assert.doesNotThrow(() => S.todayStr());
  } finally {
    delete globalThis.localStorage;
  }
});
