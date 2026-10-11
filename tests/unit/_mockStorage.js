// テスト用の localStorage もどき
export function installStorage() {
  const data = new Map();
  const ls = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    _data: data,
  };
  globalThis.localStorage = ls;
  return ls;
}
