// <html lang> 必須跟著介面語言（WCAG 3.1.1）。原本寫死 zh-TW：英文介面會被
// 螢幕閱讀器用中文語音念，瀏覽器挑後備字型與斷字也都依這個值。
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider, useLang } from '../i18n/LangContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let setLang: (l: 'zh' | 'en') => void;
const Probe = () => { setLang = useLang().setLang; return null; };

describe('<html lang>', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-TW'; });

  it('follows the interface language in both directions', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(LangProvider, null, React.createElement(Probe))); });
    expect(document.documentElement.lang).toBe('zh-TW');
    await act(async () => { setLang('en'); });
    expect(document.documentElement.lang).toBe('en');
    await act(async () => { setLang('zh'); });
    expect(document.documentElement.lang).toBe('zh-TW');
    act(() => root.unmount());
  });

  it('starts in English when English was the saved choice', async () => {
    localStorage.setItem('PV_LANG', 'en');
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(LangProvider, null, React.createElement(Probe))); });
    expect(document.documentElement.lang).toBe('en');
    act(() => root.unmount());
  });
});
