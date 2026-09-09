// worker/ae.js 的純函式測試。
//
// 重點不是「函式會不會跑」，而是**前後端兩份判定邏輯必須一致**：
// worker/ae.js 為了寫入 D1 的索引欄位，重寫了一份「是否嚴重」與「法定期限」的計算，
// 這是刻意的鏡像（Worker 不能匯入 TypeScript 的前端模組）。鏡像會漂移，
// 所以這裡用同一批個案同時餵給兩邊，逐案比對結果。
import { describe, it, expect } from 'vitest';
// 直接匯入 Worker 的原始 .js（tsconfig 已開 allowJs），不另做包裝——
// 包裝層本身就會成為第二個可能與部署版本不同步的地方。
import {
  deriveSerious, deriveDueDate, indexColumns, parseIsoDate, addDays,
} from '../worker/ae.js';
import {
  emptyAEReport, emptyEvent, emptyDrug,
  assessSeriousness, computeRegulatoryClock, AEReport,
} from '../services/aeReport';

const TODAY = '2026-09-08';

function caseOf(over: Partial<AEReport> = {}): AEReport {
  return {
    ...emptyAEReport(TODAY),
    caseNumber: 'PV-2026-0001',
    awarenessDate: '2026-09-01',
    patientInitials: 'W.T.M.',
    events: [{ ...emptyEvent(), id: 'ev1', verbatim: '紅疹' }],
    drugs: [{ ...emptyDrug(true), id: 'dr1', brandName: 'Lipanthyl', activeIngredient: 'Fenofibrate' }],
    ...over,
  };
}

const serious = (over: Partial<AEReport> = {}) => caseOf({
  events: [{ ...emptyEvent(), id: 'ev1', verbatim: '住院', seriousnessCriteria: ['hospitalization'] }],
  ...over,
});

describe('worker 日期工具', () => {
  it('parseIsoDate 與前端同樣拒絕溢位與非法格式', () => {
    expect(parseIsoDate('2026-09-08')?.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026/09/08')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });
  it('addDays 跨年正確；無效輸入回 null（前端回空字串，此處要落成 SQL NULL）', () => {
    expect(addDays('2026-12-25', 15)).toBe('2027-01-09');
    expect(addDays('bad', 15)).toBeNull();
  });
});

describe('worker 與前端的嚴重性／時鐘判定必須一致', () => {
  // 每個案例都涵蓋一條分支：無嚴重度、有嚴重度、人工判嚴重、人工判非嚴重、
  // 追蹤報告有無重要新資訊、缺 Day 0。
  const fixtures: Array<[string, AEReport]> = [
    ['非嚴重個案', caseOf()],
    ['住院 → 嚴重', serious()],
    ['人工覆寫為嚴重', caseOf({ triage: { ...emptyAEReport(TODAY).triage, seriousnessOverride: 'serious' } })],
    ['人工覆寫為非嚴重', serious({ triage: { ...emptyAEReport(TODAY).triage, seriousnessOverride: 'non_serious' } })],
    ['追蹤報告帶重要新資訊 → 重啟時鐘', serious({ reportType: 'follow_up', hasSignificantNewInfo: true, awarenessDate: '2026-09-05' })],
    ['追蹤報告純補件 → 不重啟時鐘', serious({ reportType: 'follow_up', hasSignificantNewInfo: false })],
    ['嚴重但缺 Day 0', serious({ awarenessDate: '' })],
    ['多事件僅其一嚴重', caseOf({
      events: [
        { ...emptyEvent(), id: 'e1', verbatim: '頭暈' },
        { ...emptyEvent(), id: 'e2', verbatim: '過敏性休克', seriousnessCriteria: ['life_threatening'] },
      ],
    })],
  ];

  for (const [name, report] of fixtures) {
    it(name, () => {
      const clock = computeRegulatoryClock(report, TODAY);
      expect(deriveSerious(report)).toBe(assessSeriousness(report).serious);
      // 前端沒有期限時回空字串，Worker 回 null（SQL 欄位要 NULL）——語意相同。
      expect(deriveDueDate(report) || '').toBe(clock.dueDate);
    });
  }
});

describe('indexColumns', () => {
  it('取首個 suspect 藥品，並把病人代號正規化為比對用鍵', () => {
    const r = caseOf({
      country: 'JP',
      patientInitials: '  W.T.M. ',
      drugs: [
        { ...emptyDrug(false), id: 'd0', brandName: 'Concomitant' },
        { ...emptyDrug(true), id: 'd1', brandName: 'Lipanthyl', activeIngredient: 'Fenofibrate' },
      ],
    });
    const cols = indexColumns(r);
    expect(cols.suspect_drug).toBe('Lipanthyl');
    expect(cols.patient_key).toBe('w.t.m.');
    expect(cols.country).toBe('JP');
    expect(cols.report_type).toBe('initial');
    expect(cols.serious).toBe(0);
    expect(cols.due_date).toBeNull();
  });

  it('無 brandName 時退回成分名', () => {
    const r = caseOf({ drugs: [{ ...emptyDrug(true), id: 'd1', brandName: '', activeIngredient: 'Fenofibrate' }] });
    expect(indexColumns(r).suspect_drug).toBe('Fenofibrate');
  });

  it('嚴重個案寫入到期日，並沿用 payload 的狀態', () => {
    const cols = indexColumns(serious({ status: 'submitted' }));
    expect(cols.serious).toBe(1);
    expect(cols.due_date).toBe('2026-09-16');
    expect(cols.status).toBe('submitted');
  });

  it('payload 沒帶狀態時預設為 submitted——能進到後端就代表已送出', () => {
    expect(indexColumns(caseOf({ status: '' as any })).status).toBe('submitted');
    expect(indexColumns({} as AEReport).status).toBe('submitted');
  });

  it('空白欄位一律落成 NULL 而非空字串（空字串在 SQL 的比對語意不同）', () => {
    const cols = indexColumns({} as AEReport);
    expect(cols.country).toBeNull();
    expect(cols.patient_key).toBeNull();
    expect(cols.suspect_drug).toBeNull();
    expect(cols.awareness_date).toBeNull();
    expect(cols.follow_up_of_id).toBeNull();
  });

  it('追蹤報告保留父案 id', () => {
    const cols = indexColumns(caseOf({ reportType: 'follow_up', followUpOfId: 'root-1' }));
    expect(cols.report_type).toBe('follow_up');
    expect(cols.follow_up_of_id).toBe('root-1');
  });
});
