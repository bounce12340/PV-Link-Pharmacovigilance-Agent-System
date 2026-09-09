# 不良反應個案通報（ICSR）設計文件

> 版本：2026-09-08｜對應實作：`services/aeReport.ts`、`components/AEReportMobile.tsx`、`components/AEIntakeConsole.tsx`
> ⚠️ 本文為系統設計說明，不構成法律意見。實際送件仍須由合格藥物安全監視人員覆核。

---

## 1. 為什麼要做這件事

原系統只處理**文獻來源**的安全訊號（PubMed → AI 評分 → 結構化抽取 → 訊號聚合）。
但藥廠實務上，個案安全報告（ICSR, Individual Case Safety Report）的最大宗來源不是文獻，而是**自發性通報**——
業務、客服、醫院藥師在第一線聽到的一句「病人吃了你們的藥之後起疹子」。

這條管道的特性決定了設計：

| 特性 | 設計後果 |
|---|---|
| 通報人是業務，不是醫療專業人員 | 表單必須用白話、不能要求填 MedDRA |
| 通報發生在客戶端、走路上、訊號不穩 | 手機優先、草稿自動存、離線佇列 |
| 法定時鐘從「首次獲知」起算 | 獲知日是最關鍵欄位，需要專門的提示與檢核 |
| 資料一定不完整 | 檢核分 error / warning，**不完整不擋送出** |

最後一點是本設計最重要的取捨：**寧可收到不完整的個案，也不要因為表單太嚴格而讓業務放棄通報。**
漏報是法遵事故，資料不全只是後續補件工作。

---

## 2. 欄位依據

### 2.1 CIOMS Form I（主要骨架）

國際通行的「Suspect Adverse Reaction Report」表單，四大節共 26 個編號欄位。
本系統的 `AEReport` 逐欄對應（欄號寫在 `services/aeReport.ts` 的型別註解裡）：

**I. REACTION INFORMATION**
| 欄號 | 欄位 | 本系統欄位 |
|---|---|---|
| 1 | PATIENT INITIALS | `patientInitials` |
| 1a | COUNTRY | `country` |
| 2 | DATE OF BIRTH | `patientBirthDate` |
| 2a | AGE | `patientAgeValue` / `patientAgeUnit` |
| 3 | SEX | `patientSex` |
| 4-6 | REACTION ONSET | `events[].onsetDate` |
| 7+13 | DESCRIBE REACTION(S)（含檢驗數據） | `events[].verbatim` + `labData` |
| — | 嚴重性勾選框 | `events[].seriousnessCriteria` |

嚴重性勾選框（同時也是《嚴重藥物不良反應通報辦法》所定情形）：
`PATIENT DIED`／`LIFE THREATENING`／`INVOLVED OR PROLONGED INPATIENT HOSPITALISATION`／
`INVOLVED PERSISTENT OR SIGNIFICANT DISABILITY OR INCAPACITY`／`CONGENITAL ANOMALY`／
`OTHER MEDICALLY IMPORTANT CONDITION`

**II. SUSPECT DRUG(S) INFORMATION**
| 欄號 | 欄位 | 本系統欄位 |
|---|---|---|
| 14 | SUSPECT DRUG(S) (include generic name) | `drugs[].brandName` / `activeIngredient` |
| 15 | DAILY DOSE(S) | `drugs[].dailyDose` |
| 16 | ROUTE(S) OF ADMINISTRATION | `drugs[].route` |
| 17 | INDICATION(S) FOR USE | `drugs[].indication` |
| 18 | THERAPY DATES (from/to) | `drugs[].therapyStart` / `therapyEnd` |
| 19 | THERAPY DURATION | `drugs[].therapyDuration`（可由起訖日推算） |
| 20 | DID REACTION ABATE AFTER STOPPING DRUG? | `drugs[].dechallenge` |
| 21 | DID REACTION REAPPEAR AFTER REINTRODUCTION? | `drugs[].rechallenge` |

**III. CONCOMITANT DRUG(S) AND HISTORY**
| 欄號 | 欄位 | 本系統欄位 |
|---|---|---|
| 22 | CONCOMITANT DRUG(S) AND DATES（不含用於治療本次反應者） | `drugs[]` 中 `isSuspect === false` 者 |
| 23 | OTHER RELEVANT HISTORY（診斷、過敏、懷孕與末次月經等） | `medicalHistory` / `allergies` / `lastMenstrualPeriod` |

**IV. MANUFACTURER INFORMATION**
| 欄號 | 欄位 | 本系統欄位 |
|---|---|---|
| 24a | NAME AND ADDRESS OF MANUFACTURER | `reporterOrg` |
| 24b | MFR CONTROL NO. | `caseNumber` |
| 24c | DATE RECEIVED BY MANUFACTURER | `awarenessDate` ← **法定時鐘 Day 0** |
| 24d | REPORT SOURCE（STUDY／LITERATURE／HEALTH PROFESSIONAL／REGULATORY AUTHORITY／OTHER） | `reportSource` |
| 25a | REPORT TYPE（INITIAL／FOLLOW-UP） | `reportType` |
| 26 | NAME AND ADDRESS OF REPORTER | `primaryReporterName` 等 |

### 2.2 本地補充欄位（CIOMS 沒有，但台灣實務需要）

- **批號 (Lot) 與有效期限**：CIOMS Form I 無此欄，但這是產品品質調查與回收判斷的唯一線索。列為建議必填。
- **許可證字號**：對應 E2B `G.k.3.1`，送件時主管機關會核對。
- **公司內部通報人（業務）**：與 CIOMS 26 的「原始通報者」分開存。業務是轉述者，不是原始來源，混為一談會讓資料品質權重判斷失準。
- **原始通報者是否同意後續聯繫**：直接決定補件可行性。
- **反應發生國別（CIOMS 1a）**：CIOMS 本來就有這一欄，但實作上最容易被當成「反正都是台灣」而寫死。
  藥商對國內、外發生的嚴重不良反應都有蒐集義務，境外個案（原廠轉知、國外文獻）的送件路徑不同，
  因此表單一定要問，且不能只留預設值。`isForeignCase()` 據此在後台標記境外個案。

### 2.3 ICH E2B(R3)

`aeToE2B()` 產出資料元素對照（`C.1.4`、`D.2.1`、`E.i.1.1a`、`E.i.3.2a–f`、`G.k.2.4`、`H.1` 等），
供未來接電子送件用。**只映射本表單實際蒐集到的元素**，不硬塞空值——電子送件送出假資料比缺資料更糟。

---

## 3. 台灣法規要點

| 項目 | 內容 | 依據 |
|---|---|---|
| 通報義務人 | 醫療機構、藥局、取得藥品製造或輸入許可之藥商 | 《嚴重藥物不良反應通報辦法》 |
| 嚴重不良反應定義 | 死亡、危及生命、永久性殘疾、胎兒或嬰兒先天性畸形、住院或延長住院、其他可能導致永久性傷害之併發症 | 同上 |
| **藥商通報期限** | 知悉嚴重藥物不良反應之日起 **15 日內** | 同上 |
| 醫療機構／藥局期限 | 死亡或危及生命 **7 日內**；其他嚴重情形 **30 日內** | 同上 |
| 通報表內容 | 通報人姓名、聯絡方式、服務單位名稱與地址；不良反應發生日與知悉日；資訊來源；病人識別代號、性別、年齡／出生日期；用藥資訊；反應類別、症狀與描述 | 同上 |
| 非嚴重不良反應 | 不做個案別快速通報，收錄於定期安全性報告（PSUR/PBRER） | 《藥物安全監視管理辦法》 |
| 通報系統 | 全國藥物不良反應通報系統 `https://adr.fda.gov.tw/` | 衛福部食藥署 |
| 電子格式 | 通報表得依 ICH 電子傳輸標準化格式（E2B）為之 | 《嚴重藥物不良反應通報辦法》 |
| **追蹤報告** | 帶來**重要新資訊**的追蹤報告，15 日時鐘自「獲知新資訊之日」重新起算；未帶來重要新資訊者不重啟時鐘，收錄於定期安全性報告 | ICH 藥物警戒通則 ⚠️ 學理／國際慣例，非台灣法規明文 |

> ⚠️ **條次待查證**：上表內容經食藥署網頁與全國法規資料庫交叉確認，但個別條次（第幾條第幾項）未逐條核對原文，
> 撰寫 SOP 或對外文件時請以《全國法規資料庫》現行條文為準。
> 另請注意：疫苗、中藥、醫療器材、化粧品各有獨立的通報表與規定，本系統目前只涵蓋**西藥上市後**通報。

實作對應：`computeRegulatoryClock()` 只實作**藥商 15 日**這一條（`MAH_SERIOUS_REPORT_DAYS = 15`），
因為本系統的使用者是藥商。若日後要支援醫療機構通報，需依通報者身分分流 7／30 日。

回傳值帶一個 `basis` 欄位說明「為什麼有／沒有期限」，UI 直接顯示這個理由而不是留一格空白：

| `basis` | 情境 | 期限 |
|---|---|---|
| `expedited` | 嚴重個案 | 獲知日 + 15 日 |
| `non_serious` | 非嚴重 | 無，收錄於定期安全性報告 |
| `followup_no_new_info` | 追蹤報告但未帶來重要新資訊 | 無，不重啟時鐘 |
| `no_day0` | 未填首次獲知日 | 無法起算——最優先補件項目 |

⚠️ **`followup_no_new_info` 這條規則是最容易做錯的地方**：若把每一份追蹤報告都當成新的 15 日案件，
真正該急的案子會淹沒在假期限裡；反過來若一律不重啟，非嚴重轉嚴重的個案就會漏掉法定通報。
因此 `hasSignificantNewInfo` 是由藥安人員逐案判定的旗標，不做自動推論。

---

## 4. 有效個案的四要素

國際藥物警戒的共同底線，四者缺一即非有效 ICSR，不得逕行送件：

1. **可識別的病人**（initials、代號、性別、年齡或出生日期，任一即可）
2. **可識別的通報者**
3. **懷疑藥品**
4. **不良反應**

`checkMinimumCriteria()` 實作此判定。UI 在業務端與後台都以四格燈號呈現——
這是整個系統唯一「不齊就不能往下走」的硬性關卡。

注意實作細節：性別填 `unknown` **不算**可識別（填了等於沒填）；只有併用藥品**不算**懷疑藥品。

---

## 5. 兩個介面

### 5.1 業務通報端（`#/report`，手機優先）

分 6 步：通報者 → 病人 → 不良反應 → 懷疑藥品 → 併用藥與病史 → 確認送出。

手機優化的具體約束（都在 `components/ui.tsx` 統一實作）：

| 約束 | 原因 |
|---|---|
| 輸入框字級固定 `text-base`（16px） | iOS Safari 對 <16px 的輸入框會自動放大整頁，版面直接崩掉 |
| 可點擊元素 ≥ 44px 高 | Apple HIG / WCAG 2.5.5 觸控目標下限 |
| 單選／複選用大色塊 chip，不用原生 `<select>` | 手機下拉選單難點、看不到全部選項、無法一眼看出已選幾項 |
| 底部固定操作列，含 `env(safe-area-inset-bottom)` | 拇指可及；避開 iPhone home indicator |
| `type` / `inputMode` 對應（tel／email／date／numeric） | 直接叫出正確鍵盤，少按十幾下 |
| 分步驟而非單頁 | 完整 CIOMS 欄位在手機上是 40 個輸入框，捲到一半就放棄 |
| 每次輸入 debounce 600ms 寫草稿 | 業務在客戶端被打斷是常態，回來要能接著填 |
| 照片在裝置端縮到長邊 1600px、JPEG 0.72 | 手機直出 4–8MB，直接上傳吃流量又拖垮同步；1600px 下批號仍可辨讀 |
| 送出失敗自動進 outbox，恢復連線自動補送 | 「送出失敗就把資料丟掉」是這類表單最常見也最致命的缺陷 |

### 5.2 藥安後台（`nav.intake` 頁籤）

左側收件匣（依**時限壓力**排序，不是先進先出），右側七道處理關卡。詳見下一節。

---

## 6. 後台要做的處理（七道關卡）

| # | 關卡 | 做什麼 | 實作 |
|---|---|---|---|
| 0 | **收案登錄** | 產生個案編號（`PV-年度-流水號`）、鎖定首次獲知日 | `nextCaseNumber()` |
| 1 | **效度判定** | 四要素是否齊備。不齊備者列為**待補件**，不是直接退件 | `checkMinimumCriteria()` |
| 2 | **重複偵測** | 同一事件常由業務／客服／醫院三路湧入。重複送件會污染訊號偵測的分子（一案算成三案） | `findDuplicates()`：病人識別 30 分＋懷疑藥品 25 分＋反應詞 30 分＋發生日 15 分，≥50 分示警 |
| 3 | **嚴重性判定** | 決定是否觸發 15 日快速通報。後台可覆寫業務的勾選，覆寫會標記並要求寫理由 | `assessSeriousness()` |
| 4 | **醫學編碼與評估** | verbatim → MedDRA PT/SOC；預期性（對照核准仿單）；因果關係（WHO-UMC 六級） | `lookupMeddra()` + `AETriage` |
| 5 | **補件追蹤** | 把所有 warning 列成補件清單，一鍵草擬補件信件（帶上個案編號與法定期限） | `validateAEReport()` 的 warning 集合 |
| 6 | **送件與結案** | 產出 CIOMS-I 文字表單／E2B 對照 → 人工送 `adr.fda.gov.tw` → 登錄回執編號 | `aeToCIOMSText()` / `aeToE2B()` |
| 7 | **訊號聚合** | 併入既有的「成分 × MedDRA PT」聚合，與文獻個案共用同一套分析 | `aeToSignalRecords()` → `aggregateSignals()` |

補件收到回覆之後的出口是**追蹤報告**（`createFollowUp()`）：複製原案為一份新報告（編號 `原案-F1`、`-F2`…），
Day 0 設為**獲知新資訊之日**而非原案獲知日。刻意複製而非就地修改，因為主管機關收到的是一份份獨立文件，
原案送出當下的內容必須原樣保留以供稽核比對。附件不複製（原案已存，避免儲存量隨追蹤次數線性膨脹）。

追蹤鏈以 `followUpOfId` 串接，`chainRootId()` 可上溯到初始報告（並擋住資料損毀造成的環）。
**重複偵測必須排除同一追蹤鏈**——追蹤報告與原案在病人／藥品／反應三個維度本來就完全相同，
不排除的話每一份追蹤報告都會被標成重複個案，示警很快就會被無視。

貫穿全流程的兩件事：

- **稽核軌跡**（`auditTrail`）：每次狀態變更、判定、覆寫都留下「誰、何時、做了什麼、細節」。
  GxP 的基本要求，也是主管機關查核時唯一能證明流程走過的東西。
- **法定時鐘**：放在個案詳情最上方，逾期紅、五日內到期琥珀。收件匣排序也以它為第一鍵。
  因為這是整個系統裡**唯一有法律後果**的欄位。

### 為什麼嚴重性判定要允許人工覆寫

業務不是醫療專業人員，會漏勾（不知道「住院觀察一晚」算住院）也會誤勾（把「去急診看了一下」當危及生命）。
自動判定給的是**初判**，最終判定必須是人。但覆寫要留痕——`assessSeriousness()` 的 `overridden` 旗標
就是為了讓 UI 能提醒「你的判定和業務勾的不一樣，理由寫進註記」。

### 一個沒有做、但正式上線必須補的東西

**訊號偵測的統計方法**目前仍是簡單計數（≥3 筆或含嚴重個案即示警），
不是 PRR／ROR／IC 這類不成比例分析。自發性通報資料進來之後，個案數會遠大於文獻，
簡單計數會產生大量假訊號。⚠️ 這部分建議在個案數累積到數百筆之前完成升級。

---

## 7. 資料流與部署

```
業務手機 (#/report)
   │  submitAEReport()
   ├── VITE_AE_API_ENDPOINT 有設 → POST 後端 → 藥安後台讀 API
   ├── 未設定                    → 寫入同一瀏覽器的 IndexedDB（單機試用／展示）
   └── 任一步失敗                → outbox 佇列，恢復連線自動補送
```

⚠️ **未設定 `VITE_AE_API_ENDPOINT` 時，業務端與後台必須在同一台裝置的同一個瀏覽器**，
否則後台看不到手機送出的個案。這只適合展示與單機試用；正式上線一定要有真正的後端。
後台在視窗重新取得焦點時會重讀 IndexedDB，避免分頁停在舊快照或用舊資料覆寫新個案。

---

## 7A. 後端（Cloudflare Worker + D1 + R2）

### 7A.1 為什麼是這個組合

業務在外面跑客戶用手機通報、藥安人員在辦公室收案——這兩件事發生在不同裝置上，
**沒有後端就不可能成立**。選型上只有一個硬條件：前端已經掛在 Cloudflare Access 後面，
後端若換到別家，等於再養第二套身分驗證，而稽核軌跡最怕的就是兩套身分來源對不起來。

| 元件 | 用途 | 為什麼不是別的 |
|---|---|---|
| Workers | 收案 API（與既有 LLM proxy 同一支 Worker） | 同源、同一份 Access JWT 驗證，不必處理 CORS 與第二套登入 |
| D1（SQLite） | 個案與稽核軌跡 | ICSR 量級是「每年數百到數千筆」，不是需要 Postgres 的規模；且與 Worker 同一組帳單與權限 |
| R2 | 附件本體（藥盒照、檢驗單） | D1 有單列大小限制，1MB 的照片塞進 payload 會讓每次列表查詢都把它拖出來 |
| KV | 速率限制（沿用既有） | 已在用 |

⚠️ 使用者確認**無資料落地（data residency）要求**，故 D1／R2 皆建於 ENAM。
若日後客戶或主管機關要求資料留在特定法域，這是需要重建資料庫的變更，不是設定調整。

### 7A.2 資料表（`worker/schema.sql`）

三張表：

- **`ae_cases`** —— 個案本體以 JSON `payload` 存放，另外把查詢與排序真正會用到的欄位
  抽成索引欄（`status`、`report_type`、`follow_up_of_id`、`awareness_date`、`due_date`、
  `serious`、`country`、`suspect_drug`、`patient_key`、`submitted_by`）。

  **為什麼不完全正規化**：CIOMS/E2B 的個案是深層巢狀結構（事件 n 筆、藥品 n 筆、
  每筆藥品下又有療程資訊）。完全正規化等於要維護兩份結構定義（TypeScript 型別與資料表），
  以及一組雙向映射；欄位一改就得同時改三個地方，映射漂移只會在資料寫壞之後才被發現。
  JSON payload + 索引欄的取捨是：**查詢效能只在真正需要查的欄位上付出代價**，
  結構演進的成本則留在單一定義（`services/aeReport.ts`）裡。
  代價是無法用 SQL 對巢狀欄位做 ad-hoc 查詢——目前的用例（收件匣排序、重複偵測、
  訊號聚合）都不需要。

- **`ae_audit`** —— 稽核軌跡獨立成表，**只增不改**，且在資料庫層強制：

  ```sql
  CREATE TRIGGER trg_ae_audit_no_update BEFORE UPDATE ON ae_audit
  BEGIN SELECT RAISE(ABORT, 'audit trail is append-only'); END;
  ```

  （另有一支對應的 DELETE trigger。）應用層的「我不會去改它」不是保證，
  是承諾；GxP 要的是前者。已實測驗證：對 `ae_audit` 執行 UPDATE 與 DELETE
  皆回 `SQLITE_CONSTRAINT_TRIGGER: audit trail is append-only`。

- **`ae_attachments`** —— 只存中繼資料（名稱、MIME、大小、R2 key），blob 在 R2。

### 7A.3 API

全部掛在 `/api/ae-reports`，與 LLM proxy 同一支 Worker、同一套 Access 驗證：

| 方法 | 路徑 | 行為 |
|---|---|---|
| GET | `/api/ae-reports` | 列出未刪除個案，依「有期限者優先、到期日近者優先」排序 |
| POST | `/api/ae-reports` | 收案；附件的 dataURL 於此搬入 R2 |
| GET | `/api/ae-reports/:id` | 單案（含稽核軌跡） |
| PATCH | `/api/ae-reports/:id` | 更新單案 |
| DELETE | `/api/ae-reports/:id?reason=…` | **軟刪除**，理由寫入稽核軌跡 |
| GET | `/api/ae-reports/:id/attachments/:attId` | 取附件；`Cache-Control: private` |

兩條不可退讓的規則，寫在 `worker/ae.js` 檔頭：

1. **actor 一律來自已驗證的 Access JWT**（`identity.email`），前端送什麼身分都不採信。
   沒有可信身分時整個 API 回 401 而非「以匿名記錄」——稽核軌跡若能被偽造，
   它的存在只會製造「有在管控」的錯覺。
2. **個案永不物理刪除**。DELETE 只設 `deleted_at/by/reason`。

### 7A.4 兩份判定邏輯的鏡像問題

Worker 是 `.js`、跑在 workerd，無法匯入前端的 TypeScript 模組，
因此 `deriveSerious()` 與 `deriveDueDate()` 在 `worker/ae.js` 裡是**刻意重寫的鏡像**
（供 D1 索引欄使用）。鏡像會漂移，而漂移的症狀是「收件匣的到期日排序和個案內頁顯示的
到期日不一致」——很難在測試環境重現，卻直接影響法定時限。

因此 `tests/worker.ae.test.ts` 用同一批個案同時餵給兩邊逐案比對，
涵蓋非嚴重／自動嚴重／人工覆寫兩向／追蹤報告有無新資訊／缺 Day 0 等分支。
唯一容許的差異是**空值表示法**：前端回空字串、Worker 回 `null`（要落成 SQL NULL）。

### 7A.5 身分驗證：Cloudflare Access Email OTP

業務端不自建帳號密碼——多一套密碼就是多一組會外洩、會被共用、要負責重設的憑證。
改用 **Cloudflare Access 的 Email OTP**：使用者輸入 email，收一次性代碼，即完成登入。

- 允許名單必須用**個別 email 逐一列舉**。
- ⚠️ **絕不可設 `@gmail.com` 網域規則**——那等於全世界有 Gmail 的人都能進來。
- ⚠️ 私人 Gmail **沒有離職自動失效**機制。公司信箱可隨離職停用，私人信箱不會；
  這一條必須寫進離職檢查表，否則離職業務永遠留著一把鑰匙。

⚠️ **`pv-link-auditor.pages.dev` 目前未經 Access 保護**，可直接開啟。
在輸入任何真實病人資料之前必須先鎖上（Access policy 涵蓋該網域，或關閉該 pages.dev 子網域）。

## 8. 已補齊與仍待處理

**本版已補齊**（原設計文件列為缺口者）：

- 境外個案：`country` / `countryOther` 已在手機通報端提供輸入，後台標記境外個案並印入 CIOMS 1a 與 E2B `E.i.9`
- 追蹤報告：後台可由原案建立，含時鐘重算規則與追蹤鏈檢視

- 後端收案 API：Worker + D1 + R2，稽核軌跡 append-only（見 §7A）
- 稽核軌跡的 `actor` 改由後端從 Access JWT 取得，前端無法偽造
- 個案改為軟刪除，刪除理由寫入稽核軌跡（本機模式仍為硬刪，因為本機模式本來就沒有可信身分）

**仍待處理**：

- 文獻管道（`services/cioms.ts`）沒有獲知日概念，與通報管道的法定時鐘尚未統一
- 訊號偵測仍是簡單計數，非不成比例分析（見 §6）
- 醫療機構／藥局的 7 日、30 日期限未實作
- ⚠️ `pv-link-auditor.pages.dev` 尚未納入 Access 保護（見 §7A.5）
- 附件未做自動去識別化（見 §9）

## 9. 個資考量

- 表單刻意只收**姓名縮寫**，並在 UI 明講「不要填全名、身分證號、完整病歷號」——通報只需要能**區辨**個案，不需要能**識別**本人。
- 附件（藥盒照片、檢驗單）可能夾帶病人姓名，後台需在送件前檢查。⚠️ 目前**未實作**自動去識別化，屬已知缺口。
- 個資聲明顯示在送出前的最後一步，說明蒐集目的（藥物安全監視之特定目的）與法律依據。
