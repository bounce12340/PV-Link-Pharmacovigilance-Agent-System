// 共用表單元件。
//
// 手機優先的設計約束（整份 AE 通報表單都靠這幾個元件維持一致）：
//   • 輸入框字級固定 text-base(16px) —— iOS Safari 對 <16px 的輸入框會自動放大頁面，破壞版面。
//   • 可點擊元素最小高度 44px —— Apple HIG / WCAG 2.5.5 的觸控目標下限。
//   • 單選、複選一律用「大色塊 chip」而非原生 <select> —— 手機下拉選單難點且看不到全部選項。

import React from 'react';

export interface Option { value: string; zh: string; en: string }

export const pickLabel = (o: Option, lang: 'zh' | 'en') => (lang === 'en' ? o.en : o.zh);

const inputBase =
  'w-full min-h-[48px] bg-white/80 dark:bg-slate-800/80 border-2 border-slate-300 dark:border-slate-600 ' +
  'rounded-2xl px-4 py-3 text-base outline-none transition-all shadow-sm ' +
  'focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-500';

export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  /** CIOMS 欄號等對照標記，顯示在標籤右側 */
  tag?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, tag, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-xs font-black text-slate-700 dark:text-slate-200 tracking-wide">
        {label}
        {required && <span className="text-rose-600 dark:text-rose-400 ml-1">*</span>}
      </label>
      {tag && (
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
          {tag}
        </span>
      )}
    </div>
    {children}
    {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{hint}</p>}
  </div>
);

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const TextInput: React.FC<InputProps> = (props) => (
  <input {...props} className={`${inputBase} font-bold ${props.className || ''}`} />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea {...props} className={`${inputBase} font-medium leading-relaxed resize-y ${props.className || ''}`} />
);

/** 單選 chip 群組。value 為空字串代表未選。 */
export const ChipGroup: React.FC<{
  options: readonly Option[];
  value: string;
  onChange: (v: string) => void;
  lang: 'zh' | 'en';
  /** 再次點選已選項目時清空（適合非必填欄位） */
  clearable?: boolean;
  cols?: 1 | 2;
}> = ({ options, value, onChange, lang, clearable = true, cols = 2 }) => (
  <div className={`grid gap-2 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
    {options.map(o => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(active && clearable ? '' : o.value)}
          className={`min-h-[48px] px-3 py-3 rounded-2xl text-sm font-black border-2 text-left transition-all ${
            active
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 active:bg-indigo-50 dark:active:bg-slate-700'
          }`}
        >
          {pickLabel(o, lang)}
        </button>
      );
    })}
  </div>
);

/** 複選 chip 群組（嚴重性準則用）。危險語意採紅色，讓誤勾一眼看得出來。 */
export const CheckGroup: React.FC<{
  options: readonly Option[];
  values: string[];
  onChange: (v: string[]) => void;
  lang: 'zh' | 'en';
  tone?: 'indigo' | 'rose';
}> = ({ options, values, onChange, lang, tone = 'indigo' }) => {
  const on = tone === 'rose'
    ? 'bg-rose-600 text-white border-rose-600 shadow-md'
    : 'bg-indigo-600 text-white border-indigo-600 shadow-md';
  return (
    <div className="space-y-2">
      {options.map(o => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => onChange(active ? values.filter(v => v !== o.value) : [...values, o.value])}
            className={`w-full min-h-[48px] px-4 py-3 rounded-2xl text-sm font-black border-2 flex items-center gap-3 text-left transition-all ${
              active ? on : 'bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
            }`}
          >
            <span className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center text-xs ${
              active ? 'bg-white/25 border-white' : 'border-slate-400 dark:border-slate-500'
            }`}>{active ? '✓' : ''}</span>
            <span className="flex-1">{pickLabel(o, lang)}</span>
          </button>
        );
      })}
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/60 dark:bg-white/[0.07] backdrop-blur-xl rounded-3xl border border-white/60 dark:border-white/10 shadow-lg ${className}`}>
    {children}
  </div>
);

/** 狀態徽章。tone 直接對應語意色，不另外抽象。 */
export const Badge: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'indigo' }> = ({ children, tone = 'slate' }) => {
  const map = {
    slate: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
    amber: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',
    rose: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40',
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${map[tone]}`}>{children}</span>;
};
