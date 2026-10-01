// @vitest-environment node
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Field, TextInput, TextArea, ChipGroup, CheckGroup } from '../components/ui';
import { translations } from '../i18n/translations';

const h = React.createElement;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SOURCES = ['App.tsx', 'components/ui.tsx', 'components/AEIntakeConsole.tsx', 'components/AEReportMobile.tsx', 'components/ProfileSetup.tsx', 'components/CaseWorkBoard.tsx'];

describe('Field label / input binding (P2)', () => {
  it('binds label htmlFor to the child input id and exposes required + hint', () => {
    const html = render(h(Field, { label: '姓名', required: true, hint: '提示文字' }, h(TextInput, { value: '', onChange: () => {} })));
    const inputId = /<input[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
    expect(html).toContain('aria-required="true"');
    const hintId = /<p id="([^"]+)"/.exec(html)?.[1];
    expect(hintId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${hintId}"`);
  });
  it('does not mark optional fields as required and works for textarea', () => {
    const html = render(h(Field, { label: '備註' }, h(TextArea, { value: '', onChange: () => {} })));
    expect(html).not.toContain('aria-required');
    expect(/<textarea[^>]*\sid="/.test(html)).toBe(true);
    expect(html).toContain('<label');
  });
  it('gives two Fields different ids', () => {
    const html = render(h('div', null,
      h(Field, { label: 'A' }, h(TextInput, { value: '', onChange: () => {} })),
      h(Field, { label: 'B' }, h(TextInput, { value: '', onChange: () => {} }))));
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
  it('uses role=group + aria-labelledby for chip groups instead of a dangling label', () => {
    const opts = [{ value: 'a', zh: '甲', en: 'A' }];
    const chip = render(h(Field, { label: '性別', required: true }, h(ChipGroup, { options: opts, value: '', onChange: () => {}, lang: 'zh' })));
    expect(chip).toContain('role="group"');
    expect(chip).toMatch(/aria-labelledby="([^"]+)-label"/);
    expect(chip).not.toContain('<label');
    const chk = render(h(Field, { label: '嚴重性' }, h(CheckGroup, { options: opts, values: [], onChange: () => {}, lang: 'zh' })));
    expect(chk).toContain('role="group"');
  });
  it('CIOMS tag is 12px+ and not forced uppercase', () => {
    const html = render(h(Field, { label: 'X', tag: 'CIOMS 24c' }, h(TextInput, { value: '', onChange: () => {} })));
    expect(html).toContain('CIOMS 24c');
    expect(html).not.toMatch(/uppercase[^"]*">CIOMS/);
    expect(html).not.toMatch(/text-\[(8|9|10|11)px\]/);
  });
});

describe('keyboard focus, type size and layout regressions (P1/P3/P4/P5/P7/P8)', () => {
  it('global :focus-visible outline exists and no source removes outlines', () => {
    expect(read('index.css')).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    for (const f of SOURCES) expect(read(f), f).not.toMatch(/(^|[\s"'`])outline-none/);
  });
  it('no text smaller than 12px', () => {
    for (const f of SOURCES) expect(read(f), f).not.toMatch(/text-\[(\d|10|11)px\]/);
  });
  it('mobile nav wraps into a grid (no horizontal scroll) and marks the current tab', () => {
    const app = read('App.tsx');
    expect(app).toContain('grid grid-cols-3');
    expect(app).toContain("aria-current={active ? 'page' : undefined}");
    expect(app).not.toMatch(/<aside[^>]*overflow-x-auto/);
  });
  it('primary run button always has visible text on mobile', () => {
    const app = read('App.tsx');
    expect(app).not.toContain('<span className="hidden md:inline">{isProcessing');
  });
  it('database page stacks on mobile and date inputs may shrink', () => {
    const app = read('App.tsx');
    expect(app).toContain('flex flex-col md:flex-row md:justify-between');
    expect(app).toMatch(/type="date"[^\n]*className="w-full min-w-0/);
  });
  it('background blur blobs are gone', () => {
    expect(read('App.tsx')).not.toContain('blur-[120px]');
  });
});

describe('copy changes (i18n)', () => {
  it('empty-case hint no longer depends on layout direction', () => {
    expect(translations.zh['ae.console.selectCase']).not.toContain('左側');
    expect(translations.en['ae.console.selectCase']).not.toMatch(/left/i);
  });
  it('workbench title is short; long description lives in subtitle', () => {
    expect(translations.zh['work.title']).toBe('工作台');
    expect(translations.zh['work.subtitle']).toContain('個案工作狀態');
    expect(translations.en['work.title']).toBe('Workbench');
  });
  it('run action is named consistently in both languages', () => {
    expect(translations.zh['header.run']).toBe('開始檢索');
    expect(translations.en['header.run']).toBe('Start search');
  });
});
