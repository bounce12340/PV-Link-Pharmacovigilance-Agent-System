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

## 8. 已補齊與仍待處理

**本版已補齊**（原設計文件列為缺口者）：

- 境外個案：`country` / `countryOther` 已在手機通報端提供輸入，後台標記境外個案並印入 CIOMS 1a 與 E2B `E.i.9`
- 追蹤報告：後台可由原案建立，含時鐘重算規則與追蹤鏈檢視

**仍待處理**：

- 文獻管道（`services/cioms.ts`）沒有獲知日概念，與通報管道的法定時鐘尚未統一
- 稽核軌跡的 `actor` 為寫死預設值；個案為硬刪，會連稽核軌跡一起移除
- 訊號偵測仍是簡單計數，非不成比例分析（見 §6）
- 醫療機構／藥局的 7 日、30 日期限未實作

## 9. 個資考量

- 表單刻意只收**姓名縮寫**，並在 UI 明講「不要填全名、身分證號、完整病歷號」——通報只需要能**區辨**個案，不需要能**識別**本人。
- 附件（藥盒照片、檢驗單）可能夾帶病人姓名，後台需在送件前檢查。⚠️ 目前**未實作**自動去識別化，屬已知缺口。
- 個資聲明顯示在送出前的最後一步，說明蒐集目的（藥物安全監視之特定目的）與法律依據。
