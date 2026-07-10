import React, { createContext, useContext, useEffect, useState } from 'react';
import { translations, TransKey, Lang } from './translations';

const KEY = 'PV_LANG';

export function readInitialLang(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'zh' || s === 'en') return s;
  } catch { /* ignore */ }
  return 'zh';
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: TransKey) => string }>({
  lang: 'zh', setLang: () => {}, t: (k) => k,
});

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>(readInitialLang);
  useEffect(() => { try { localStorage.setItem(KEY, lang); } catch { /* ignore */ } }, [lang]);
  const t = (k: TransKey) => translations[lang][k] ?? translations.zh[k] ?? k;
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;
