// 画面共通の小さな部品
export { rubyHtml as r, escapeHtml } from './ruby.js';

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

// モーダル。closeで閉じる関数を返す。
export function openModal(innerHtml, { onClose, dismissible = true } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
  root.appendChild(wrap);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    onClose?.();
  };
  if (dismissible) {
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  }
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: wrap.firstElementChild, close };
}

export function closeAllModals() {
  document.getElementById('modal-root').innerHTML = '';
}

export function toast(text, ms = 1500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function confetti(count = 40) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  const colors = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3500);
}

export function stars(n, max = 3) {
  let s = '';
  for (let i = 0; i < max; i++) s += i < n ? '★' : '☆';
  return `<span class="stars">${s}</span>`;
}
