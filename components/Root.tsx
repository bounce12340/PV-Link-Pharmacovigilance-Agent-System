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
import ProfileSetup from './ProfileSetup';
import { fetchIdentity, hasRemoteEndpoint } from '../services/aeApi';
import type { AEIdentity, AEProfile } from '../services/aeApi';

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

const LOCAL_IDENTITY: AEIdentity = {
  email: '', role: 'pv',
  profile: { displayName: '', employeeId: '', phone: '', contactEmail: '', org: '', territory: '' },
  profileComplete: true,
};

/**
 * 取得目前使用者的身分、角色與個人檔案。
 *
 * 本機模式（未設後端端點）沒有身分可問，一律當已建檔的 pv：那是單機展示情境，
 * 把展示用的瀏覽器鎖在建檔畫面只會讓人以為系統壞了。
 *
 * 查詢失敗時降級為「未建檔的 rep」，而不是 pv。這個方向是刻意的：通報是安全關鍵
 * 路徑（業務在外面遇到不良反應必須報得出來，表單本身還有離線佇列），
 * 後台則是敏感路徑。不確定身分時，讓人能通報、不讓人讀個案。
 */
function useIdentity(): [AEIdentity | 'loading', (p: AEProfile) => void] {
  const [identity, setIdentity] = useState<AEIdentity | 'loading'>(
    hasRemoteEndpoint() ? 'loading' : LOCAL_IDENTITY
  );

  useEffect(() => {
    if (!hasRemoteEndpoint()) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchIdentity();
        if (!cancelled) setIdentity(me);
      } catch {
        if (!cancelled) setIdentity({ ...LOCAL_IDENTITY, role: 'rep', profileComplete: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 建檔完成後就地更新，不必重新整理頁面
  const applyProfile = (profile: AEProfile) =>
    setIdentity(prev => (prev === 'loading' ? prev : { ...prev, profile, profileComplete: true }));

  return [identity, applyProfile];
}

const Splash: React.FC = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8fafc] dark:bg-[#0b1020]">
    <div className="w-8 h-8 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" />
  </div>
);

const Root: React.FC = () => {
  const hash = useHashRoute();
  const [identity, applyProfile] = useIdentity();
  const [editingProfile, setEditingProfile] = useState(false);

  // 身分未定前不渲染任何一邊：先畫後台再抽掉，等於讓不該看到的人瞄到一眼。
  if (identity === 'loading') return <Splash />;

  // 首次登入先建檔。刻意不給跳過：檔案沒填，第一次通報就會卡在
  // 「可辨識的通報者」驗證上，而那時業務人在客戶端、手上有個真實個案，
  // 是最不該讓他停下來填基本資料的時刻。
  if (!identity.profileComplete || editingProfile) {
    return (
      <ProfileSetup
        email={identity.email}
        initial={identity.profile}
        onDone={p => { applyProfile(p); setEditingProfile(false); }}
        onCancel={identity.profileComplete ? () => setEditingProfile(false) : undefined}
      />
    );
  }

  // 業務端無論打哪個 hash 都只會拿到通報表單。
  if (identity.role === 'rep') {
    return <AEReportMobile profile={identity.profile} onEditProfile={() => setEditingProfile(true)} />;
  }

  // startsWith 而非全等：容許 #/report?src=qr 之類的查詢字串（例如追蹤通報入口來源）
  if (hash.startsWith('#/report')) {
    return <AEReportMobile profile={identity.profile} onEditProfile={() => setEditingProfile(true)} />;
  }
  return <App />;
};

export default Root;
