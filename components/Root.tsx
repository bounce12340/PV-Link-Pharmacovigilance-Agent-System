// 路由層：以 hash 分流「業務手機通報端」與「藥安後台」，並依角色決定誰能進後台。
//
// 用 hash 而非 history API，是因為本專案是純靜態前端（Vite build → 任意靜態主機 / Cloudflare Pages），
// 沒有伺服器端 rewrite；hash 路由在任何靜態主機上重新整理都不會 404。
//   #/report → 業務通報表單（手機優先，獨立全螢幕，不載入後台的資料與工作流）
//   其他      → 藥安後台（文獻監測 + 個案收案）
//
// ⚠️ hash 路由**無法**用 Cloudflare Access 的路徑規則分權：`#` 後面的片段依 HTTP 規範
// 不會送到伺服器，Cloudflare 根本看不到 `#/report` 與 `#/` 的差別。因此分權必須在
// 應用層做：這裡向 /api/me 問角色，業務（rep）一律導向通報表單。
//
// 這一層只是體驗，不是防線。真正的守門在 Worker——每一條 API 都自己查角色，
// 就算有人繞過前端直接打 API，也拿不到別人的個案。

import React, { useEffect, useState } from 'react';
import App from '../App';
import AEReportMobile from './AEReportMobile';
import { fetchIdentity, hasRemoteEndpoint } from '../services/aeApi';
import type { AERole } from '../services/aeApi';

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/**
 * 取得目前使用者的角色。
 *
 * 本機模式（未設後端端點）沒有身分可問，一律當 pv：那是單機展示情境，
 * 把展示用的瀏覽器鎖成業務端只會讓人以為系統壞了。
 *
 * 查詢失敗時降級為 rep，而不是 pv。這個方向是刻意的：通報是安全關鍵路徑
 * （業務在外面遇到不良反應必須報得出來，表單本身還有離線佇列），
 * 後台則是敏感路徑。不確定身分時，讓人能通報、不讓人讀個案。
 */
function useRole(): AERole | 'loading' {
  const [role, setRole] = useState<AERole | 'loading'>(hasRemoteEndpoint() ? 'loading' : 'pv');

  useEffect(() => {
    if (!hasRemoteEndpoint()) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchIdentity();
        if (!cancelled) setRole(me.role);
      } catch {
        if (!cancelled) setRole('rep');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return role;
}

const Splash: React.FC = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8fafc] dark:bg-[#0b1020]">
    <div className="w-8 h-8 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" />
  </div>
);

const Root: React.FC = () => {
  const hash = useHashRoute();
  const role = useRole();

  // 角色未定前不渲染任何一邊：先畫後台再抽掉，等於讓不該看到的人瞄到一眼。
  if (role === 'loading') return <Splash />;

  // 業務端無論打哪個 hash 都只會拿到通報表單。
  if (role === 'rep') return <AEReportMobile />;

  // startsWith 而非全等：容許 #/report?src=qr 之類的查詢字串（例如追蹤通報入口來源）
  if (hash.startsWith('#/report')) return <AEReportMobile />;
  return <App />;
};

export default Root;
