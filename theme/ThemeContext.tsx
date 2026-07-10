import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'PV_THEME';

export function readInitialTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'dark' || s === 'light') return s;
  } catch { /* ignore */ }
  return 'light';
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
