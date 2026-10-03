// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
  // 鍵數一致只保證「有翻」，保證不了「翻對語言」：把中文貼進 en 區塊照樣通過
  // 上面兩個測試。英文介面不該出現任何中日韓字元。
  it('no CJK characters in any English value', () => {
    Object.entries(translations.en).forEach(([k, v]) => {
      expect(v, `en.${k} contains CJK text`).not.toMatch(/[一-鿿]/);
    });
  });
});

describe('submission outcome messages', () => {
  // 送出結果畫面上，「版本衝突」是唯一代表「其實沒送達」的狀態。送出就開始跑
  // 法定 15 日時鐘，英文使用者若讀不懂這句，會以為通報已經送出。
  it('states plainly in English that a conflicted submission was not delivered', () => {
    expect(translations.en['ae.submit.conflict']).toMatch(/not delivered/i);
    expect(translations.zh['ae.submit.conflict']).toContain('尚未送達');
  });

  // DoneScreen 沒有對外匯出，無法單獨 render，所以直接守原始碼：
  // 這一句曾經是寫死的中文、繞過了 t()，這個測試防止它再被寫死回去。
  it('renders the conflict message through t() instead of a hardcoded literal', () => {
    const src = readFileSync(new URL('../components/AEReportMobile.tsx', import.meta.url), 'utf8');
    expect(src).toContain("t('ae.submit.conflict')");
    expect(src).not.toContain('版本衝突');
  });
});
