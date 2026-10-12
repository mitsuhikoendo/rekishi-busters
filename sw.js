// オフライン対応：全ファイルをキャッシュしておき、ネットにつながるときは新しいファイルを使う
// （ネットワーク優先。古いエンジンと新しいデータが混ざらないように）。リリースごとに VERSION を上げる。
// 電波が弱くて応答がおそいときは、NETWORK_TIMEOUT_MS であきらめてキャッシュを使う。
// ブラウザの HTTP キャッシュに残った古いファイルがまざらないよう、install も fetch も HTTP キャッシュを通さずに取りにいく。
const VERSION = 'v6';
const NETWORK_TIMEOUT_MS = 3000;
const CACHE = `rekishi-busters-${VERSION}`;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/state.js', 'js/audio.js', 'js/ui.js', 'js/ruby.js', 'js/content.js', 'js/battleLogic.js',
  'js/screens/home.js', 'js/screens/levelMap.js', 'js/screens/video.js', 'js/screens/battle.js', 'js/screens/zukan.js', 'js/screens/era.js',
  'data/eras.js', 'data/levels.js',
  'data/levels/lv1.js', 'data/levels/lv2.js', 'data/levels/lv3.js',
  'data/levels/lv4.js', 'data/levels/lv5.js', 'data/levels/lv6.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 1つ失敗しても他はキャッシュする
      .then((c) => Promise.all(FILES.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const cacheP = caches.open(CACHE);
  // 時間切れでキャッシュを返したあとも、届いた新しいファイルはキャッシュに入れておく
  const network = fetch(req, { cache: 'no-cache' }).then(async (res) => {
    if (res.ok) await (await cacheP).put(req, res.clone()).catch(() => {});
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  e.respondWith(
    cacheP.then(async (cache) => {
      const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS); });
      const fast = await Promise.race([network.catch(() => null), timeout]);
      if (fast) return fast;
      // オフライン・時間切れ：キャッシュから
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      // キャッシュに無いときは、ネットワークの応答を待つ
      try {
        return await network;
      } catch {
        if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
        return Response.error();
      }
    }),
  );
});
