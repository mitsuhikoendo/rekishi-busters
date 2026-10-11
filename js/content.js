// レベルごとのコンテンツ（動画台本・問題・ボス・アイテム）を読み込む
const cache = {};

export async function loadLevel(lv) {
  lv = Number(lv);
  if (!cache[lv]) {
    cache[lv] = import(`../data/levels/lv${lv}.js`).then((m) => m.default);
    // 失敗したら（オフライン等）、つぎに呼ばれたときに読みなおせるよう消しておく
    cache[lv].catch(() => { delete cache[lv]; });
  }
  return cache[lv];
}

export async function getStageContent(lv, era) {
  const data = await loadLevel(lv);
  return data[era] || null;
}
