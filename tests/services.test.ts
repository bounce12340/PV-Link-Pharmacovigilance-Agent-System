import { describe, it, expect } from 'vitest';
import { parseJsonLoose, reconcile } from '../services/llmService';
import { lookupMeddra } from '../services/meddra';
import { buildCIOMS, ciomsToText } from '../services/cioms';
import { aggregateSignals } from '../services/signals';

describe('parseJsonLoose', () => {
  it('解析純 JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it('去除 ```json 圍欄', () => {
    expect(parseJsonLoose('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it('擷取前後雜訊中的 JSON', () => {
    expect(parseJsonLoose('好的，結果是 {"a":3} 以上')).toEqual({ a: 3 });
  });
  it('無法解析回 null', () => {
    expect(parseJsonLoose('completely not json')).toBeNull();
    expect(parseJsonLoose('')).toBeNull();
  });
});

describe('reconcile', () => {
  it('依 pmid 對映，缺漏以 fallback 補上', () => {
    const records = [{ pmid: '1' }, { pmid: '2' }];
    const results = [{ pmid: '1', score: 80 }];
    const out = reconcile(records, results, (r) => ({ pmid: r.pmid, score: 50 }));
    expect(out).toEqual([{ pmid: '1', score: 80 }, { pmid: '2', score: 50 }]);
  });
  it('容忍數字型 pmid 與字串型 pmid 混用', () => {
    const records = [{ pmid: '123' }];
    const results = [{ pmid: 123, score: 90 }];
    const out = reconcile(records, results, (r) => ({ pmid: r.pmid, score: 50 }));
    expect(out[0].score).toBe(90);
  });
  it('保證輸出筆數等於輸入筆數', () => {
    const records = [{ pmid: 'a' }, { pmid: 'b' }, { pmid: 'c' }];
    const out = reconcile(records, [], (r) => ({ pmid: r.pmid }));
    expect(out).toHaveLength(3);
  });
});

describe('lookupMeddra', () => {
  it('精確命中 PT', () => {
    const r = lookupMeddra('Rhabdomyolysis');
    expect(r.matched).toBe(true);
    expect(r.soc).toContain('Musculoskeletal');
  });
  it('大小寫與空白不敏感', () => {
    expect(lookupMeddra('  rhabdomyolysis ').matched).toBe(true);
  });
  it('命中中文同義詞', () => {
    const r = lookupMeddra('橫紋肌溶解');
    expect(r.matched).toBe(true);
    expect(r.pt).toBe('Rhabdomyolysis');
  });
  it('命中英文同義詞 (cpk increased)', () => {
    expect(lookupMeddra('CPK increased').pt).toBe('Blood creatine phosphokinase increased');
  });
  it('未收錄詞回 matched=false 且保留原字串', () => {
    const r = lookupMeddra('some novel unlisted event xyz');
    expect(r.matched).toBe(false);
    expect(r.pt).toBe('some novel unlisted event xyz');
    expect(r.soc).toBeNull();
  });
  it('空字串安全處理', () => {
    expect(lookupMeddra('').matched).toBe(false);
    expect(lookupMeddra(null).matched).toBe(false);
  });
  it('寬鬆比對：候選片語包含已知 PT 時命中（單向）', () => {
    const r = lookupMeddra('severe rhabdomyolysis reported in patient');
    expect(r.matched).toBe(true);
    expect(r.pt).toBe('Rhabdomyolysis');
  });
  it('寬鬆比對：泛詞 "increased" 不應反向誤命中最長詞條 (review #3)', () => {
    expect(lookupMeddra('increased').matched).toBe(false);
  });
});

describe('buildCIOMS / ciomsToText', () => {
  const record = {
    pmid: '999',
    title: 'Fenofibrate-induced rhabdomyolysis: a case report',
    journal: 'J Clin Pharm',
    dp: '2026-03-01',
    authors: ['Chen'],
    original_search_term: 'Fenofibrate',
    conclusion_zh: '應監測 CPK。',
    pv_data: {
      product: '藥品A',
      ingredient: 'Fenofibrate',
      ae_verbatim: 'severe muscle pain',
      meddra_pt_candidate: 'Rhabdomyolysis',
      meddra_confidence: 88,
      seriousness: 'Serious (hospitalization)',
      population: '65M',
      dosage_route: '200mg PO',
      tto: '3 weeks',
      outcome: 'Recovered',
      causality: 'Probable',
      completeness: 'Complete',
    },
  };
  it('映射關鍵 E2B 欄位', () => {
    const d = buildCIOMS(record, '2026-07-08T00:00:00.000Z');
    expect(d.e2b['E.i.2.1b (MedDRA PT)']).toBe('Rhabdomyolysis');
    expect(d.e2b['G.k.2.2 (Active substance)']).toBe('Fenofibrate');
    expect(d.meddraSoc).toContain('Musculoskeletal');
    expect(d.literatureReference).toContain('PMID: 999');
  });
  it('narrative 非空且含成分與事件', () => {
    const d = buildCIOMS(record, '');
    expect(d.narrative).toContain('Fenofibrate');
    expect(d.narrative.length).toBeGreaterThan(10);
  });
  it('缺 pv_data 時不拋錯，回 N/A 骨架', () => {
    const d = buildCIOMS({ title: 'x', pmid: '1' }, '');
    expect(d.suspectDrug).toBe('N/A');
    expect(ciomsToText(d)).toContain('CIOMS-I');
  });
});

describe('aggregateSignals', () => {
  const rec = (pmid: string, ingredient: string, pt: string, serious = false) => ({
    pmid,
    original_search_term: ingredient,
    pv_data: { ingredient, meddra_pt_candidate: pt, seriousness: serious ? 'Serious, hospitalization' : 'Non-serious' },
  });
  it('相同成分×PT 併為同一組並計數', () => {
    const rep = aggregateSignals([
      rec('1', 'Fenofibrate', 'Rhabdomyolysis', true),
      rec('2', 'Fenofibrate', 'Rhabdomyolysis', false),
      rec('3', 'Fenofibrate', 'Myalgia'),
    ]);
    const rhabdo = rep.groups.find(g => g.pt === 'Rhabdomyolysis');
    expect(rhabdo?.count).toBe(2);
    expect(rhabdo?.seriousCount).toBe(1);
    expect(rhabdo?.pmids).toEqual(['1', '2']);
  });
  it('依中文/英文同義詞標準化後合併 (橫紋肌溶解 → Rhabdomyolysis)', () => {
    const rep = aggregateSignals([
      rec('1', 'Fenofibrate', 'Rhabdomyolysis'),
      rec('2', 'Fenofibrate', '橫紋肌溶解'),
    ]);
    expect(rep.groups).toHaveLength(1);
    expect(rep.groups[0].count).toBe(2);
  });
  it('無 pv_data 的文獻計入 skipped', () => {
    const rep = aggregateSignals([
      rec('1', 'Fenofibrate', 'Rhabdomyolysis'),
      { pmid: '2', original_search_term: 'X' },
    ]);
    expect(rep.skipped).toBe(1);
    expect(rep.analysedRecords).toBe(1);
  });
  it('seriousness 含否定語意 (not hospitalized) 不計為嚴重 (review #2)', () => {
    const rep = aggregateSignals([
      { pmid: '1', original_search_term: 'A', pv_data: { ingredient: 'A', meddra_pt_candidate: 'Myalgia', seriousness: 'not hospitalized' } },
    ]);
    expect(rep.groups[0].seriousCount).toBe(0);
  });
  it('依 count 由多到少排序', () => {
    const rep = aggregateSignals([
      rec('1', 'A', 'Myalgia'),
      rec('2', 'B', 'Rhabdomyolysis'),
      rec('3', 'B', 'Rhabdomyolysis'),
    ]);
    expect(rep.groups[0].count).toBeGreaterThanOrEqual(rep.groups[1].count);
  });
});
