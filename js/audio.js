// 効果音（Web Audioで合成）とナレーション（SpeechSynthesis）
import { getState } from './state.js';
import { rubySpeech } from './ruby.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // iOS は電話・バックグラウンドのあと 'interrupted' になるので、'running' 以外なら起こす
  if (ctx.state !== 'running') {
    try { Promise.resolve(ctx.resume()).catch(() => {}); } catch { /* noop */ }
  }
  return ctx;
}

function tone(freq, start, dur, type = 'square', vol = 0.12, slideTo = null) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX = {
  tap: () => tone(660, 0, 0.06, 'square', 0.06),
  correct: () => { tone(784, 0, 0.1); tone(1047, 0.1, 0.18); },
  wrong: () => { tone(220, 0, 0.18, 'sawtooth', 0.1); tone(160, 0.15, 0.25, 'sawtooth', 0.1); },
  throw: () => tone(300, 0, 0.25, 'triangle', 0.15, 1200),
  hit: () => tone(140, 0, 0.18, 'square', 0.18, 60),
  poof: () => { tone(900, 0, 0.3, 'triangle', 0.12, 200); },
  coin: () => { tone(988, 0, 0.08); tone(1319, 0.08, 0.2); },
  damage: () => tone(100, 0, 0.3, 'sawtooth', 0.18, 50),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 'square', 0.1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.2, 0.3, 'triangle', 0.12)),
  item: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.2, 'triangle', 0.12)),
};

export function sfx(name) {
  if (!getState().settings.sound) return;
  try { SFX[name]?.(); } catch { /* noop */ }
}

// ---- ナレーション ----
export function canSpeak() {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

let jaVoice;
function pickVoice() {
  if (jaVoice !== undefined) return jaVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // まだ読み込み中
  const ja = voices.filter((v) => v.lang && v.lang.replace('_', '-').startsWith('ja'));
  // 高品質な音声（拡張・プレミアム）→ 定番の音声 → そのほかの日本語音声 の順に選ぶ
  jaVoice = ja.find((v) => /Enhanced|Premium|拡張|プレミアム|Natural/.test(v.name))
    || ja.find((v) => /Kyoko|O-ren|Google/.test(v.name))
    || ja[0] || null;
  return jaVoice;
}

// 音声の一覧はあとから読み込まれることがあるので、変わったら選びなおす
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.addEventListener('voiceschanged', () => { jaVoice = undefined; });
  } catch { /* noop */ }
}

// 読み上げの終了イベントが来ないとき（iOS Safari 等）にあきらめるまでの時間
const SPEAK_MS_PER_CHAR = 250;
const SPEAK_EXTRA_MS = 3000;

// 読み終わったら resolve する。読み上げできないときは false で resolve。
// onend が来なくても、文字数から計算した時間がたてば true で resolve する。
export function speak(text) {
  return new Promise((resolve) => {
    if (!getState().settings.voice || !canSpeak()) return resolve(false);
    try {
      window.speechSynthesis.cancel();
      const reading = rubySpeech(text);
      const u = new SpeechSynthesisUtterance(reading);
      u.lang = 'ja-JP';
      u.rate = 1.0;
      u.pitch = 1.0;
      const v = pickVoice();
      if (v) u.voice = v;
      let done = false;
      let timeoutId = null;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        resolve(ok);
      };
      timeoutId = setTimeout(() => finish(true), reading.length * SPEAK_MS_PER_CHAR + SPEAK_EXTRA_MS);
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      window.speechSynthesis.speak(u);
    } catch {
      resolve(false);
    }
  });
}

export function stopSpeak() {
  try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* noop */ }
}

// タップのたびにAudioContextを起こす（iOS対策：中断から復帰したあとも鳴るように）
export function unlockAudio() {
  ac();
}
