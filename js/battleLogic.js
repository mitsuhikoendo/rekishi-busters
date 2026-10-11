// バトルのルール（DOMに依存しない。Nodeでテストできる）
export const START_HEARTS = 3;
export const MINION_HP = 1;
export const BOSS_HP = 3;
export const MINION_COUNT = 2;
export const COIN_MINION = 10;
export const COIN_BOSS = 30;
export const COIN_REVIEW = 5;

export function qType(q) {
  return q.type || 'choice';
}

// 答えのチェック。
// choice: response = もとの選択肢のindex / tf: true|false / order: もとのitemsのindexを並べた配列
export function checkAnswer(q, response) {
  switch (qType(q)) {
    case 'choice': return response === q.answer;
    case 'tf': return response === q.answer;
    case 'order':
      return Array.isArray(response)
        && response.length === q.items.length
        && response.every((v, i) => v === i);
    default: return false;
  }
}

// 正解の表示用テキスト
export function correctText(q) {
  switch (qType(q)) {
    case 'choice': return q.choices[q.answer];
    case 'tf': return q.answer ? '○（正しい）' : '×（まちがい）';
    case 'order': return q.items.join(' → ');
    default: return '';
  }
}

function shuffleIdx(n, rand) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 敵の列：ザコ2体（時代の人物からボス以外）＋ボス
export function buildEnemies(era, boss, rand = Math.random) {
  const pool = era.characters.filter((c) => c.name !== boss.name);
  const order = shuffleIdx(pool.length, rand);
  const minions = order.slice(0, MINION_COUNT).map((i) => ({ ...pool[i], hp: MINION_HP, maxHp: MINION_HP, boss: false }));
  return [...minions, { ...boss, hp: BOSS_HP, maxHp: BOSS_HP, boss: true }];
}

export class Battle {
  constructor({ questions, enemies, hearts = START_HEARTS, rand = Math.random }) {
    if (!questions.length) throw new Error('questions is empty');
    if (!enemies.length) throw new Error('enemies is empty');
    this.questions = questions;
    this.enemies = enemies.map((e) => ({ ...e }));
    this.hearts = hearts;
    this.maxHearts = hearts;
    this.enemyIdx = 0;
    this.rand = rand;
    this.queue = shuffleIdx(questions.length, rand);
    this.solved = new Set(); // 一度でも正解した問題
    this.wrong = new Set();  // まちがえた問題
    this.lastQi = null;
    this.currentQi = null;
    this.status = 'playing'; // playing | win | lose
    this.coins = 0;
  }

  get enemy() {
    return this.enemies[this.enemyIdx] || null;
  }

  // 次の問題のindexを返す
  nextQuestion() {
    if (this.status !== 'playing') return null;
    if (!this.queue.length) {
      // 出しきったら、まだ正解していない問題を優先して出しなおす
      const unsolved = [...this.questions.keys()].filter((i) => !this.solved.has(i));
      const base = unsolved.length ? unsolved : [...this.questions.keys()];
      let q = shuffleIdx(base.length, this.rand).map((i) => base[i]);
      // 同じ問題が2回つづかないように
      if (q.length > 1 && q[0] === this.lastQi) q.push(q.shift());
      this.queue = q;
    }
    this.currentQi = this.queue.shift();
    this.lastQi = this.currentQi;
    return this.currentQi;
  }

  // 答えを反映して、起きたことを返す
  answer(correct) {
    if (this.status !== 'playing' || this.currentQi === null) throw new Error('no active question');
    const qi = this.currentQi;
    this.currentQi = null;
    const ev = { correct, qi, defeated: null, status: this.status };
    if (correct) {
      this.solved.add(qi);
      const en = this.enemy;
      en.hp = Math.max(0, en.hp - 1);
      if (en.hp === 0) {
        ev.defeated = en;
        this.coins += en.coin ?? (en.boss ? COIN_BOSS : COIN_MINION);
        this.enemyIdx++;
        if (this.enemyIdx >= this.enemies.length) this.status = 'win';
      }
    } else {
      this.wrong.add(qi);
      this.hearts = Math.max(0, this.hearts - 1);
      if (this.hearts === 0) this.status = 'lose';
    }
    ev.status = this.status;
    return ev;
  }

  stars() {
    return this.status === 'win' ? Math.max(1, Math.min(3, this.hearts)) : 0;
  }
}
