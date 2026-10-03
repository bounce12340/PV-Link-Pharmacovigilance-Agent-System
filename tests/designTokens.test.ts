// @vitest-environment node
//
// 設計 token 的守門測試：用原始碼掃描擋下「看起來沒差、其實讀不到」的退步。
//
// 這些規則都來自實測（axe color-contrast 跑真實 app 的 15 個畫面），不是品味：
// 修正前亮色 112 處、暗色 113 處對比不足，修正後 0。下面每條規則對應其中一類成因。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const UI_FILES = ['App.tsx', 'index.html', ...readdirSync(new URL('../components', import.meta.url)).filter(f => f.endsWith('.tsx')).map(f => `components/${f}`)];
const sources = UI_FILES.map(f => ({ f, s: read(f) }));
const css = read('index.css');

/** 回傳所有符合 pattern 的「檔名:行號 片段」，方便失敗時直接定位。 */
function offenders(pattern: RegExp) {
  const out: string[] = [];
  for (const { f, s } of sources) {
    s.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(new RegExp(pattern.source, 'g'))) out.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  return out;
}

// WCAG 2.x 相對亮度與對比
const lum = (hex: string) => {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgbVar = (scope: string, name: string) => {
  const block = css.match(new RegExp(`${scope.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))?.find(b => b.includes(`--${name}:`));
  const m = block?.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`index.css 找不到 ${scope} 的 --${name}`);
  return m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('');
};

describe('colour tokens', () => {
  it('uses only semantic colour names (and slate as the one neutral) in components', () => {
    // 色相名會讓人挑「好看的粉紅」；語意名逼人先回答「這是不是危險」。見 tailwind.config.js。
    const raw = offenders(/(?<![\w-])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|to|via|divide|fill|stroke|outline|placeholder|accent|decoration|caret|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone)-\d{2,3}\b/);
    expect(raw).toEqual([]);
  });

  it('keeps raw hex colours out of class names', () => {
    expect(offenders(/(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/)).toEqual([]);
  });

  it('defines muted text that passes 4.5:1 on every surface it was measured on', () => {
    // 亮色：白卡、頁面底色、帶色光暈、brand-50 選取列、slate-100
    for (const bg of ['ffffff', rgbVar(':root', 'canvas'), 'f1f5fd', 'eef2ff', 'f1f5f9']) {
      expect(contrast(rgbVar(':root', 'muted'), bg)).toBeGreaterThanOrEqual(4.5);
    }
    // 暗色：頁面底色、slate-800 卡片、表頭與選取列這類提亮的面板
    for (const bg of [rgbVar(':root.dark', 'canvas'), '1e293b', '34385c', '3a4257', '433c51']) {
      expect(contrast(rgbVar(':root.dark', 'muted'), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('writes secondary text with the muted token rather than light slate shades', () => {
    // slate-400 在白底 2.6:1、slate-500 在帶色底 4.1–4.4:1：都是修正前最大宗的違規
    expect(offenders(/(?<![\w:/-])text-slate-(?:300|400|500)(?![\w/-])/)).toEqual([]);
  });

  it('keeps light-mode semantic text at a shade that is readable on tinted surfaces', () => {
    // 在 brand-50、danger-100 等淡色底上實測：success ≥700、caution ≥800（700 只有 4.49:1）、danger ≥700、brand ≥600
    expect(offenders(/(?<![\w:/-])text-(?:success-(?:[1-6]00|50)|caution-(?:[1-7]00|50)|danger-(?:[1-6]00|50)|brand-(?:[1-5]00|50))(?![\w/-])/)).toEqual([]);
  });

  it('keeps dark-mode semantic text bright enough for lifted dark panels', () => {
    // -400 在表頭這類提亮的深色面板上只有 3.4–4.2:1
    expect(offenders(/(?<![\w/-])dark:text-(?:brand|danger)-(?:[4-9]00|950)(?![\w/-])/)).toEqual([]);
  });

  it('never puts white text on success or caution fills lighter than 700', () => {
    // 白字配 success-600 只有 3.77:1、caution-600 只有 3.19:1
    const bad: string[] = [];
    for (const { f, s } of sources) {
      for (const m of s.matchAll(/(['"`])((?:(?!\1)[^\n])*)\1/g)) {
        if (/(?<![\w:-])text-white\b/.test(m[2]) && /(?<![\w:/-])bg-(?:success|caution)-(?:[1-6]00|50)\b/.test(m[2])) bad.push(`${f}: ${m[2].slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('gives <body> the canvas token so dark mode never flashes a light page', () => {
    // 原本 body 是 bg-gray-50 且沒有暗色變體：iOS 越界回彈、React 掛載前都會露出亮底
    expect(read('index.html')).toMatch(/<body class="[^"]*\bbg-canvas\b/);
  });
});
