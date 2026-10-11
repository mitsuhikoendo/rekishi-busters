import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAnswer, correctText, qType, buildEnemies, Battle,
  START_HEARTS, BOSS_HP, MINION_HP, MINION_COUNT, COIN_BOSS, COIN_MINION,
} from '../../js/battleLogic.js';
import { getEra } from '../../data/eras.js';

// 再現性のある乱数
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const choiceQ = { q: 'c', choices: ['a', 'b', 'c', 'd'], answer: 2, exp: 'e' };
const tfQ = { type: 'tf', q: 't', answer: false, exp: 'e' };
const orderQ = { type: 'order', q: 'o', items: ['x', 'y', 'z'], exp: 'e' };

describe('checkAnswer', () => {
  test('choice', () => {
    assert.equal(checkAnswer(choiceQ, 2), true);
    assert.equal(checkAnswer(choiceQ, 0), false);
    assert.equal(checkAnswer(choiceQ, '2'), false);
    assert.equal(checkAnswer(choiceQ, undefined), false);
  });
  test('tf', () => {
    assert.equal(checkAnswer(tfQ, false), true);
    assert.equal(checkAnswer(tfQ, true), false);
    assert.equal(checkAnswer(tfQ, undefined), false);
    assert.equal(checkAnswer({ ...tfQ, answer: true }, true), true);
  });
  test('order', () => {
    assert.equal(checkAnswer(orderQ, [0, 1, 2]), true);
    assert.equal(checkAnswer(orderQ, [1, 0, 2]), false);
    assert.equal(checkAnswer(orderQ, [0, 1]), false);
    assert.equal(checkAnswer(orderQ, [0, 1, 2, 3]), false);
    assert.equal(checkAnswer(orderQ, undefined), false);
    assert.equal(checkAnswer(orderQ, '012'), false);
  });
  test('未知のtypeは不正解', () => {
    assert.equal(checkAnswer({ type: 'xxx' }, 0), false);
  });
  test('qType / correctText', () => {
    assert.equal(qType(choiceQ), 'choice');
    assert.equal(correctText(choiceQ), 'c');
    assert.match(correctText(tfQ), /×/);
    assert.match(correctText({ ...tfQ, answer: true }), /○/);
    assert.equal(correctText(orderQ), 'x → y → z');
  });
});

describe('buildEnemies', () => {
  test('ザコ2体＋ボス。ボスと同名の人物はザコにならない', () => {
    const era = getEra('jomon');
    const boss = { name: era.characters[0].name, emoji: '🧔' };
    for (let s = 1; s < 30; s++) {
      const en = buildEnemies(era, boss, seeded(s));
      assert.equal(en.length, MINION_COUNT + 1);
      assert.equal(en.at(-1).boss, true);
      assert.equal(en.at(-1).hp, BOSS_HP);
      const minions = en.slice(0, -1);
      minions.forEach((m) => {
        assert.equal(m.boss, false);
        assert.equal(m.hp, MINION_HP);
        assert.notEqual(m.name, boss.name);
      });
      assert.notEqual(minions[0].name, minions[1].name);
    }
  });
  test('元の人物データを書きかえない', () => {
    const era = getEra('yayoi');
    const before = JSON.stringify(era.characters);
    buildEnemies(era, { name: 'x', emoji: 'x' }, seeded(3));
    assert.equal(JSON.stringify(era.characters), before);
  });
});

function makeQuestions(n) {
  return Array.from({ length: n }, (_, i) => ({ q: `q${i}`, choices: ['a', 'b', 'c', 'd'], answer: 0, exp: 'e' }));
}
function makeEnemies() {
  return [
    { name: 'm1', hp: 1, maxHp: 1, boss: false },
    { name: 'm2', hp: 1, maxHp: 1, boss: false },
    { name: 'b', hp: 3, maxHp: 3, boss: true },
  ];
}

describe('Battle', () => {
  test('空の問題・敵はエラー', () => {
    assert.throws(() => new Battle({ questions: [], enemies: makeEnemies() }));
    assert.throws(() => new Battle({ questions: makeQuestions(1), enemies: [] }));
  });

  test('全問正解で勝ち・★3・コイン50', () => {
    const b = new Battle({ questions: makeQuestions(7), enemies: makeEnemies(), rand: seeded(1) });
    let ev;
    let n = 0;
    while (b.status === 'playing') {
      b.nextQuestion();
      ev = b.answer(true);
      n++;
    }
    assert.equal(n, 5);
    assert.equal(ev.status, 'win');
    assert.equal(b.stars(), 3);
    assert.equal(b.coins, COIN_MINION * 2 + COIN_BOSS);
    assert.equal(b.hearts, START_HEARTS);
    assert.equal(b.enemy, null);
  });

  test('ミスの数で星が減る（1ミス★2、2ミス★1）', () => {
    for (const [miss, star] of [[1, 2], [2, 1]]) {
      const b = new Battle({ questions: makeQuestions(7), enemies: makeEnemies(), rand: seeded(2) });
      for (let i = 0; i < miss; i++) { b.nextQuestion(); b.answer(false); }
      while (b.status === 'playing') { b.nextQuestion(); b.answer(true); }
      assert.equal(b.status, 'win');
      assert.equal(b.stars(), star);
    }
  });

  test('3回まちがえると負け・星0・それ以上答えられない', () => {
    const b = new Battle({ questions: makeQuestions(7), enemies: makeEnemies(), rand: seeded(3) });
    for (let i = 0; i < 3; i++) { b.nextQuestion(); b.answer(false); }
    assert.equal(b.status, 'lose');
    assert.equal(b.hearts, 0);
    assert.equal(b.stars(), 0);
    assert.equal(b.wrong.size, 3);
    assert.equal(b.nextQuestion(), null);
    assert.throws(() => b.answer(true));
  });

  test('出題前・二重回答は例外', () => {
    const b = new Battle({ questions: makeQuestions(7), enemies: makeEnemies() });
    assert.throws(() => b.answer(true));
    b.nextQuestion();
    b.answer(true);
    assert.throws(() => b.answer(true));
  });

  test('敵のcoin指定が優先される', () => {
    const b = new Battle({ questions: makeQuestions(2), enemies: [{ name: 'g', hp: 2, maxHp: 2, boss: true, coin: 15 }] });
    b.nextQuestion(); b.answer(true);
    b.nextQuestion(); b.answer(true);
    assert.equal(b.status, 'win');
    assert.equal(b.coins, 15);
  });

  test('問題数より多く出題しても壊れない（インデックスが範囲内）', () => {
    for (let s = 1; s < 50; s++) {
      const qs = makeQuestions(3);
      const b = new Battle({ questions: qs, enemies: [{ name: 'g', hp: 100, maxHp: 100, boss: true }], hearts: 1000, rand: seeded(s) });
      for (let i = 0; i < 60; i++) {
        const qi = b.nextQuestion();
        assert.ok(Number.isInteger(qi) && qi >= 0 && qi < qs.length, `qi=${qi}`);
        b.answer(i % 3 === 0);
      }
    }
  });

  test('出しなおしで同じ問題が連続しない（全部正解済み）', () => {
    for (let s = 1; s < 200; s++) {
      const b = new Battle({ questions: makeQuestions(4), enemies: [{ name: 'g', hp: 100, maxHp: 100, boss: true }], rand: seeded(s) });
      let prev = null;
      for (let i = 0; i < 30; i++) {
        const qi = b.nextQuestion();
        assert.notEqual(qi, prev, `seed=${s} i=${i}`);
        prev = qi;
        b.answer(true);
      }
    }
  });

  test('出しなおしで同じ問題が連続しない（未正解が複数）', () => {
    for (let s = 1; s < 200; s++) {
      const b = new Battle({ questions: makeQuestions(4), enemies: [{ name: 'g', hp: 100, maxHp: 100, boss: true }], hearts: 1000, rand: seeded(s) });
      let prev = null;
      for (let i = 0; i < 30; i++) {
        const qi = b.nextQuestion();
        assert.notEqual(qi, prev, `seed=${s} i=${i}`);
        prev = qi;
        b.answer(false);
      }
    }
  });

  // BUG-003: 未正解が「直前の1問だけ」のとき、同じ問題がすぐにもう一度出る
  test('出しなおしで同じ問題が連続しない（未正解が直前の1問だけ）', () => {
    const qs = makeQuestions(3);
    const b = new Battle({ questions: qs, enemies: [{ name: 'g', hp: 100, maxHp: 100, boss: true }], hearts: 10, rand: seeded(5) });
    // 1周目：最後の1問だけまちがえる
    b.nextQuestion(); b.answer(true);
    b.nextQuestion(); b.answer(true);
    const last = b.nextQuestion(); b.answer(false);
    const next = b.nextQuestion();
    assert.notEqual(next, last, '直前にまちがえた問題がすぐにもう一度出た');
  });

  test('ふくしゅう形式（1体・hp=問題数）で全問正解すると勝ち', () => {
    const qs = makeQuestions(3);
    const b = new Battle({ questions: qs, enemies: [{ name: 'o', boss: true, hp: 3, maxHp: 3, coin: 15 }], rand: seeded(7) });
    const seen = new Set();
    while (b.status === 'playing') { seen.add(b.nextQuestion()); b.answer(true); }
    assert.equal(seen.size, 3);
    assert.equal(b.status, 'win');
  });
});
