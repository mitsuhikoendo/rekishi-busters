// オフライン対応：全ファイルをキャッシュし、ネットにつながるときは裏で更新する
const VERSION = 'v1';
const CACHE = `rekishi-busters-${VERSION}`;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/state.js', 'js/audio.js', 'js/ui.js', 'js/ruby.js', 'js/content.js', 'js/battleLogic.js',
  'js/screens/home.js', 'js/screens/levelMap.js', 'js/screens/video.js', 'js/screens/battle.js', 'js/screens/zukan.js',
  'data/eras.js', 'data/levels.js',
  'data/levels/lv1.js', 'data/levels/lv2.js', 'data/levels/lv3.js',
  'data/levels/lv4.js', 'data/levels/lv5.js', 'data/levels/lv6.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 1つ失敗しても他はキャッシュする
      .then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {}))))
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
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }),
  );
});
