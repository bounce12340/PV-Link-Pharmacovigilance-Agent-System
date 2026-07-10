export type Lang = 'zh' | 'en';

const zh = {
  'nav.input': '檢索設定',
  'nav.review': '待核閱',
  'nav.database': '正式庫',
  'nav.signals': '訊號聚合',
  'nav.logs': '系統日誌',
  'header.subtitle': '專業稽核模式 (PRO-V3)',
  'header.run': '啟動新監測任務',
} as const;

export type TransKey = keyof typeof zh;

const en: Record<TransKey, string> = {
  'nav.input': 'Search',
  'nav.review': 'Review',
  'nav.database': 'Database',
  'nav.signals': 'Signals',
  'nav.logs': 'Logs',
  'header.subtitle': 'Professional Audit Mode (PRO-V3)',
  'header.run': 'Start New Monitoring Run',
};

export const translations: Record<Lang, Record<TransKey, string>> = { zh, en };
