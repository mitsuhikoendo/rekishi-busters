// 進捗の保存・読み込みと、ミッション・ふくしゅう・ストリークのロジック。
// DOMに依存しない（localStorageが無い環境ではメモリに保存）のでNodeからテストできる。
import { ERA_IDS } from '../data/eras.js';
import { LEVEL_COUNT } from '../data/levels.js';

export const STORAGE_KEY = 'rekishi-busters-v1';
export const DEBUG_DATE_KEY = 'rekishi-busters-debug-date';
export const MISSION_SIZE = 3;

const memoryStore = {};
function storage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch { /* プライベートモード等 */ }
  return {
    getItem: (k) => (k in memoryStore ? memoryStore[k] : null),
    setItem: (k, v) => { memoryStore[k] = String(v); },
    removeItem: (k) => { delete memoryStore[k]; },
  };
}

export function defaultState() {
  return {
    stages: {},          // 'lv-era' -> { stars, cleared, watched }
    items: [],           // 獲得アイテムID（'lv-era'）
    coins: 0,
    review: [],          // { lv, era, qi, added: 'YYYY-MM-DD' }
    streak: { count: 0, last: null },
    mission: { date: null, list: [] },
    settings: { sound: true, voice: true, timer: true },
  };
}

let state = null;

function isReviewEntry(r) {
  return !!r && typeof r === 'object' && typeof r.era === 'string' && typeof r.added === 'string';
}

export function load() {
  let saved = null;
  try {
    saved = JSON.parse(storage().getItem(STORAGE_KEY) || 'null');
  } catch { saved = null; }
  const base = defaultState();
  if (saved && typeof saved === 'object') {
    const mission = { ...base.mission, ...(saved.mission || {}) };
    const coins = Number(saved.coins);
    state = {
      ...base,
      ...saved,
      streak: { ...base.streak, ...(saved.streak || {}) },
      // list が壊れていたら、その日のミッションを選びなおす
      mission: Array.isArray(mission.list) && mission.list.every((id) => typeof id === 'string')
        ? mission : base.mission,
      settings: { ...base.settings, ...(saved.settings || {}) },
      stages: saved.stages && typeof saved.stages === 'object' ? saved.stages : {},
      items: Array.isArray(saved.items) ? saved.items : [],
      review: Array.isArray(saved.review) ? saved.review.filter(isReviewEntry) : [],
      coins: Number.isFinite(coins) && coins >= 0 ? coins : 0,
    };
  } else {
    state = base;
  }
  return state;
}

export function getState() {
  return state || load();
}

export function save() {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(getState()));
  } catch { /* 容量オーバー等は無視 */ }
}

export function resetAll() {
  state = defaultState();
  save();
}

// ---- 日付 ----
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  try {
    const dbg = storage().getItem(DEBUG_DATE_KEY);
    if (dbg && /^\d{4}-\d{2}-\d{2}$/.test(dbg)) return dbg;
  } catch { /* noop */ }
  return fmt(new Date());
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return fmt(dt);
}

// ---- ステージ ----
export function stageId(lv, era) {
  return `${lv}-${era}`;
}

export function getStage(lv, era) {
  return getState().stages[stageId(lv, era)] || { stars: 0, cleared: false, watched: false };
}

// 全ステージを順番に並べたリスト
export function allStages() {
  const list = [];
  for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
    for (const era of ERA_IDS) list.push({ lv, era });
  }
  return list;
}

export function isLevelUnlocked(lv) {
  lv = Number(lv);
  if (lv <= 1) return true;
  return ERA_IDS.every((era) => getStage(lv - 1, era).cleared);
}

export function isStageUnlocked(lv, era) {
  lv = Number(lv);
  if (!isLevelUnlocked(lv)) return false;
  const idx = ERA_IDS.indexOf(era);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return getStage(lv, ERA_IDS[idx - 1]).cleared;
}

export function levelProgress(lv) {
  return ERA_IDS.filter((era) => getStage(lv, era).cleared).length;
}

export function markWatched(lv, era) {
  const s = getState();
  const id = stageId(lv, era);
  s.stages[id] = { ...getStage(lv, era), watched: true };
  save();
}

// ステージクリアを記録。新しくアイテムを手に入れたら true を返す。
export function recordClear(lv, era, stars, coins) {
  const s = getState();
  const id = stageId(lv, era);
  const prev = getStage(lv, era);
  s.stages[id] = {
    ...prev,
    watched: true,
    cleared: true,
    stars: Math.max(prev.stars || 0, stars),
  };
  s.coins += coins;
  const newItem = !s.items.includes(id);
  if (newItem) s.items.push(id);
  touchStreak();
  save();
  return { newItem };
}

export function addCoins(n) {
  getState().coins += n;
  save();
}

// ---- ストリーク ----
export function touchStreak(today = todayStr()) {
  const st = getState().streak;
  if (st.last === today) return st.count;
  st.count = st.last === addDays(today, -1) ? st.count + 1 : 1;
  st.last = today;
  return st.count;
}

// 表示用：昨日も今日もやっていなければ0
export function currentStreak(today = todayStr()) {
  const st = getState().streak;
  if (st.last === today || st.last === addDays(today, -1)) return st.count;
  return 0;
}

// ---- きょうのミッション ----
// その日最初に開いたとき、いまのレベルでまだクリアしていないステージを順に3つまで選んで固定する。
// （ロック中のレベルのステージは入れない。レベルの最後では3つに満たないこともある）
export function getMission(today = todayStr()) {
  const s = getState();
  if (s.mission.date !== today) {
    const uncleared = allStages().filter((st) => !getStage(st.lv, st.era).cleared);
    const lv = uncleared.length ? uncleared[0].lv : null;
    const next = lv && isLevelUnlocked(lv)
      ? uncleared.filter((st) => st.lv === lv).slice(0, MISSION_SIZE)
      : [];
    s.mission = { date: today, list: next.map((st) => stageId(st.lv, st.era)) };
    save();
  }
  return s.mission.list.map((id) => {
    const [lv, era] = splitId(id);
    return { id, lv, era, cleared: getStage(lv, era).cleared };
  });
}

export function splitId(id) {
  const i = id.indexOf('-');
  return [Number(id.slice(0, i)), id.slice(i + 1)];
}

// ---- ふくしゅうボックス ----
function sameQ(a, b) {
  return a.lv === b.lv && a.era === b.era && a.qi === b.qi;
}

export function addReview(lv, era, qi, today = todayStr()) {
  const s = getState();
  const q = { lv: Number(lv), era, qi };
  if (!s.review.some((r) => sameQ(r, q))) {
    s.review.push({ ...q, added: today });
    save();
  }
}

export function removeReview(lv, era, qi) {
  const s = getState();
  const q = { lv: Number(lv), era, qi };
  const before = s.review.length;
  s.review = s.review.filter((r) => !sameQ(r, q));
  if (s.review.length !== before) save();
}

// 前の日までにまちがえた問題（＝きょうふくしゅうできる問題）
export function dueReviews(today = todayStr()) {
  return getState().review.filter((r) => r.added < today);
}

export function setSetting(key, value) {
  getState().settings[key] = value;
  save();
}

export function hasItem(id) {
  return getState().items.includes(id);
}
