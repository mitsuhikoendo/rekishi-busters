// 効果音（Web Audioで合成）とナレーション（SpeechSynthesis）
import { getState } from './state.js';
import { rubyReading } from './ruby.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
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
  jaVoice = voices.find((v) => v.lang === 'ja-JP' && /Kyoko|O-ren|Google/.test(v.name))
    || voices.find((v) => v.lang && v.lang.startsWith('ja')) || null;
  return jaVoice;
}

// 読み終わったら resolve する。読み上げできないときは false で resolve。
export function speak(text) {
  return new Promise((resolve) => {
    if (!getState().settings.voice || !canSpeak()) return resolve(false);
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(rubyReading(text));
      u.lang = 'ja-JP';
      u.rate = 1.0;
      u.pitch = 1.1;
      const v = pickVoice();
      if (v) u.voice = v;
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
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

// 最初のタップでAudioContextを起こす（iOS対策）
export function unlockAudio() {
  ac();
}
