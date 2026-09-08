// 路由層：以 hash 分流「業務手機通報端」與「藥安後台」。
//
// 用 hash 而非 history API，是因為本專案是純靜態前端（Vite build → 任意靜態主機 / Cloudflare Pages），
// 沒有伺服器端 rewrite；hash 路由在任何靜態主機上重新整理都不會 404。
//   #/report → 業務通報表單（手機優先，獨立全螢幕，不載入後台的資料與工作流）
//   其他      → 藥安後台（文獻監測 + 個案收案）

import React, { useEffect, useState } from 'react';
import App from '../App';
import AEReportMobile from './AEReportMobile';

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

const Root: React.FC = () => {
  const hash = useHashRoute();
  // startsWith 而非全等：容許 #/report?src=qr 之類的查詢字串（例如追蹤通報入口來源）
  if (hash.startsWith('#/report')) return <AEReportMobile />;
  return <App />;
};

export default Root;
