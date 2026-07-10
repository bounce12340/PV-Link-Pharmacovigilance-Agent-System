
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  PVInput, 
  PVRecord, 
  WorkflowStep, 
  PVStructuredData
} from './types';
import { now } from './services/tools';
import { PVLLMService } from './services/llmService';
import { loadRecords, saveRecords, DB_KEY, PENDING_KEY } from './services/storage';
import { buildCIOMS, ciomsToText } from './services/cioms';
import { aggregateSignals } from './services/signals';
import { lookupMeddra } from './services/meddra';
import { useTheme } from './theme/ThemeContext';
import { useLang, useT } from './i18n/LangContext';
import { TransKey } from './i18n/translations';
import {
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon,
  XMarkIcon,
  CircleStackIcon,
  FingerPrintIcon,
  SparklesIcon,
  GlobeAltIcon,
  BeakerIcon,
  AdjustmentsHorizontalIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  InboxIcon,
  TrashIcon,
  LightBulbIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const llm = new PVLLMService();

// 相關性分數的顏色分級：高(綠) / 中(琥珀) / 低(灰)
const scoreBadgeClass = (score: number) =>
  score >= 70 ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
  : score >= 40 ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
  : 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/40';

// CSV 欄位轉義：以雙引號包覆並加倍內部引號；前導 = + - @ 加單引號，防 Excel 公式注入
const csvCell = (v: any) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

// WorkflowStep（枚舉值本身為繁中）對應的 i18n key，供 UI 顯示切換語言
const stepLabelKeys: Record<WorkflowStep, TransKey> = {
  [WorkflowStep.IDLE]: 'common.stepIdle',
  [WorkflowStep.QUERY_GEN]: 'common.stepQueryGen',
  [WorkflowStep.RSS_FETCH]: 'common.stepRssFetch',
  [WorkflowStep.EFETCH_FILTER]: 'common.stepEfetchFilter',
  [WorkflowStep.WEB_SEARCH]: 'common.stepWebSearch',
  [WorkflowStep.RELEVANCE_SCORING]: 'common.stepRelevanceScoring',
  [WorkflowStep.SUMMARIZATION]: 'common.stepSummarization',
  [WorkflowStep.PV_EXTRACTION]: 'common.stepPvExtraction',
  [WorkflowStep.DB_EXPORT]: 'common.stepDbExport',
};

const App: React.FC = () => {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();
  const [input, setInput] = useState<PVInput>({
    company_product_names: ['藥品A'],
    active_ingredients: ['Fenofibrate'],
    date_window: { from: '2026-01-01', to: '2026-12-31' },
    date_logic: 'both',
    ae_strings: ['Adverse drug reactions', 'Adverse Event Reporting System', 'pharmacovigilance*'],
    optional_ae_focus_terms: [],
    exclusions: ['animal-only'],
    db_mode: 'upsert',
    max_results: 100
  });

  const [step, setStep] = useState<WorkflowStep>(WorkflowStep.IDLE);
  const [logs, setLogs] = useState<string[]>([]);
  const [records, setRecords] = useState<PVRecord[]>([]);
  const [masterDatabase, setMasterDatabase] = useState<PVRecord[]>([]);
  // 儲存層採 IndexedDB（非同步）。hydrated 用來確保「載入完成前」不會用空陣列覆寫既有資料。
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'review' | 'database' | 'signals' | 'logs'>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [copiedConclusion, setCopiedConclusion] = useState(false);
  const [minScore, setMinScore] = useState(0);
  // 進度顯示：AI 分批處理時的「已完成 / 總數」
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  // CIOMS 草稿檢視器（modal）目前顯示的純文字內容
  const [ciomsText, setCiomsText] = useState<string | null>(null);
  const [ciomsCopied, setCiomsCopied] = useState(false);
  const [batchExtractInfo, setBatchExtractInfo] = useState<{ done: number; total: number } | null>(null);

  const [dbFilter, setDbFilter] = useState({
    keyword: '',
    from: '',
    to: ''
  });
  
  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // 啟動時從 IndexedDB 載入正式庫與待核閱清單（含舊 localStorage 一次性遷移）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [db, pending] = await Promise.all([loadRecords(DB_KEY), loadRecords(PENDING_KEY)]);
      if (cancelled) return;
      setMasterDatabase(db as PVRecord[]);
      setRecords(pending as PVRecord[]);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // 持久化：正式庫（載入完成後才寫，避免用初始空陣列覆蓋既有資料）
  useEffect(() => {
    if (hydrated) saveRecords(DB_KEY, masterDatabase);
  }, [masterDatabase, hydrated]);

  // 持久化：待核閱清單（#3 重新整理不遺失）
  useEffect(() => {
    if (hydrated) saveRecords(PENDING_KEY, records);
  }, [records, hydrated]);

  // Reset copy state when selection changes
  useEffect(() => {
    setCopiedConclusion(false);
  }, [selectedRecordId]);

  const runWorkflow = async () => {
    setIsProcessing(true);
    setLogs([]);
    setRecords([]);
    try {
      setStep(WorkflowStep.QUERY_GEN);
      const ingredients = input.active_ingredients.map(i => i.trim()).filter(Boolean);
      if (ingredients.length === 0) {
        addLog(`[錯誤] 請輸入至少一個目標成分`);
        setIsProcessing(false);
        return;
      }
      // 將多個成分用 OR 連接，並修正 PubMed 邏輯運算子的優先級
      const ingredientsQuery = ingredients.map(i => `("${i}")`).join(' OR ');
      // AE 關鍵字與排除詞改由使用者設定驅動，不再寫死
      const aeTerms = input.ae_strings.map(s => s.trim()).filter(Boolean);
      const aeClause = aeTerms.length > 0
        ? ` AND (${aeTerms.map(t => (/[*"]/.test(t) ? t : `"${t}"`)).join(' OR ')})`
        : '';
      const exclusionTerms = input.exclusions.map(s => s.trim()).filter(Boolean);
      const exclusionClause = exclusionTerms.map(t => ` NOT (${/[*"]/.test(t) ? t : `"${t}"`})`).join('');
      const pubmedQuery = `(${ingredientsQuery})${aeClause}${exclusionClause}`;
      const ingredientLabel = ingredients.join(', ');
      addLog(`[稽核] 啟動監測任務，成分：${ingredientLabel}`);

      setStep(WorkflowStep.RSS_FETCH);
      const realResults = await llm.performPubMedSearch(pubmedQuery, ingredientLabel, input.date_window, input.max_results || 100);
      
      const rawRecords: PVRecord[] = realResults.map((r: any) => ({
        id: r.pmid || `tmp-${Math.random()}`,
        source: 'pubmed',
        pmid: r.pmid,
        title: r.title,
        journal: r.journal,
        dp: r.date,
        abstract: r.summary,
        primary_link: r.url,
        quality_flags: ['PRO_VERIFIED'],
        relevance_score: 0,
        relevance_reason: '',
        is_excluded: false,
        original_search_term: ingredientLabel // 關鍵優化：鎖定原始搜尋詞
      }));

      // 檢查是否已在資料庫中
      const freshRecords = rawRecords.filter(r => !masterDatabase.some(m => m.pmid === r.pmid));
      addLog(`[完成檢索] 找到 ${rawRecords.length} 筆，排除已存在筆數後剩餘 ${freshRecords.length} 筆新資料`);

      if (freshRecords.length > 0) {
        setStep(WorkflowStep.RELEVANCE_SCORING);
        // 進度：評分與摘要各佔 total 筆，合計 total*2；兩者並行進行，累加已完成數
        const total = freshRecords.length;
        let scoreDone = 0, sumDone = 0;
        const bump = () => setProgress({ label: t('common.aiProcessingLabel'), done: scoreDone + sumDone, total: total * 2 });
        bump();
        const [scores, summaries] = await Promise.all([
          llm.scoreRelevance(freshRecords, d => { scoreDone = d; bump(); }),
          llm.generateSummaries(freshRecords, d => { sumDone = d; bump(); })
        ]);
        setProgress(null);

        const finalized = freshRecords.map(m => {
          // pmid 以字串比對（模型常回數字型 pmid）；分數用 ?? 保留合法的 0 分
          const s = scores.find((sc: any) => String(sc.pmid) === String(m.pmid));
          const sum = summaries.find((su: any) => String(su.pmid) === String(m.pmid));
          return {
            ...m,
            relevance_score: s?.score ?? 50,
            relevance_reason: s?.reason || '',
            summary_zh: sum?.summary_zh || m.abstract,
            conclusion_zh: sum?.conclusion_zh || ''
          };
        });
        setRecords(finalized);
      } else {
        setRecords([]);
        addLog(`[提示] 本次搜尋無新文獻需要核閱。`);
      }

      setStep(WorkflowStep.IDLE);
      setActiveTab('review');
    } catch (e) {
      addLog(`[錯誤] 執行異常: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // 批次抽取正式庫中「尚未抽取結構化數據」的文獻，供訊號聚合使用（並行）
  const runBatchExtract = async () => {
    const pending = masterDatabase.filter(r => !r.pv_data && !r.is_excluded);
    if (pending.length === 0) {
      addLog(`[抽取] 正式庫所有文獻皆已完成結構化抽取。`);
      return;
    }
    setBatchExtractInfo({ done: 0, total: pending.length });
    addLog(`[抽取] 開始批次抽取 ${pending.length} 筆未抽取文獻...`);
    try {
      const results = await llm.extractPVDataBatch(pending, (done, total) => setBatchExtractInfo({ done, total }));
      const byId = new Map(results.map(x => [x.id, x.pv_data]));
      setMasterDatabase(prev => prev.map(r => {
        const data = byId.get(r.id);
        if (!data) return r;
        return {
          ...r,
          pv_data: {
            ...data,
            ingredient: data.ingredient && data.ingredient !== 'N/A' ? data.ingredient : r.original_search_term
          }
        };
      }));
      addLog(`[抽取] 批次抽取完成，共處理 ${results.length} 筆。`);
    } catch (e) {
      addLog(`[錯誤] 批次抽取異常: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setBatchExtractInfo(null);
    }
  };

  // 產生選定文獻的 CIOMS 草稿並開啟檢視器
  const openCiomsDraft = (record: PVRecord) => {
    const draft = buildCIOMS(record, now().iso_datetime);
    setCiomsText(ciomsToText(draft));
    setCiomsCopied(false);
  };

  const copyCiomsText = () => {
    if (!ciomsText) return;
    navigator.clipboard.writeText(ciomsText);
    setCiomsCopied(true);
    setTimeout(() => setCiomsCopied(false), 2000);
  };

  const downloadCiomsText = () => {
    if (!ciomsText) return;
    const blob = new Blob(["﻿" + ciomsText], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CIOMS_Draft_${now().iso_datetime.split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 訊號聚合結果（依正式庫即時計算）
  const signalReport = useMemo(() => aggregateSignals(masterDatabase), [masterDatabase]);

  const handleImport = async (record: PVRecord) => {
    if (masterDatabase.some(m => m.pmid === record.pmid)) {
      alert(t('db.dupPrefix') + record.pmid + t('db.dupSuffix'));
      return;
    }
    const preparedRecord = { ...record, quality_flags: [...record.quality_flags, 'DB_COMMITTED'] };
    setMasterDatabase(prev => [...prev, preparedRecord]);
    setRecords(prev => prev.filter(r => r.pmid !== record.pmid));
    setSelectedRecordId(null);
    addLog(`[資料庫] 成功匯入文獻 PMID:${record.pmid}`);
  };

  const handleDeleteFromDB = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 防止觸發行點擊事件
    if (window.confirm(t('db.deleteConfirmPrefix') + id + t('db.deleteConfirmSuffix'))) {
       setMasterDatabase(prev => prev.filter(r => r.id !== id));
       if (selectedRecordId === id) setSelectedRecordId(null);
       addLog(`[資料庫] 已手動移除文獻 ID: ${id}`);
    }
  };

  const handleCopyConclusion = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedConclusion(true);
    setTimeout(() => setCopiedConclusion(false), 2000);
  };

  const selectedRecord = useMemo(() =>
    records.find(r => r.id === selectedRecordId) || masterDatabase.find(r => r.id === selectedRecordId)
  , [records, masterDatabase, selectedRecordId]);

  // 待核閱清單：依相關性分數過濾並由高到低排序
  const visibleReviewRecords = useMemo(() =>
    records
      .filter(r => (r.relevance_score || 0) >= minScore)
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
  , [records, minScore]);

  // 以 state Set 追蹤「哪些 record 正在抽取」，供 UI 依 record id 顯示 spinner（避免單一布林在快速切換時錯亂）
  const [extractingSet, setExtractingSet] = useState<Set<string>>(new Set());
  // ref Set 作同步的防重入守衛（setState 非同步，快速切換時可能讀到舊值）
  const extractingIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const rec = selectedRecord;
    // 守衛以「是否已有 pv_data」判斷，而非某個欄位是否有值（無 AE 的文獻 ae_verbatim 可能為空）
    if (!rec || rec.pv_data || rec.is_excluded || extractingIds.current.has(rec.id)) return;
    extractingIds.current.add(rec.id);
    setExtractingSet(prev => new Set(prev).add(rec.id));
    llm.extractPVData(rec).then(data => {
      const updateFn = (r: PVRecord) => {
        if (r.id !== rec.id) return r;
        return {
          ...r,
          pv_data: {
            ...data,
            // 如果 AI 沒抽到成分，絕不覆蓋原始成分
            ingredient: data.ingredient && data.ingredient !== 'N/A' ? data.ingredient : r.original_search_term
          }
        };
      };
      setRecords(prev => prev.map(updateFn));
      setMasterDatabase(prev => prev.map(updateFn));
    }).finally(() => {
      extractingIds.current.delete(rec.id);
      setExtractingSet(prev => { const n = new Set(prev); n.delete(rec.id); return n; });
    });
  }, [selectedRecordId]);

  // 超強模糊檢索邏輯
  const filteredDatabase = useMemo(() => {
    const kw = dbFilter.keyword.toLowerCase();
    const fromDate = dbFilter.from ? new Date(dbFilter.from) : null;
    const toDate = dbFilter.to ? new Date(dbFilter.to) : null;

    return masterDatabase.filter(r => {
      const recordDate = r.dp ? new Date(r.dp) : null;
      const matchFrom = !fromDate || (recordDate && recordDate >= fromDate);
      const matchTo = !toDate || (recordDate && recordDate <= toDate);
      
      if (!matchFrom || !matchTo) return false;
      if (!kw) return true;

      // 多重欄位匹配
      const contentPool = [
        r.pmid || '',
        r.title || '',
        r.original_search_term || '',
        r.pv_data?.ingredient || '',
        r.pv_data?.product || '',
        r.journal || '',
        r.summary_zh || '',
        r.conclusion_zh || ''
      ].join(' ').toLowerCase();

      return contentPool.includes(kw);
    });
  }, [masterDatabase, dbFilter]);

  const exportToCSV = (scope: 'filtered' | 'all') => {
    const data = scope === 'all' ? masterDatabase : filteredDatabase;
    const headers = ["PMID", "Title", "Journal", "PubDate", "SearchTerm", "AI_Ingredient", "RelevanceScore", "MedDRA_PT", "Seriousness", "Causality", "Conclusion_ZH", "Summary_ZH"];
    const rows = data.map(r => [
      r.pmid,
      r.title,
      r.journal,
      r.dp,
      r.original_search_term,
      r.pv_data?.ingredient,
      r.relevance_score,
      r.pv_data?.meddra_pt_candidate,
      r.pv_data?.seriousness,
      r.pv_data?.causality,
      r.conclusion_zh,
      r.summary_zh
    ].map(csvCell));
    const csvContent = "\uFEFF" + [headers.map(csvCell), ...rows].map(e => e.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PV_DB_Export_${scope}_${now().iso_datetime.split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 dark:text-slate-100 relative overflow-hidden">
      {/* 水彩背景層 */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc] dark:bg-[#0b1020]">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 dark:bg-indigo-500/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-[pulse_8s_infinite]" />
         <div className="absolute top-[20%] right-[-10%] w-[60%] h-[60%] bg-rose-200/40 dark:bg-rose-500/15 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-[pulse_10s_infinite_2s]" />
         <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-teal-200/40 dark:bg-teal-500/15 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-[pulse_12s_infinite_4s]" />
         <div className="absolute bottom-[20%] right-[30%] w-[40%] h-[40%] bg-amber-100/60 dark:bg-amber-500/10 rounded-full blur-[80px] mix-blend-multiply dark:mix-blend-screen" />
      </div>

      <div className="bg-slate-900/80 backdrop-blur-md text-indigo-200/80 text-[10px] px-6 py-1.5 flex justify-between font-mono tracking-widest border-b border-white/5">
        <span>PV-AUDITOR // DATA-INTEGRITY-ENABLED</span>
        <span>SYSTEM_TIME: {now().iso_datetime}</span>
      </div>

      <header className="bg-white/30 dark:bg-white/5 backdrop-blur-xl border-b border-white/40 dark:border-white/10 px-8 py-5 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="bg-indigo-600/90 backdrop-blur-sm p-2.5 rounded-2xl text-white shadow-lg"><BeakerIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">PV-Link Auditor</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">{t('header.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
        <button onClick={toggle} title={t('header.themeToggle')} className="p-2.5 rounded-2xl bg-white/40 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-white/40 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/20 transition-all">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <div className="flex rounded-2xl overflow-hidden border border-white/40 dark:border-white/10 text-[11px] font-black">
          <button onClick={() => setLang('zh')} className={`px-3 py-2 transition-all ${lang === 'zh' ? 'bg-indigo-600/90 text-white' : 'bg-white/40 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>中</button>
          <button onClick={() => setLang('en')} className={`px-3 py-2 transition-all ${lang === 'en' ? 'bg-indigo-600/90 text-white' : 'bg-white/40 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>EN</button>
        </div>
        <button onClick={runWorkflow} disabled={isProcessing} className="bg-indigo-600/90 hover:bg-indigo-700/90 backdrop-blur-sm disabled:opacity-50 text-white px-8 py-3 rounded-2xl text-sm font-black shadow-xl flex items-center gap-3 transition-all border border-white/20">
          <ArrowPathIcon className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? t(stepLabelKeys[step]) : t('header.run')}
        </button>
        </div>
      </header>

      {/* 進度條：AI 分批處理時顯示已完成 / 總數（#2） */}
      {progress && progress.total > 0 && (
        <div className="bg-indigo-50/80 dark:bg-indigo-950/40 backdrop-blur-md border-b border-indigo-100 dark:border-indigo-900/40 px-8 py-2.5 flex items-center gap-4 z-20">
          <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 whitespace-nowrap uppercase tracking-widest">{progress.label}</span>
          <div className="flex-1 h-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 whitespace-nowrap tabular-nums">{progress.done}/{progress.total}</span>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-72 bg-white/30 dark:bg-white/5 backdrop-blur-2xl border-r border-white/40 dark:border-white/10 flex flex-col p-6 space-y-2 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
          <button onClick={() => setActiveTab('input')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'input' ? 'bg-indigo-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 border-transparent'}`}>
            <AdjustmentsHorizontalIcon className="w-5 h-5" /> {t('nav.input')}
          </button>
          <button onClick={() => setActiveTab('review')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'review' ? 'bg-indigo-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 border-transparent'}`}>
            <ClipboardDocumentCheckIcon className="w-5 h-5" /> {t('nav.review')} ({records.length})
          </button>
          <button onClick={() => setActiveTab('database')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'database' ? 'bg-emerald-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 border-transparent'}`}>
            <CircleStackIcon className="w-5 h-5" /> {t('nav.database')} ({masterDatabase.length})
          </button>
          <button onClick={() => setActiveTab('signals')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'signals' ? 'bg-rose-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 border-transparent'}`}>
            <ChartBarIcon className="w-5 h-5" /> {t('nav.signals')} ({signalReport.groups.length})
          </button>
          <button onClick={() => setActiveTab('logs')} className="mt-auto w-full flex items-center gap-4 px-5 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
            <FingerPrintIcon className="w-4 h-4" /> {t('nav.logs')}
          </button>
        </aside>

        <section className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'input' && (
            <div className="flex-1 p-20 flex flex-col items-center overflow-y-auto">
               <div className="w-full max-w-xl bg-white/50 dark:bg-white/[0.08] backdrop-blur-xl p-12 rounded-[3rem] border border-white/60 dark:border-white/10 shadow-2xl space-y-10">
                  <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{t('input.title')}</h2>
                  <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.ingredients')}</label>
                       <input type="text" placeholder={t('input.ingredientsPlaceholder')} value={input.active_ingredients.join(',')} onChange={e => setInput({...input, active_ingredients: e.target.value.split(',')})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-6 py-4 text-lg font-black outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.dateFrom')}</label>
                         <input type="date" value={input.date_window.from} onChange={e => setInput({...input, date_window: {...input.date_window, from: e.target.value}})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-4 py-3 font-black text-sm outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all shadow-sm" />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.dateTo')}</label>
                         <input type="date" value={input.date_window.to} onChange={e => setInput({...input, date_window: {...input.date_window, to: e.target.value}})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-4 py-3 font-black text-sm outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all shadow-sm" />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.aeTerms')}</label>
                       <input type="text" placeholder={t('input.aeTermsPlaceholder')} value={input.ae_strings.join(',')} onChange={e => setInput({...input, ae_strings: e.target.value.split(',')})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-6 py-3 text-sm font-bold outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.exclusions')}</label>
                       <input type="text" placeholder={t('input.exclusionsPlaceholder')} value={input.exclusions.join(',')} onChange={e => setInput({...input, exclusions: e.target.value.split(',')})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-6 py-3 text-sm font-bold outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest pl-1">{t('input.maxResults')}</label>
                       <input type="number" min={10} max={500} step={10} value={input.max_results ?? 100} onChange={e => setInput({...input, max_results: Math.max(10, Math.min(500, Number(e.target.value) || 100))})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl px-6 py-3 text-sm font-black outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                    </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'review' && (
             <div className="flex-1 flex overflow-hidden">
               <div className="w-[45%] border-r border-white/30 dark:border-white/10 overflow-y-auto p-8 space-y-4 bg-white/10 dark:bg-white/[0.03] backdrop-blur-sm">
                  {records.length > 0 && (
                    <div className="sticky top-0 z-10 -mt-8 -mx-8 px-8 py-4 mb-2 bg-white/60 dark:bg-white/10 backdrop-blur-xl border-b border-white/50 dark:border-white/10 flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-widest whitespace-nowrap">{t('review.thresholdLabel')} {minScore}</span>
                      <input type="range" min={0} max={100} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="flex-1 accent-indigo-600" />
                      <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">{visibleReviewRecords.length}/{records.length} {t('common.unitRecords')}</span>
                    </div>
                  )}
                  {records.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-slate-500 dark:text-slate-400"><InboxIcon className="w-16 h-16" /><p className="font-black mt-4">{t('review.empty')}</p></div>
                  ) : visibleReviewRecords.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-slate-500 dark:text-slate-400"><FunnelIcon className="w-12 h-12" /><p className="font-black mt-4 text-sm">{t('review.noneAboveThreshold')}</p></div>
                  ) : visibleReviewRecords.map(r => (
                    <div key={r.id} onClick={() => setSelectedRecordId(r.id)} className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all backdrop-blur-md ${selectedRecordId === r.id ? 'border-indigo-600 dark:border-indigo-400 bg-white/90 dark:bg-slate-800/90 shadow-xl' : 'border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-white/[0.07] hover:bg-white/60 dark:hover:bg-white/10 hover:border-indigo-300 dark:hover:border-indigo-500'}`}>
                       <div className="flex justify-between items-center mb-2">
                         <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${scoreBadgeClass(r.relevance_score || 0)}`} title={r.relevance_reason || t('review.reasonComplete')}>{t('review.threshold')} {r.relevance_score ?? '—'}</span>
                         <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">PMID:{r.pmid}</span>
                       </div>
                       <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mb-1">{r.dp}</div>
                       <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-2">{r.title}</h3>
                    </div>
                  ))}
               </div>
               <div className="flex-1 bg-white/40 dark:bg-white/[0.07] backdrop-blur-xl p-12 overflow-y-auto">
                 {selectedRecord ? (
                   <div className="max-w-xl mx-auto space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 text-[10px] font-black tracking-widest uppercase"><SparklesIcon className="w-4 h-4" /> {t('review.auditDetail')}</div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-snug">{selectedRecord.title}</h2>
                        <button onClick={() => window.open(selectedRecord.primary_link, '_blank')} className="flex items-center gap-2 bg-slate-900/90 text-white px-6 py-3 rounded-2xl font-black text-[11px] shadow-lg hover:bg-slate-800 transition-all">
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" /> {t('review.officialLink')}
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* 強化版結論卡片 */}
                        <div className="relative group bg-gradient-to-br from-amber-50/90 to-orange-50/80 dark:from-amber-500/10 dark:to-orange-500/10 backdrop-blur-md text-amber-900 dark:text-amber-100 p-8 rounded-[2rem] border-2 border-amber-200/60 dark:border-amber-500/20 shadow-lg transition-all hover:shadow-xl hover:border-amber-300/80 dark:hover:border-amber-500/40">
                           <div className="flex justify-between items-start mb-4">
                               <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                                 <div className="p-1.5 bg-amber-200/50 dark:bg-amber-500/20 rounded-lg">
                                    <LightBulbIcon className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                                 </div>
                                 {t('review.conclusion')}
                               </div>
                               <button
                                 onClick={() => handleCopyConclusion(selectedRecord.conclusion_zh)}
                                 className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-[10px] font-bold text-amber-800 dark:text-amber-200 transition-all border border-amber-100 dark:border-amber-500/20 shadow-sm active:scale-95 group-hover:bg-white dark:group-hover:bg-white/20"
                                 title={t('review.copyConclusionTitle')}
                               >
                                 {copiedConclusion ? <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                                 {copiedConclusion ? <span className="text-emerald-600 dark:text-emerald-400">{t('common.copied')}</span> : t('common.copy')}
                               </button>
                           </div>
                           <p className="text-lg font-bold leading-relaxed text-slate-800 dark:text-slate-100 drop-shadow-sm selection:bg-amber-200/50">
                             {selectedRecord.conclusion_zh || t('review.conclusionPending')}
                           </p>
                        </div>

                        <div className="bg-white/60 dark:bg-white/10 backdrop-blur-md text-indigo-950 dark:text-indigo-100 p-8 rounded-[2rem] border border-white/80 dark:border-white/15 shadow-sm">
                           <div className="text-[10px] font-black text-indigo-500 dark:text-indigo-300 mb-3 tracking-widest uppercase">{t('review.summary')}</div>
                           <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">{selectedRecord.summary_zh || t('review.summaryPending')}</p>
                        </div>
                      </div>

                      {/* 結構化 PV 數據抽取結果 */}
                      <div className="bg-white/60 dark:bg-white/10 backdrop-blur-md p-8 rounded-[2rem] border border-white/80 dark:border-white/15 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-[10px] font-black text-indigo-500 dark:text-indigo-300 tracking-widest uppercase">{t('review.structured')}</div>
                          {selectedRecord.pv_data?.completeness && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${selectedRecord.pv_data.completeness === 'Complete' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40' : selectedRecord.pv_data.completeness === 'Partial' ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40' : 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/40'}`}>{selectedRecord.pv_data.completeness}</span>
                          )}
                        </div>
                        {extractingSet.has(selectedRecord.id) && !selectedRecord.pv_data ? (
                          <p className="text-sm text-slate-400 font-bold italic">{t('review.extracting')}</p>
                        ) : selectedRecord.pv_data ? (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {[
                              [t('review.fieldIngredient'), selectedRecord.pv_data.ingredient],
                              [t('review.fieldProduct'), selectedRecord.pv_data.product],
                              [t('review.fieldAeVerbatim'), selectedRecord.pv_data.ae_verbatim],
                              [t('review.fieldMeddraPt'), selectedRecord.pv_data.meddra_pt_candidate ? `${selectedRecord.pv_data.meddra_pt_candidate}${selectedRecord.pv_data.meddra_confidence != null ? ` (${selectedRecord.pv_data.meddra_confidence}%)` : ''}${lookupMeddra(selectedRecord.pv_data.meddra_pt_candidate).matched ? ` ✓${t('common.dictVerified')}` : ` ·${t('common.aiInferred')}`}` : ''],
                              [t('review.fieldMeddraSoc'), lookupMeddra(selectedRecord.pv_data.meddra_pt_candidate).soc || t('review.socNotInDict')],
                              [t('review.fieldSeriousness'), selectedRecord.pv_data.seriousness],
                              [t('review.fieldCausality'), selectedRecord.pv_data.causality],
                              [t('review.fieldPopulation'), selectedRecord.pv_data.population],
                              [t('review.fieldDosageRoute'), selectedRecord.pv_data.dosage_route],
                              [t('review.fieldTto'), selectedRecord.pv_data.tto],
                              [t('review.fieldOutcome'), selectedRecord.pv_data.outcome],
                            ].map(([label, value]) => (
                              <div key={label} className="space-y-1">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{label}</div>
                                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 break-words">{value || <span className="text-slate-300 dark:text-slate-600">—</span>}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 font-bold italic">{t('review.selectToExtract')}</p>
                        )}
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => openCiomsDraft(selectedRecord)}
                          disabled={!selectedRecord.pv_data}
                          className="flex-1 bg-slate-800/90 disabled:opacity-40 backdrop-blur-sm text-white py-5 rounded-[2rem] font-black text-sm shadow-xl active:scale-95 transition-all hover:bg-slate-900 border border-white/20 flex items-center justify-center gap-2"
                          title={selectedRecord.pv_data ? t('review.ciomsReadyTitle') : t('review.ciomsWaitingTitle')}
                        >
                          <DocumentTextIcon className="w-5 h-5" /> {t('review.generateCioms')}
                        </button>
                        {!masterDatabase.some(m => m.pmid === selectedRecord.pmid) && (
                          <button onClick={() => handleImport(selectedRecord)} className="flex-1 bg-emerald-600/90 backdrop-blur-sm text-white py-5 rounded-[2rem] font-black text-sm shadow-xl active:scale-95 transition-all hover:bg-emerald-700/90 border border-white/20">
                            {t('review.import')}
                          </button>
                        )}
                      </div>
                   </div>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center opacity-10"><DocumentMagnifyingGlassIcon className="w-20 h-20" /></div>
                 )}
               </div>
             </div>
          )}

          {activeTab === 'database' && (
            <div className="w-full h-full p-12 flex flex-col overflow-hidden">
               <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-slate-100 drop-shadow-sm">{t('db.title')}</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase mt-1">{t('db.totalLabel')}: {masterDatabase.length} | {t('db.filteredLabel')}: {filteredDatabase.length}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={runBatchExtract} disabled={!!batchExtractInfo} className="bg-indigo-100/80 dark:bg-indigo-500/20 backdrop-blur-sm text-indigo-900 dark:text-indigo-200 px-5 py-3 rounded-2xl text-sm font-black flex items-center gap-2 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 disabled:opacity-50 transition-all border border-indigo-300/50 dark:border-indigo-500/30 shadow-sm">
                      <SparklesIcon className={`w-5 h-5 ${batchExtractInfo ? 'animate-pulse' : ''}`} />
                      {batchExtractInfo ? `${t('db.extracting')} ${batchExtractInfo.done}/${batchExtractInfo.total}` : `${t('db.batchExtract')} (${masterDatabase.filter(r => !r.pv_data && !r.is_excluded).length})`}
                    </button>
                    <button onClick={() => exportToCSV('filtered')} className="bg-emerald-100/80 dark:bg-emerald-500/20 backdrop-blur-sm text-emerald-900 dark:text-emerald-200 px-5 py-3 rounded-2xl text-sm font-black flex items-center gap-2 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-all border border-emerald-300/50 dark:border-emerald-500/30 shadow-sm">
                      <ArrowDownTrayIcon className="w-5 h-5" /> {t('db.exportFiltered')} ({filteredDatabase.length})
                    </button>
                    <button onClick={() => exportToCSV('all')} className="bg-white/60 dark:bg-white/10 backdrop-blur-sm text-slate-700 dark:text-slate-200 px-5 py-3 rounded-2xl text-sm font-black flex items-center gap-2 hover:bg-white dark:hover:bg-white/20 transition-all border border-slate-300/50 dark:border-slate-600/50 shadow-sm">
                      <ArrowDownTrayIcon className="w-5 h-5" /> {t('db.exportAll')} ({masterDatabase.length})
                    </button>
                  </div>
               </div>

               <div className="bg-white/60 dark:bg-white/10 backdrop-blur-xl p-6 rounded-[2rem] border border-white/60 dark:border-white/10 shadow-lg mb-6 flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[300px] relative">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 dark:text-slate-400" />
                    <input type="text" placeholder={t('db.searchPlaceholder')} value={dbFilter.keyword} onChange={e => setDbFilter({...dbFilter, keyword: e.target.value})} className="w-full bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-2xl pl-12 pr-4 py-3 text-sm font-black outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                  </div>
                  <div className="flex items-center gap-3">
                    <FunnelIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    <input type="date" value={dbFilter.from} onChange={e => setDbFilter({...dbFilter, from: e.target.value})} className="bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md shadow-sm" />
                    <span className="text-slate-400">~</span>
                    <input type="date" value={dbFilter.to} onChange={e => setDbFilter({...dbFilter, to: e.target.value})} className="bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:shadow-md shadow-sm" />
                  </div>
                  <button onClick={() => setDbFilter({ keyword: '', from: '', to: '' })} className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-black text-[10px] uppercase p-2">{t('db.clear')}</button>
               </div>

               <div className="bg-white/40 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/50 dark:border-white/10 shadow-xl flex-1 overflow-auto">
                 <table className="w-full">
                   <thead className="bg-white/30 dark:bg-white/5 backdrop-blur-md sticky top-0 z-10">
                     <tr className="border-b border-slate-200/50 dark:border-slate-700/50">
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">{t('db.colId')}</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">{t('db.colDetail')}</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">{t('db.colPublication')}</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-right">{t('db.colActions')}</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredDatabase.length === 0 ? (
                       <tr><td colSpan={4} className="py-20 text-center text-slate-400 font-black italic">{t('db.empty')}</td></tr>
                     ) : filteredDatabase.map(r => (
                       <tr key={r.id} className="border-b border-slate-200/60 dark:border-slate-700/60 hover:bg-white/60 dark:hover:bg-white/10 cursor-pointer group transition-colors" onClick={() => { setSelectedRecordId(r.id); setActiveTab('review'); }}>
                         <td className="px-8 py-8 font-mono text-xs font-bold text-slate-400">{r.pmid}</td>
                         <td className="px-8 py-8 max-w-lg">
                           <div className="font-black text-slate-800 dark:text-slate-100 line-clamp-2">{r.title}</div>
                           <div className="flex gap-2 mt-2">
                             <span className="bg-indigo-100/60 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-[8px] font-black uppercase">{t('db.tagLabel')}: {r.original_search_term}</span>
                             {r.pv_data?.ingredient && r.pv_data.ingredient !== r.original_search_term && (
                               <span className="bg-amber-100/60 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded text-[8px] font-black uppercase">{t('db.aiIdentifiedLabel')}: {r.pv_data.ingredient}</span>
                             )}
                           </div>
                         </td>
                         <td className="px-8 py-8">
                           <div className="font-bold text-slate-400 text-xs italic">{r.journal}</div>
                           <div className="text-[10px] font-mono text-indigo-400 font-black mt-1">{r.dp}</div>
                         </td>
                         <td className="px-8 py-8 text-right">
                           <button
                             onClick={(e) => handleDeleteFromDB(e, r.id)}
                             className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-500/10 p-2 rounded-full transition-all"
                             title={t('db.removeTitle')}
                           >
                             <TrashIcon className="w-5 h-5" />
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'signals' && (
            <div className="w-full h-full p-12 flex flex-col overflow-hidden">
               <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-slate-100 drop-shadow-sm">{t('signals.title')}</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase mt-1">
                      {t('signals.groupByLabel')} | {t('signals.analysedLabel')} {signalReport.analysedRecords} {t('common.unitRecords')} | {t('signals.skippedLabel')} {signalReport.skipped} {t('common.unitRecords')}
                    </p>
                  </div>
                  {signalReport.skipped > 0 && (
                    <button onClick={() => { setActiveTab('database'); }} className="bg-amber-100/80 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 px-5 py-3 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-all border border-amber-300/50 dark:border-amber-500/30 shadow-sm">
                      <ExclamationTriangleIcon className="w-5 h-5" /> {signalReport.skipped} {t('signals.skippedSuffix')}
                    </button>
                  )}
               </div>

               <div className="bg-rose-50/60 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-2xl px-6 py-3 mb-6 text-[11px] font-bold text-rose-800/80 dark:text-rose-300 flex items-center gap-2">
                 <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                 {t('signals.disclaimer')}
               </div>

               <div className="bg-white/40 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/50 dark:border-white/10 shadow-xl flex-1 overflow-auto">
                 {signalReport.groups.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center opacity-40 text-slate-500 dark:text-slate-400 py-20">
                     <ChartBarIcon className="w-16 h-16" />
                     <p className="font-black mt-4">{t('signals.empty')}</p>
                     <p className="text-xs font-bold mt-1">{t('signals.emptyHint')}</p>
                   </div>
                 ) : (
                   <table className="w-full">
                     <thead className="bg-white/30 dark:bg-white/5 backdrop-blur-md sticky top-0 z-10">
                       <tr className="border-b border-slate-200/50 dark:border-slate-700/50">
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">{t('signals.colIngredient')}</th>
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">MedDRA PT</th>
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">{t('signals.colSoc')}</th>
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-center">{t('signals.colCount')}</th>
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-center">{t('signals.colSerious')}</th>
                         <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase text-left">PMIDs</th>
                       </tr>
                     </thead>
                     <tbody>
                       {signalReport.groups.map((g, i) => {
                         const flagged = g.count >= 3 || g.seriousCount > 0;
                         return (
                           <tr key={i} className={`border-b border-slate-200/60 dark:border-slate-700/60 transition-colors ${flagged ? 'bg-rose-50/50 dark:bg-rose-500/10 hover:bg-rose-100/50 dark:hover:bg-rose-500/15' : 'hover:bg-white/60 dark:hover:bg-white/10'}`}>
                             <td className="px-6 py-5 font-black text-slate-800 dark:text-slate-100 text-sm">{g.ingredient}</td>
                             <td className="px-6 py-5 text-sm font-bold text-slate-700 dark:text-slate-200">
                               {g.pt}
                               <span className={`ml-2 text-[8px] font-black px-1.5 py-0.5 rounded-full border ${g.matched ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40' : 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/40'}`}>{g.matched ? t('common.dictVerified') : t('common.aiInferred')}</span>
                             </td>
                             <td className="px-6 py-5 text-xs font-bold text-slate-500 dark:text-slate-400 italic">{g.soc}</td>
                             <td className="px-6 py-5 text-center"><span className={`text-sm font-black px-3 py-1 rounded-full ${flagged ? 'bg-rose-200 text-rose-800 dark:bg-rose-500/30 dark:text-rose-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{g.count}</span></td>
                             <td className="px-6 py-5 text-center font-black text-rose-600 dark:text-rose-400">{g.seriousCount || '—'}</td>
                             <td className="px-6 py-5 text-[10px] font-mono text-indigo-400 max-w-xs truncate" title={g.pmids.join(', ')}>{g.pmids.join(', ') || '—'}</td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                 )}
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="flex-1 p-12 bg-slate-950/85 backdrop-blur-xl font-mono text-[11px] text-indigo-200/70 overflow-y-auto">
               {logs.map((l, i) => <div key={i} className="mb-1 border-b border-white/5 pb-1 last:border-0">{l}</div>)}
            </div>
          )}
        </section>
      </main>

      {/* CIOMS-I / E2B 草稿檢視器 (#4) */}
      {ciomsText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm" onClick={() => setCiomsText(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-white/60 dark:border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-xl text-white"><DocumentTextIcon className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t('review.ciomsModalTitle')}</h3>
                  <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">{t('review.ciomsAiNotice')}</p>
                </div>
              </div>
              <button onClick={() => setCiomsText(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"><XMarkIcon className="w-6 h-6" /></button>
            </div>
            <pre className="flex-1 overflow-auto px-8 py-6 text-xs font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{ciomsText}</pre>
            <div className="flex gap-3 px-8 py-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={copyCiomsText} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all hover:bg-indigo-700 flex items-center justify-center gap-2">
                {ciomsCopied ? <CheckIcon className="w-5 h-5" /> : <ClipboardDocumentIcon className="w-5 h-5" />}
                {ciomsCopied ? t('common.copied') : t('review.copyFullText')}
              </button>
              <button onClick={downloadCiomsText} className="flex-1 bg-slate-800 text-white py-3 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all hover:bg-slate-900 flex items-center justify-center gap-2">
                <ArrowDownTrayIcon className="w-5 h-5" /> {t('review.downloadTxt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
