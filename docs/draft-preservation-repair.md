# 草稿保全修補：接續與完成報告

- **時間**：2026-09-29（Asia/Taipei）
- **接手 worktree**：`/var/minis/workspace/pv-draft-preservation-repair-64155de`
- **分支**：`fix/draft-preservation-64155de`
- **基底／HEAD SHA**：`64155de4e694df996bd5b6dcf52b75e505a1ad7e`（父 `adb542c9a119781dbbd43c20ee7aa0c949275ab7`）
- **接手情境**：原代理 958151DE 已取消且無最終交付；本次工作樹已 dirty（4 個既有修改檔 + 2 個新檔），依委派指示不得 reset/drop/stash，先逐檔 read/diff 理解既有未完成實作後接續。
- **範圍**：僅修補「API 送出失敗且 outbox 寫入失敗時草稿保全」與相關 autosave/submit 競態；不擴大到 spec.md 第 3 節（衝突比較 UI、伺服器版本讀取、身份切換）等未授權項目。

## 1. 送出結果契約（本次確立並以程式碼實作）

| SubmitResult.channel | FormSubmissionState | mayClearDraft | 語意 |
|---|---|---|---|
| `remote` | `remote_delivered` | true | 遠端已確認送達 |
| `local` | `local_saved` | true | 單機展示已本機保存（**非**遠端送達，demo 不假稱遠端） |
| `outbox` | `queued_pending` | true | 已耐久保存於待送佇列（queue 成功 ≠ remote delivery） |
| `outbox_conflict` | `queued_conflict` | true | 409 衝突已耐久保存並停止自動重送 |
| `unconfirmed` | `unconfirmed` | **false** | 連 outbox 都無法確認保存，唯一草稿**不得**清除、**不得**宣稱任何形式的成功 |

`classifyFormSubmission`／`finalizeFormSubmission` 定義於 `services/aeSubmission.ts`，供 `components/AEReportMobile.tsx` 的 `submit()` 呼叫，取代原本「不論結果無條件 `removeValue(AE_DRAFT_KEY)`」的缺陷邏輯。

## 2. 接手時發現的既有未完成實作狀態

原代理（958151DE，已取消）在中止前留下的 4 個修改檔 + 2 個新檔，經逐檔比對 HEAD 後判定：

**已正確完成、本次未重做的部分：**
- `services/storage.ts`：`removeValue` 雙層（IndexedDB + localStorage）皆失敗時改為 `throw`（取代原本 `catch { /* ignore */ }` 的吞錯），避免 UI 偽稱已清稿。
- `services/aeApi.ts`：新增 `SubmitChannel = 'unconfirmed'`，並把兩處「outbox 也寫不進去」的分支從 `channel: 'outbox'`（會被誤判為已耐久保存）改為 `channel: 'unconfirmed'`。
- `i18n/translations.ts`：新增 `ae.submit.unconfirmed`、`ae.submit.draftClearFailed` 兩組中英文字串。
- `tests/aeSubmission.draft-preservation.test.ts`（新檔）：已用 Vitest 語法涵蓋 5 種可清稿情境 + 2 種不可清稿情境 + 1 種清稿失敗誠實提示情境的骨架，寫法正確、只是依賴的 `classifyFormSubmission` 尚未定義。

**接手時發現的兩個阻斷性缺陷（本次修補）：**

1. **`classifyFormSubmission` 被呼叫但從未定義**（`services/aeSubmission.ts` 只有 `finalizeFormSubmission` 呼叫了它，`components/AEReportMobile.tsx` 也 import 並呼叫它，但函式本體不存在）。這會導致 typecheck 與 runtime 必然失敗，屬於原代理中止前留下的半成品。
2. **`attachError` state 被誤重命名為 `submitError` 但未同步全部引用**：原始 `useState('')` 宣告從 `attachError` 改名為 `submitError`，但 `onPickFiles`（附件錯誤處理）與 `StepReview` 元件的 props/顯示區塊仍引用已不存在的 `attachError`/`setAttachError`，導致附件錯誤與送出保全錯誤的語意被錯誤合併，且 typecheck 必然失敗。

## 3. 本次修補內容

### 3.1 補上 `classifyFormSubmission`（`services/aeSubmission.ts`）
依上表契約完整定義，並補上型別安全的 `switch`/`default` fallback：未知 channel 一律視為 `unconfirmed`（安全預設，絕不誤刪唯一草稿）。

### 3.2 恢復獨立的 `attachError` state，不與 `submitError` 混用
`components/AEReportMobile.tsx` 重新宣告 `const [attachError, setAttachError] = useState('')`（附件錯誤，語意不變）與獨立的 `submitError`/`submitErrorKind`（送出保全錯誤，新增）。

### 3.3 誠實區分「未確認保存」與「已保存但清稿失敗」（避免誤重送）
新增 `submitErrorKind: 'unconfirmed' | 'draftClearFailed' | ''`：
- `outcome.mayClearDraft === false`（outbox 雙層失敗）→ 顯示 `ae.submit.unconfirmed`；
- `outcome.mayClearDraft === true` 但 `finalizeFormSubmission` 拋錯（**遠端／本機／佇列已成功**，只是刪除原草稿失敗）→ 顯示 `ae.submit.draftClearFailed`，避免使用者誤以為未送達而重複送出同一筆通報。

這對應委派要求「對remote成功但草稿刪除失敗要誠實提示，避免誤重送」。修補前的草稿版本會把兩者都顯示成同一句「未確認已保存在此裝置」，會誤導使用者以為送出失敗而重送已送達的個案。

### 3.4 最小處理 autosave debounce 與 submit/清草稿競態
把元件原本散落的三個 `useRef`（generation counter、pending timer、pending write promise）收斂成 `services/aeSubmission.ts` 的 `DraftAutosaveCoordinator` 類別（規格明確允許的「最小提取協調function」，非替代演算法——元件改為持有其 instance 並委派呼叫，行為與抽出前逐位元相同）：

- `scheduleSave(saveDraft, onSettled)`：debounce 排程，觸發時二次核對世代避免「timer 已進入事件佇列但世代剛好被搶先遞增」的極端時序。
- `cancelScheduled()`：僅取消尚未觸發的 timer，供一般 effect cleanup 使用。
- `invalidateAndSettle()`：送出／清稿前呼叫——遞增世代（讓舊排程與飛行中寫入的回呼失效）、取消 pending timer、**等待**飛行中的寫入落地（無論成功失敗）後才回傳，呼叫端此後才可安全執行 `removeValue`。

處理的三種競態（對應委派「避免延後autosave重建已送draft/刪新draft」）：
1. debounce timer 已排程但未觸發時使用者送出 → 舊 timer 觸發時不得把剛刪除的草稿寫回。
2. debounce 的非同步寫入已飛行中時使用者送出 → 必須等寫入落地才能刪除，否則刪除可能先於寫入完成，寫入完成後又把草稿寫回。
3. 連續按兩次送出（雙 submit）→ 第二次呼叫時世代已遞增，任何仍在飛行、屬於更舊世代的寫入結果一律被忽略。

## 4. 驗證結果（本機、非正式；逐項標明類別）

### 4.1 靜態推論
- 逐檔 `git diff HEAD` 比對，確認哪些部分是既有正確實作（storage.ts/aeApi.ts/i18n/測試骨架）、哪些是阻斷性缺陷（`classifyFormSubmission` 未定義、`attachError` 重複/遺失引用）。

### 4.2 正式 TypeScript typecheck（PASS，非 mock）
- 命令：`cd /tmp/pv-64155de-runner && node node_modules/typescript/bin/tsc --noEmit`
- **exit=0，無 diagnostic**（三次獨立執行：修補 `classifyFormSubmission` 後一次、抽出 `DraftAutosaveCoordinator` 重構後一次、最終同步全部檔案後一次，皆 exit=0）
- 執行環境：`/tmp/pv-64155de-runner`，由既有驗收（`pv-64155de-validation`）建立的 `git archive` 乾淨來源鏡像 + `cp -a` 複製共享 `node_modules`（`/var/minis/workspace/PV-Link-Pharmacovigilance-Agent-System`，未修改共享依賴），本次僅將修補後的 6 個檔案（含新檔）同步進鏡像後執行，**不引用舊 SHA 的 typecheck 結果**。
- 耗時：約 3 分鐘/次（iSH aarch64 環境正常耗時，非異常）。
- 證據：`logs/tsc-final.log`

### 4.3 正式 Vitest（未完成，環境阻礙，不宣稱 PASS）
- 命令：`env ESBUILD_BINARY_PATH=/tmp/pv-esbuild-64155de node node_modules/vitest/vitest.mjs list tests/aeSubmission.draft-preservation.test.ts`
- **exit=1**：Node `uv_thread_create` assertion crash（與 `/var/minis/workspace/pv-64155de-validation/report.md` 記載的同一 iSH runner 限制一致），無法完成 Vitest discovery 或執行。依規範「本機已知iSH uv_thread_create限制不再反覆嘗試」，本次僅嘗試一次（含 esbuild adapter 一次），未反覆探測。
- 判定：**未完成，不算 PASS**，也不代表產品測試本身有問題（既有驗收報告已證實同 SHA 下相同環境限制）。
- 證據：`logs/vitest-list-aeSubmission2.log`

### 4.4 本機合成回歸（Node assert，明示非正式 Vitest；PASS，21/21）
用真實產品原始碼（`services/aeApi.ts` 的 `submitAEReport`、`services/aeSubmission.ts` 的 `classifyFormSubmission`/`finalizeFormSubmission`/`DraftAutosaveCoordinator`）經 `ts-loader.mjs`（TypeScript compiler `transpileModule`，非 mock 轉譯）直接 import 執行；storage 層用合成 `localStorage`/`indexedDB` mock 控制成功/失敗。

- 命令：`node --loader ./ts-loader.mjs repair-synthetic-runner.mjs /var/minis/workspace/pv-draft-preservation-repair-64155de`
- **exit=0，21 passed，0 failed**
- 案例矩陣（對應委派要求的 mock 故障案例清單）：

  | # | 案例 | 結果 |
  |---|---|---|
  | 1 | network 失敗 + outbox（IndexedDB+localStorage）雙失敗 → `unconfirmed` | PASS |
  | 2 | 5xx + outbox 雙失敗 → `unconfirmed` | PASS |
  | 3 | 409 + outbox 寫入失敗 → `unconfirmed` | PASS |
  | 4 | 409 + outbox 寫入成功 → `queued_conflict`，可清稿 | PASS |
  | 5 | remote 2xx 成功 → `remote_delivered` | PASS |
  | 6 | demo（local，無 endpoint）保存成功 → `local_saved`，非 remote | PASS |
  | 7 | demo 保存失敗（雙層 localStorage 失敗，含 fallback 到 outbox 也失敗）→ `unconfirmed`，非未捕捉例外 | PASS |
  | 8 | network 失敗 + outbox 寫入成功（queue 成功）→ `queued_pending`，**非** remote delivery | PASS |
  | 9 | `finalizeFormSubmission` 對 `mayClearDraft=false` 絕不呼叫 `removeDraft` | PASS |
  | 10 | `finalizeFormSubmission` 對 `removeDraft` 失敗（remote 成功但清稿失敗）原樣往外拋，不吞錯 | PASS |
  | 11 | `finalizeFormSubmission` 確實 `await removeDraft`（非 fire-and-forget） | PASS |
  | 12 | `storage.removeValue` 雙層失敗時 `throw`，不靜默視為成功 | PASS |
  | 13 | `storage.removeValue` 單層成功時正常 resolve | PASS |
  | 14 | 409 衝突後 outbox payload／version 不變（不被覆寫成 latest） | PASS |
  | 15 | network 失敗後 outbox payload／version 不變 | PASS |
  | 16 | Coordinator：pending debounce timer 在 `invalidateAndSettle` 後不重寫已刪除草稿 | PASS |
  | 17 | Coordinator：飛行中寫入被 `invalidateAndSettle` 等待完成才回傳 | PASS |
  | 18 | Coordinator：已作廢世代的 `onSettled` 回呼被抑制 | PASS |
  | 19 | Coordinator：雙 submit（連續呼叫 `invalidateAndSettle` 兩次）不重複觸發或崩潰 | PASS |
  | 20 | Coordinator：`cancelScheduled` 只取消 timer，不遞增世代（effect cleanup 語意） | PASS |
  | 21 | unexpected throw（非 Error 實例的意外拋出）仍落地 outbox，非靜默丟棄 | PASS |

- 證據：`logs/fixed-run.log`

### 4.5 基底最小重現 → 修後同操作通過（PASS，5/5）
用 `git archive 64155de...` 建立 pristine baseline（`/tmp/pv-draft-baseline-64155de`，未經任一代理修改的原始碼），與修補後 worktree 對照，逐位元重現元件的送出後行為。

- 命令：`node --loader ./ts-loader.mjs baseline-vs-fixed.mjs /tmp/pv-draft-baseline-64155de /var/minis/workspace/pv-draft-preservation-repair-64155de`
- **exit=0，5 passed，0 failed**
- 案例：
  1. **[BASELINE] 重現缺陷**：network 失敗 + outbox 雙層失敗，baseline 邏輯（`await submitAEReport(); await removeValue(AE_DRAFT_KEY);` 無條件執行）**確實把唯一草稿誤刪**。
  2. **[BASELINE] 對照基準**：remote 成功時 baseline 的 `aeApi.ts` channel 語意本身正確（缺陷在 UI 層的無條件刪稿，非 aeApi 本身）。
  3. **[FIXED] 同操作驗證**：完全相同的 network 失敗 + outbox 雙層失敗操作，修補後草稿**被保留**、**不導向 Done**、`outcome.mayClearDraft === false`。
  4. **[FIXED] 正向路徑不受影響**：remote 成功時草稿正確清除並導向 Done。
  5. **[FIXED] queue 成功語意**：network 失敗但 outbox 寫入成功時，channel 保持 `outbox`（絕非 `remote`），草稿清除但 Done 畫面顯示佇列狀態文案（`ae.submit.queued`），queue 成功不等於 remote delivery。
- 證據：`logs/baseline-vs-fixed.log`

### 4.6 i18n 完整性（PASS，Node 動態驗證）
- 命令：`node --loader ./ts-loader.mjs i18n-check.mjs /var/minis/workspace/pv-draft-preservation-repair-64155de`
- 驗證 zh/en key 集合一致、無空值、新增的 `ae.submit.unconfirmed`／`ae.submit.draftClearFailed` 兩個 key 在兩語言皆存在。
- exit=0

### 4.7 既有測試訊息斷言相容性核對（PASS，Node 動態驗證）
- `tests/storage.reliability.test.ts` 第三案例斷言 `result.message` 包含「佇列寫入失敗」字串（未斷言 channel 值），本次 channel 契約變更（`outbox` → `unconfirmed`）不影響此既有斷言，已用合成腳本動態核對成立。
- 注意：此既有測試檔本身仍受 4.3 節的 Vitest 環境限制無法實際跑正式 Vitest suite；本節只核對其斷言邏輯與新契約相容，非該測試檔案本身的正式執行證據。

## 5. 測試基礎設施修補（repo 外，不影響 repo）

接手時發現 `/var/minis/workspace/pv-draft-preservation-evidence/ts-loader.mjs`（前一代理遺留、非 repo 檔案）的正規表達式有 bug：`/\\\/+\$\/?, /` 誤把 `+` 解讀導致無法匹配 `aeApi.ts` 的 `ENDPOINT` 行，造成 mock endpoint 注入失效、所有測試誤判為 local 模式。已修正為 `/\\\/\+\$\/, /`（repo 外檔案，不算本次 repo 修改）。同時修正該 loader 使其支援 cache-busting query string（`?tag`），讓同一 ES module 在測試中需要以不同 `ENDPOINT` 值重新求值時能取得獨立實例。

## 6. 修改檔案清單

| 檔案 | 狀態 | 說明 |
|---|---|---|
| `services/aeSubmission.ts` | 新增（本次補完） | `classifyFormSubmission`／`finalizeFormSubmission`（既有骨架修補）+ `DraftAutosaveCoordinator`（本次新增，最小提取協調function） |
| `components/AEReportMobile.tsx` | 修改（本次補完） | 恢復 `attachError`；新增 `submitError`/`submitErrorKind`；`submit()`/`removeCurrentDraft()` 改用 `classifyFormSubmission`+`DraftAutosaveCoordinator`；debounce effect 改用協調器 |
| `services/aeApi.ts` | 既有正確（未重做） | `unconfirmed` channel 定義與兩處分支修正 |
| `services/storage.ts` | 既有正確（未重做） | `removeValue` 雙層失敗時 throw |
| `i18n/translations.ts` | 既有正確（未重做） | 新增 2 組 zh/en key |
| `tests/aeSubmission.draft-preservation.test.ts` | 既有正確（未重做） | 正式 Vitest 案例骨架（因環境限制無法實際執行，見 4.3 節） |

## 7. Commit

本次已在該 worktree 建立 1 個本機 commit（訊息含 co-author 標記，未 push、未建立 PR/CI dispatch）。實際 SHA 見任務最終回覆。

## 8. 未驗證項目、限制、剩餘風險

1. **正式 Vitest 完整執行未完成**：iSH aarch64 環境的 Node `uv_thread_create` 限制導致 Vitest（含僅 `list` discovery）必然崩潰，與既有 `pv-64155de-validation` 報告記載的環境限制一致。`tests/aeSubmission.draft-preservation.test.ts` 的 5 個 `it.each` 案例（共展開為多筆斷言）**語法正確、可望通過**（其邏輯已被本次的 Node 合成測試獨立驗證涵蓋），但未經正式 Vitest runner 實際跑過，不宣稱其為 Vitest PASS。
2. **未做真實 React 元件層渲染測試**（無 React Testing Library + jsdom 動態渲染 `AEReportMobile` 元件並模擬使用者點擊）。本次改用「從元件抽出真實協調邏輯（`DraftAutosaveCoordinator`）並對其做真實 `setTimeout`/`Promise` 動態測試」的方式驗證競態邏輯本身，這是規格明確允許的「最小提取协调function」，但**不是**對完整 React 元件（含 `useEffect` 排程、React 18/19 batching、實際 DOM 事件）的端到端動態驗證。UI 顯示層（`submitError` 區塊的 JSX 渲染、`role="alert"`）僅經靜態核對，未經瀏覽器/jsdom 渲染驗證。
3. **Vite production build 未嘗試**：委派範圍聚焦草稿保全修補的驗證，且既有 `pv-64155de-validation` 報告已記載同 SHA 下 Vite build 在此 iSH runner 環境同樣因 `uv_thread_create` 無法產出成功摘要；本次未重複此已知會失敗的嘗試。
4. **受審最新 SHA（本次 commit）需要獨立審查**：依委派要求，本次不自稱通過整體驗收；上述所有驗證結果僅涵蓋草稿保全這一狹窄範圍，且全部在單一本機環境、單一執行者（本代理）下完成，未經第二方複核。
5. **範圍邊界確認**：本次未新增跨帳號政策、未做舊 outbox owner 遷移、未做衝突比較 UI、未自動合併 PV/MedDraft、未 fetch 最新 version 強制重送、未做 R2 清理、未做 server 權限/migration 新改動——均符合委派的硬邊界。
6. **既有 `tests/aeSubmission.draft-preservation.test.ts` 對 `finalizeFormSubmission` 拋錯情境的斷言**（`draft clear failure` 案例）與本次新增的 UI 層 `submitErrorKind` 語意一致，但該測試檔案本身未新增對 `submitErrorKind`／UI 顯示文字的直接斷言（僅驗證 service 層），屬於本次未擴充測試覆蓋的已知缺口，建議下一步視需要補上。

## 9. 建議下一步

1. 若有授權，於具備可運作 Node worker-thread 的環境（非 iSH，例如標準 Linux x86_64 CI）重跑正式 `npm run typecheck`/`npm test`/`npm run build`，取得無環境限制的正式 Vitest/Vite 證據。
2. 若後續要推進 spec.md 第 3 節（衝突比較 UI 等）需另行明確委派與授權，本次不擅自擴大。
3. 若要加強 UI 層覆蓋，可補充 `@testing-library/react` + jsdom 的元件渲染測試（需先確認 devDependencies 是否已含 `@testing-library/react`；目前 `package.json` 未列出，需另行評估新增依賴是否在授權範圍）。
