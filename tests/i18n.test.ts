import { describe, it, expect } from 'vitest';
import { translations } from '../i18n/translations';

describe('i18n translations', () => {
  it('zh and en have identical key sets', () => {
    const zh = Object.keys(translations.zh).sort();
    const en = Object.keys(translations.en).sort();
    expect(en).toEqual(zh);
  });
  it('no empty values in either language', () => {
    (['zh', 'en'] as const).forEach(lang => {
      Object.entries(translations[lang]).forEach(([k, v]) => {
        expect(v, `${lang}.${k} is empty`).toBeTruthy();
      });
    });
  });
});
