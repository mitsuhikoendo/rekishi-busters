// レイアウト確認の共通部品
import { mkdirSync } from 'node:fs';
import { ROOT } from './helpers.js';

export const SHOT_DIR = `${ROOT}tests/e2e/screenshots`;
mkdirSync(SHOT_DIR, { recursive: true });

// 横にはみ出す要素（演出用の要素はのぞく）と scrollWidth
export async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out = [...document.querySelectorAll('#app *, #modal-root *')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > w + 1 || b.left < -1); })
      .filter((el) => !el.closest('.weapon-fly, .fx, .confetti, .art-bg, .scene-art'))
      .slice(0, 5).map((el) => `${el.tagName}.${el.className} left=${Math.round(el.getBoundingClientRect().left)} right=${Math.round(el.getBoundingClientRect().right)}`);
    return { sw: document.documentElement.scrollWidth, w, out };
  });
}

// ボタンの文字と、見えている背景のコントラスト比が 3 未満のもの
export async function lowContrast(page, sel) {
  return page.$$eval(sel, (bs) => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 1) break;
      }
      let out = { r: 43, g: 29, b: 92 }; // body の背景（#2b1d5c 付近）
      for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) };
      return out;
    };
    return bs.filter((b) => b.getBoundingClientRect().width > 0).map((b) => {
      const L1 = lum(parse(getComputedStyle(b).color)); const L2 = lum(bgOf(b));
      return { text: b.textContent.trim().slice(0, 20), ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 };
    }).filter((x) => x.ratio < 3).map((x) => `${x.text}（${x.ratio}）`);
  });
}

export async function shot(page, name, size) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOT_DIR}/${size.width}x${size.height}-${name}.png` });
}
