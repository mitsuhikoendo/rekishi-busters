import { load } from './state.js';
import { unlockAudio, stopSpeak } from './audio.js';
import { closeAllModals } from './ui.js';
import * as home from './screens/home.js';
import * as levelMap from './screens/levelMap.js';
import * as video from './screens/video.js';
import * as battle from './screens/battle.js';
import * as zukan from './screens/zukan.js';
import * as era from './screens/era.js';

const ROUTES = [
  { re: /^#\/home$/, screen: home, keys: [] },
  { re: /^#\/level\/(\d)$/, screen: levelMap, keys: ['lv'] },
  { re: /^#\/video\/(\d)\/([a-z]+)$/, screen: video, keys: ['lv', 'era'] },
  { re: /^#\/battle\/(\d)\/([a-z]+)$/, screen: battle, keys: ['lv', 'era'] },
  { re: /^#\/review$/, screen: battle, keys: [], extra: { review: true } },
  { re: /^#\/zukan$/, screen: zukan, keys: [] },
  { re: /^#\/eras$/, screen: era, keys: [] },
  { re: /^#\/era\/([a-z]+)$/, screen: era, keys: ['era'] },
  { re: /^#\/eravideo\/([a-z]+)\/(\d|all)$/, screen: video, keys: ['era', 'lv'], extra: { eraMode: true } },
  { re: /^#\/erabattle\/([a-z]+)$/, screen: battle, keys: ['era'], extra: { eraBattle: true } },
];

const app = document.getElementById('app');
let cleanup = null;
let navToken = 0;

async function route() {
  const token = ++navToken;
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  stopSpeak();
  closeAllModals();

  const hash = location.hash || '#/home';
  let match = null;
  let params = {};
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (m) {
      match = r;
      params = { ...(r.extra || {}) };
      r.keys.forEach((k, i) => { params[k] = k === 'lv' && /^\d+$/.test(m[i + 1]) ? Number(m[i + 1]) : m[i + 1]; });
      break;
    }
  }
  if (!match) {
    location.replace('#/home');
    return;
  }
  app.innerHTML = '';
  app.className = '';
  window.scrollTo(0, 0);
  try {
    const result = await match.screen.render(app, params);
    if (token !== navToken) {
      // 描画中に別の画面へ移動した
      if (typeof result === 'function') result();
      return;
    }
    cleanup = result;
  } catch (e) {
    console.error(e);
    if (token === navToken) {
      app.innerHTML = `<div class="screen center"><p>エラーがおきました🙇</p><a class="btn" href="#/home">ホームへ</a></div>`;
    }
  }
}

// 起動できたので、index.html の「よみこみちゅう／よみこめなかった」表示を消す
window.rekishiBooted = true;
document.getElementById('boot')?.remove();

load();
window.addEventListener('hashchange', route);
document.addEventListener('pointerdown', unlockAudio);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
