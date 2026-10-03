// @vitest-environment node
//
// 無障礙底線的回歸測試。
//
// 這些斷言看起來很細（在意一個 aria 屬性、在意 CSS 裡有沒有某段規則），
// 但它們守的是會靜默退化的東西：拿掉 aria-labelledby，畫面看起來一模一樣，
// 只有讀屏使用者會突然聽不到欄位名稱；拿掉 focus-visible 區塊，滑鼠使用者
// 完全不會發現。沒有測試的話，這類修補通常撐不過兩次重構。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field, TextInput, TextArea, ChipGroup, CheckGroup } from '../components/ui';

const OPTIONS = [
  { value: 'm', zh: '男', en: 'Male' },
  { value: 'f', zh: '女', en: 'Female' },
] as const;

/** 取出 <label id="…"> 的 id，再比對控制項的 aria-labelledby 是否指向它。 */
const labelId = (html: string) => html.match(/<label id="([^"]+)"/)?.[1];
const attr = (html: string, tag: string, name: string) =>
  html.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`))?.[1];

describe('form accessibility contract', () => {
  it('associates the field label with the input it labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '病人姓名縮寫' },
        React.createElement(TextInput, { value: '', onChange: () => {} })),
    );
    const id = labelId(html);
    expect(id).toBeTruthy();
    expect(attr(html, 'input', 'aria-labelledby')).toBe(id);
  });

  it('points aria-describedby at the hint and marks required fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '獲知日', required: true, hint: '法定 15 日時鐘的起算日' },
        React.createElement(TextInput, { type: 'date', value: '', onChange: () => {} })),
    );
    const hintId = html.match(/<p id="([^"]+)"/)?.[1];
    expect(hintId).toBeTruthy();
    expect(attr(html, 'input', 'aria-describedby')).toBe(hintId);
    expect(attr(html, 'input', 'aria-required')).toBe('true');
  });

  it('lets two controls share one label without colliding ids', () => {
    // 這是當初選 aria-labelledby 而非 htmlFor 的原因：起訖日期這類欄位一個
    // 標籤配兩個輸入框，htmlFor 需要唯一 id 就會撞，而重複 id 是靜默壞掉。
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '治療期間' },
        React.createElement('div', null,
          React.createElement(TextInput, { type: 'date', value: '', onChange: () => {} }),
          React.createElement(TextInput, { type: 'date', value: '', onChange: () => {} }))),
    );
    const id = labelId(html);
    const refs = [...html.matchAll(/<input[^>]*aria-labelledby="([^"]*)"/g)].map(m => m[1]);
    expect(refs).toEqual([id, id]);
    expect(html).not.toMatch(/<input[^>]*\sid="/);
  });

  it('keeps the caller’s own aria wiring when one is supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '不該被用到' },
        React.createElement(TextArea, { 'aria-labelledby': 'caller-owned', value: '', onChange: () => {} })),
    );
    expect(attr(html, 'textarea', 'aria-labelledby')).toBe('caller-owned');
  });

  it('groups chips under the field label', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '性別' },
        React.createElement(ChipGroup, { options: OPTIONS, value: '', onChange: () => {}, lang: 'zh' })),
    );
    const id = labelId(html);
    // group 要落在 chip 容器上，不是 Field 的外層包裝——包在外面會把標籤
    // 本身也算進群組內容，讀屏會重複唸一次題目。
    expect(html.match(/^<div[^>]*>/)?.[0]).not.toContain('role=');
    expect(html).toContain(`role="group" aria-labelledby="${id}"`);
  });

  it('groups checkboxes and hides the decorative tick from assistive tech', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, { label: '嚴重性準則' },
        React.createElement(CheckGroup, { options: OPTIONS, values: ['m'], onChange: () => {}, lang: 'zh' })),
    );
    expect(html).toContain(`role="group" aria-labelledby="${labelId(html)}"`);
    expect(html).toContain('aria-checked="true"');
    expect(html).toMatch(/<span aria-hidden="true"/);
  });

  it('does not suppress the focus ring on inputs', () => {
    const html = renderToStaticMarkup(
      React.createElement(TextInput, { value: '', onChange: () => {} }),
    );
    expect(html).not.toContain('outline-none');
  });
});

describe('global accessibility floor in index.css', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  it('defines a focus-visible ring for every interactive element', () => {
    expect(css).toContain('button:focus-visible');
    expect(css).toContain('input:focus-visible');
    expect(css).toContain('[role=\'checkbox\']:focus-visible');
    // 兩圈相反明度，才能同時在白底輸入框與 indigo 實心按鈕上看得見
    expect(css).toContain('--fv-inner');
    expect(css).toContain('--fv-outer');
    expect(css).toMatch(/box-shadow:\s*0 0 0 2px var\(--fv-inner\).*!important/);
  });

  it('keeps a forced-colors fallback so the ring survives high contrast mode', () => {
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('outline-color: Highlight');
  });

  it('honours prefers-reduced-motion but keeps loading spinners spinning', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    // 凍住的載入指示器會讓畫面看起來當掉，是誤報狀態而不是減少動態
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.animate-spin\s*\{[^}]*animation-iteration-count:\s*infinite/);
  });

  it('tells the browser about dark mode so native controls are drawn light-on-dark', () => {
    // 日曆圖示、select 選單是瀏覽器原生繪製，Tailwind 的 dark: class 管不到
    expect(css).toMatch(/:root\.dark\s*\{\s*color-scheme:\s*dark;?\s*\}/);
  });
});
