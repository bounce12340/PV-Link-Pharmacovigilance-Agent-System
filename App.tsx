
import React, { useState, useMemo, useEffect } from 'react';
import { 
  PVInput, 
  PVRecord, 
  WorkflowStep, 
  PVStructuredData
} from './types';
import { 
  db_upsert, 
  now 
} from './services/tools';
import { PVGeminiService } from './services/geminiService';
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
  CheckIcon
} from '@heroicons/react/24/outline';

const gemini = new PVGeminiService();
const DB_STORAGE_KEY = 'PV_AUDITOR_MASTER_DB';

const App: React.FC = () => {
  const [input, setInput] = useState<PVInput>({
    company_product_names: ['藥品A'],
    active_ingredients: ['Fenofibrate'],
    date_window: { from: '2026-01-01', to: '2026-12-31' },
    date_logic: 'both',
    ae_strings: ['Adverse drug reactions', 'Adverse Event Reporting System', 'pharmacovigilance*'],
    optional_ae_focus_terms: [],
    exclusions: ['animal-only'],
    db_mode: 'upsert'
  });

  const [step, setStep] = useState<WorkflowStep>(WorkflowStep.IDLE);
  const [logs, setLogs] = useState<string[]>([]);
  const [records, setRecords] = useState<PVRecord[]>([]);
  const [masterDatabase, setMasterDatabase] = useState<PVRecord[]>(() => {
    const saved = localStorage.getItem(DB_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'input' | 'review' | 'database' | 'logs'>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [copiedConclusion, setCopiedConclusion] = useState(false);

  const [dbFilter, setDbFilter] = useState({
    keyword: '',
    from: '',
    to: ''
  });
  
  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // 持久化儲存
  useEffect(() => {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(masterDatabase));
  }, [masterDatabase]);

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
      const pubmedQuery = `(${ingredientsQuery}) AND ("Adverse drug reactions" OR "Adverse Event Reporting System" OR pharmacovigilance*)`;
      const ingredientLabel = ingredients.join(', ');
      addLog(`[稽核] 啟動監測任務，成分：${ingredientLabel}`);

      setStep(WorkflowStep.RSS_FETCH);
      const realResults = await gemini.performPubMedSearch(pubmedQuery, ingredientLabel, input.date_window);
      
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
        const [scores, summaries] = await Promise.all([
          gemini.scoreRelevance(freshRecords),
          gemini.generateSummaries(freshRecords)
        ]);
        
        const finalized = freshRecords.map(m => {
          const s = scores.find((sc: any) => sc.pmid === m.pmid);
          const sum = summaries.find((su: any) => su.pmid === m.pmid);
          return { 
            ...m, 
            relevance_score: s?.score || 50, 
            relevance_reason: s?.reason || '分析完成',
            summary_zh: sum?.summary_zh || m.abstract,
            conclusion_zh: sum?.conclusion_zh || '結論分析中'
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
    }
  };

  const handleImport = async (record: PVRecord) => {
    if (masterDatabase.some(m => m.pmid === record.pmid)) {
      alert("此文獻 (PMID: " + record.pmid + ") 已存在於資料庫中。");
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
    if (window.confirm(`確定要刪除此文獻 (ID: ${id}) 嗎？\n此動作將永久移除這筆紀錄。`)) {
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

  const [isExtracting, setIsExtracting] = useState(false);
  useEffect(() => {
    const triggerExtraction = async () => {
      if (selectedRecord && !selectedRecord.pv_data?.ae_verbatim && !isExtracting && !selectedRecord.is_excluded) {
        setIsExtracting(true);
        const data = await gemini.extractPVData(selectedRecord);
        const updateFn = (r: PVRecord) => {
          if (r.id !== selectedRecord.id) return r;
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
        setIsExtracting(false);
      }
    };
    triggerExtraction();
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

  const exportToCSV = () => {
    const headers = ["PMID", "Title", "Journal", "PubDate", "SearchTerm", "AI_Ingredient", "Conclusion_ZH", "Summary_ZH"];
    const rows = filteredDatabase.map(r => [
      r.pmid, 
      `"${r.title}"`, 
      `"${r.journal}"`, 
      r.dp, 
      r.original_search_term, 
      r.pv_data?.ingredient, 
      `"${r.conclusion_zh || ''}"`,
      `"${r.summary_zh || ''}"`
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PV_DB_Export_${now().iso_datetime.split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 relative overflow-hidden">
      {/* 水彩背景層 */}
      <div className="fixed inset-0 -z-10 bg-[#f8fafc]">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[120px] mix-blend-multiply animate-[pulse_8s_infinite]" />
         <div className="absolute top-[20%] right-[-10%] w-[60%] h-[60%] bg-rose-200/40 rounded-full blur-[120px] mix-blend-multiply animate-[pulse_10s_infinite_2s]" />
         <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-teal-200/40 rounded-full blur-[120px] mix-blend-multiply animate-[pulse_12s_infinite_4s]" />
         <div className="absolute bottom-[20%] right-[30%] w-[40%] h-[40%] bg-amber-100/60 rounded-full blur-[80px] mix-blend-multiply" />
      </div>

      <div className="bg-slate-900/80 backdrop-blur-md text-indigo-200/80 text-[10px] px-6 py-1.5 flex justify-between font-mono tracking-widest border-b border-white/5">
        <span>PV-AUDITOR // DATA-INTEGRITY-ENABLED</span>
        <span>SYSTEM_TIME: {now().iso_datetime}</span>
      </div>

      <header className="bg-white/30 backdrop-blur-xl border-b border-white/40 px-8 py-5 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="bg-indigo-600/90 backdrop-blur-sm p-2.5 rounded-2xl text-white shadow-lg"><BeakerIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">PV-Link Auditor</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">專業稽核模式 (PRO-V3)</p>
          </div>
        </div>
        <button onClick={runWorkflow} disabled={isProcessing} className="bg-indigo-600/90 hover:bg-indigo-700/90 backdrop-blur-sm disabled:opacity-50 text-white px-8 py-3 rounded-2xl text-sm font-black shadow-xl flex items-center gap-3 transition-all border border-white/20">
          <ArrowPathIcon className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? step : '啟動新監測任務'}
        </button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-72 bg-white/30 backdrop-blur-2xl border-r border-white/40 flex flex-col p-6 space-y-2 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
          <button onClick={() => setActiveTab('input')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'input' ? 'bg-indigo-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 hover:bg-white/40 border-transparent'}`}>
            <AdjustmentsHorizontalIcon className="w-5 h-5" /> 檢索設定
          </button>
          <button onClick={() => setActiveTab('review')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'review' ? 'bg-indigo-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 hover:bg-white/40 border-transparent'}`}>
            <ClipboardDocumentCheckIcon className="w-5 h-5" /> 待核閱 ({records.length})
          </button>
          <button onClick={() => setActiveTab('database')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all border ${activeTab === 'database' ? 'bg-emerald-600/90 backdrop-blur-sm text-white shadow-lg border-transparent' : 'text-slate-500 hover:bg-white/40 border-transparent'}`}>
            <CircleStackIcon className="w-5 h-5" /> 正式庫 ({masterDatabase.length})
          </button>
          <button onClick={() => setActiveTab('logs')} className="mt-auto w-full flex items-center gap-4 px-5 py-4 text-[10px] font-black uppercase text-slate-400">
            <FingerPrintIcon className="w-4 h-4" /> 系統日誌
          </button>
        </aside>

        <section className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'input' && (
            <div className="flex-1 p-20 flex flex-col items-center overflow-y-auto">
               <div className="w-full max-w-xl bg-white/50 backdrop-blur-xl p-12 rounded-[3rem] border border-white/60 shadow-2xl space-y-10">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">藥物監測配置</h2>
                  <div className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">目標成分 (必填，多成分請用逗號分隔)</label>
                       <input type="text" placeholder="例如: Fenofibrate, Aspirin" value={input.active_ingredients.join(',')} onChange={e => setInput({...input, active_ingredients: e.target.value.split(',')})} className="w-full bg-white/80 border-2 border-slate-300 rounded-2xl px-6 py-4 text-lg font-black outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">監測起始</label>
                         <input type="date" value={input.date_window.from} onChange={e => setInput({...input, date_window: {...input.date_window, from: e.target.value}})} className="w-full bg-white/80 border-2 border-slate-300 rounded-2xl px-4 py-3 font-black text-sm outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md transition-all shadow-sm" />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">監測結束</label>
                         <input type="date" value={input.date_window.to} onChange={e => setInput({...input, date_window: {...input.date_window, to: e.target.value}})} className="w-full bg-white/80 border-2 border-slate-300 rounded-2xl px-4 py-3 font-black text-sm outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md transition-all shadow-sm" />
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'review' && (
             <div className="flex-1 flex overflow-hidden">
               <div className="w-[45%] border-r border-white/30 overflow-y-auto p-8 space-y-4 bg-white/10 backdrop-blur-sm">
                  {records.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-slate-500"><InboxIcon className="w-16 h-16" /><p className="font-black mt-4">無待核閱文獻</p></div>
                  ) : records.map(r => (
                    <div key={r.id} onClick={() => setSelectedRecordId(r.id)} className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all backdrop-blur-md ${selectedRecordId === r.id ? 'border-indigo-600 bg-white/90 shadow-xl' : 'border-slate-200/60 bg-white/40 hover:bg-white/60 hover:border-indigo-300'}`}>
                       <div className="flex justify-between items-start mb-2">
                         <span className="text-[10px] font-black text-indigo-600">{r.dp}</span>
                         <span className="text-[10px] font-black text-slate-500">PMID:{r.pmid}</span>
                       </div>
                       <h3 className="font-black text-slate-800 text-sm leading-tight line-clamp-2">{r.title}</h3>
                    </div>
                  ))}
               </div>
               <div className="flex-1 bg-white/40 backdrop-blur-xl p-12 overflow-y-auto">
                 {selectedRecord ? (
                   <div className="max-w-xl mx-auto space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-700 text-[10px] font-black tracking-widest uppercase"><SparklesIcon className="w-4 h-4" /> 文獻稽核詳情</div>
                        <h2 className="text-2xl font-black text-slate-900 leading-snug">{selectedRecord.title}</h2>
                        <button onClick={() => window.open(selectedRecord.primary_link, '_blank')} className="flex items-center gap-2 bg-slate-900/90 text-white px-6 py-3 rounded-2xl font-black text-[11px] shadow-lg hover:bg-slate-800 transition-all">
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" /> 官網驗證連結
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        {/* 強化版結論卡片 */}
                        <div className="relative group bg-gradient-to-br from-amber-50/90 to-orange-50/80 backdrop-blur-md text-amber-900 p-8 rounded-[2rem] border-2 border-amber-200/60 shadow-lg transition-all hover:shadow-xl hover:border-amber-300/80">
                           <div className="flex justify-between items-start mb-4">
                               <div className="flex items-center gap-2 text-xs font-black text-amber-700 uppercase tracking-widest">
                                 <div className="p-1.5 bg-amber-200/50 rounded-lg">
                                    <LightBulbIcon className="w-5 h-5 text-amber-700" />
                                 </div>
                                 臨床結論 (Key Conclusion)
                               </div>
                               <button 
                                 onClick={() => handleCopyConclusion(selectedRecord.conclusion_zh)}
                                 className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white text-[10px] font-bold text-amber-800 transition-all border border-amber-100 shadow-sm active:scale-95 group-hover:bg-white"
                                 title="複製結論"
                               >
                                 {copiedConclusion ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                                 {copiedConclusion ? <span className="text-emerald-600">已複製!</span> : '複製'}
                               </button>
                           </div>
                           <p className="text-lg font-bold leading-relaxed text-slate-800 drop-shadow-sm selection:bg-amber-200/50">
                             {selectedRecord.conclusion_zh || "分析中..."}
                           </p>
                        </div>
                        
                        <div className="bg-white/60 backdrop-blur-md text-indigo-950 p-8 rounded-[2rem] border border-white/80 shadow-sm">
                           <div className="text-[10px] font-black text-indigo-500 mb-3 tracking-widest uppercase">AI 完整摘要 (Summary)</div>
                           <p className="text-sm font-medium leading-relaxed text-slate-700">{selectedRecord.summary_zh || "正在解析中..."}</p>
                        </div>
                      </div>

                      {!masterDatabase.some(m => m.pmid === selectedRecord.pmid) && (
                        <button onClick={() => handleImport(selectedRecord)} className="w-full bg-emerald-600/90 backdrop-blur-sm text-white py-6 rounded-[2rem] font-black text-xl shadow-xl active:scale-95 transition-all hover:bg-emerald-700/90 border border-white/20">
                          確認匯入正式庫
                        </button>
                      )}
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
                    <h2 className="text-4xl font-black text-slate-900 drop-shadow-sm">正式文獻庫</h2>
                    <p className="text-slate-500 text-xs font-black uppercase mt-1">總筆數: {masterDatabase.length} | 篩選後: {filteredDatabase.length}</p>
                  </div>
                  <button onClick={exportToCSV} className="bg-emerald-100/80 backdrop-blur-sm text-emerald-900 px-6 py-3 rounded-2xl text-sm font-black flex items-center gap-2 hover:bg-emerald-200 transition-all border border-emerald-300/50 shadow-sm">
                    <ArrowDownTrayIcon className="w-5 h-5" /> 匯出 CSV 報表
                  </button>
               </div>

               <div className="bg-white/60 backdrop-blur-xl p-6 rounded-[2rem] border border-white/60 shadow-lg mb-6 flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[300px] relative">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input type="text" placeholder="全域檢索: PMID、標題、成分或摘要關鍵字..." value={dbFilter.keyword} onChange={e => setDbFilter({...dbFilter, keyword: e.target.value})} className="w-full bg-white/80 border-2 border-slate-300 rounded-2xl pl-12 pr-4 py-3 text-sm font-black outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md transition-all placeholder-slate-400 shadow-sm" />
                  </div>
                  <div className="flex items-center gap-3">
                    <FunnelIcon className="w-5 h-5 text-slate-500" />
                    <input type="date" value={dbFilter.from} onChange={e => setDbFilter({...dbFilter, from: e.target.value})} className="bg-white/80 border-2 border-slate-300 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md shadow-sm" />
                    <span className="text-slate-400">~</span>
                    <input type="date" value={dbFilter.to} onChange={e => setDbFilter({...dbFilter, to: e.target.value})} className="bg-white/80 border-2 border-slate-300 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-indigo-600 focus:bg-white focus:shadow-md shadow-sm" />
                  </div>
                  <button onClick={() => setDbFilter({ keyword: '', from: '', to: '' })} className="text-slate-500 hover:text-indigo-600 font-black text-[10px] uppercase p-2">清空</button>
               </div>

               <div className="bg-white/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/50 shadow-xl flex-1 overflow-auto">
                 <table className="w-full">
                   <thead className="bg-white/30 backdrop-blur-md sticky top-0 z-10">
                     <tr className="border-b border-slate-200/50">
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase text-left">文獻 ID</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase text-left">文獻細節</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase text-left">出版資訊</th>
                       <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase text-right">操作</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredDatabase.length === 0 ? (
                       <tr><td colSpan={4} className="py-20 text-center text-slate-400 font-black italic">查無資料</td></tr>
                     ) : filteredDatabase.map(r => (
                       <tr key={r.id} className="border-b border-slate-200/60 hover:bg-white/60 cursor-pointer group transition-colors" onClick={() => { setSelectedRecordId(r.id); setActiveTab('review'); }}>
                         <td className="px-8 py-8 font-mono text-xs font-bold text-slate-400">{r.pmid}</td>
                         <td className="px-8 py-8 max-w-lg">
                           <div className="font-black text-slate-800 line-clamp-2">{r.title}</div>
                           <div className="flex gap-2 mt-2">
                             <span className="bg-indigo-100/60 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">標籤: {r.original_search_term}</span>
                             {r.pv_data?.ingredient && r.pv_data.ingredient !== r.original_search_term && (
                               <span className="bg-amber-100/60 text-amber-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">AI 識別: {r.pv_data.ingredient}</span>
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
                             className="text-slate-300 hover:text-red-500 hover:bg-red-50/50 p-2 rounded-full transition-all"
                             title="移除此文獻"
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

          {activeTab === 'logs' && (
            <div className="flex-1 p-12 bg-slate-950/85 backdrop-blur-xl font-mono text-[11px] text-indigo-200/70 overflow-y-auto">
               {logs.map((l, i) => <div key={i} className="mb-1 border-b border-white/5 pb-1 last:border-0">{l}</div>)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
