// 「時代べつまとめ」より前の保存データ（eras がない）。
// Lv1・Lv2 は全クリア、Lv3 は5時代クリア（平安は動画だけ見た）、アイテム・コイン・ストリーク・ふくしゅう・設定あり。
import { ERA_IDS } from '../../data/eras.js';

export const LEGACY_TODAY = '2026-10-13';

function build() {
  const stages = {};
  const items = [];
  ERA_IDS.forEach((era, i) => {
    stages[`1-${era}`] = { stars: 3, cleared: true, watched: true };
    stages[`2-${era}`] = { stars: (i % 3) + 1, cleared: true, watched: true };
    items.push(`1-${era}`, `2-${era}`);
  });
  ERA_IDS.slice(0, 5).forEach((era, i) => {
    stages[`3-${era}`] = { stars: i === 2 ? 1 : 2, cleared: true, watched: true };
    items.push(`3-${era}`);
  });
  stages['3-heian'] = { stars: 0, cleared: false, watched: true };
  return {
    stages,
    items,
    coins: 1234,
    review: [
      { lv: 2, era: 'kofun', qi: 1, added: '2026-10-10' },
      { lv: 3, era: 'asuka', qi: 4, added: '2026-10-12' },
      { lv: 3, era: 'nara', qi: 0, added: LEGACY_TODAY }, // きょうの分（まだ出ない）
    ],
    streak: { count: 5, last: '2026-10-12' },
    mission: { date: '2026-10-12', list: ['3-heian', '3-kamakura', '3-muromachi'] },
    settings: { sound: false, voice: true, timer: false },
  };
}

export const LEGACY_SAVE = build();
export const LEGACY_JSON = JSON.stringify(LEGACY_SAVE);
