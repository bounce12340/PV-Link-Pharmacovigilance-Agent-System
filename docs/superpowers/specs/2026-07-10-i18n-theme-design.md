# PV-Link 雙語切換與明暗主題 — 設計文件

日期：2026-07-10
狀態：設計已定，待寫實作計畫

## 目標

為 PV-Link 前端（React 19 + TS + Vite + Tailwind）加兩個功能：
1. **中英雙語切換**：UI 介面文字中英切換，且 AI 產出（摘要/結論/結構化抽取）依當前語言產出。
2. **明暗主題切換**：保留現有亮色水彩漸層 + 玻璃擬態的設計語言，做出對應的暗色版。

語言與主題偏好記憶於 localStorage，預設繁中 + 亮色（維持現狀）。

## 需求決策（已與使用者確認）

| 項目 | 決策 |
|---|---|
| 雙語範圍 | UI 標籤 + AI 產出「依當前語言產」（切語言只影響新抽取，舊記錄維持原語言） |
| 暗色風格 | 保留設計語言的暗色版（水彩漸層改低亮度暗色霓虹，玻璃卡片改暗色半透明） |
| 偏好記憶 | localStorage 記憶，預設繁中/亮色 |
| Tailwind | 正規化成 Vite/PostCSS 建置依賴（移除 CDN Tailwind，清 dev-only 技術債） |
| i18n 方案 | 輕量自製字典 + Context + hook，不加 library |
| 舊記錄語言不一致 | 詳情頁加「以當前語言重新產出」按鈕，使用者手動觸發重抽 |

## 檔案結構

### 新增
- `i18n/translations.ts` — 字典 `{ zh: {...}, en: {...} }` 與 `TransKey` 型別
- `i18n/LangContext.tsx` — `LangProvider` + `useT()`（取譯文）+ `useLang()`（讀/設語言）
- `theme/ThemeContext.tsx` — `ThemeProvider` + `useTheme()`
- `index.css` — `@tailwind base/components/utilities`
- `tailwind.config.js`（`darkMode: 'class'`、content 掃 `./index.html` 與 `./**/*.{ts,tsx}`）
- `postcss.config.js`（tailwindcss + autoprefixer）
- `tests/i18n.test.ts`

### 修改
- `index.html` — 移除 `<script src="cdn.tailwindcss.com">`；Google Fonts link 保留
- `index.tsx` — `import './index.css'`；以 `<ThemeProvider><LangProvider>` 包住 `<App/>`
- `App.tsx` — 寫死繁中換 `t('key')`；亮色 class 加 `dark:` 變體；header 加語言 + 主題切換鈕；詳情頁加「重新產出」按鈕
- `services/llmService.ts` — `scoreRelevance`/`generateSummaries`/`extractPVData` 加 `lang` 參數
- `package.json` — devDeps 加 `tailwindcss`、`postcss`、`autoprefixer`

## 元件與資料流

### i18n
- `LangProvider` 持有 `lang: 'zh' | 'en'` state，初值讀 localStorage `PV_LANG`，預設 `zh`；變更時寫回。
- `useT()` 回 `t(key)`，解析 `translations[lang][key] ?? translations.zh[key] ?? key`——缺 key 先回退繁中、再回退 key 字串本身，永不拋錯。
- 字串以扁平命名空間分組：`nav.*`、`input.*`、`review.*`、`db.*`、`signals.*`、`common.*`。預估 80–120 個 key。
- `translations` 的 `zh` 與 `en` 以同一份 key 型別約束，漏譯在測試中被抓。

### 主題
- `ThemeProvider` 持有 `theme: 'light' | 'dark'` state，初值讀 localStorage `PV_THEME`，預設 `light`。
- `useEffect` 依 `theme` toggle `document.documentElement.classList` 的 `dark`。
- `useTheme()` 回 `{ theme, toggle }`；header 一顆 ☀/🌙 鈕呼叫 `toggle`。

### AI 產出語言
- 三個產出函式簽名加 `lang` 參數；prompt 內文與「輸出語言指示」依 lang 切換。
- **欄位名 `summary_zh` / `conclusion_zh` 保留不變**（只是內容語言不同），避免動 `PVRecord` 型別與既有資料。
- App 呼叫時傳 `useLang().lang`。
- 詳情頁「以當前語言重新產出」按鈕：對當前選取記錄重呼叫 `generateSummaries` + `extractPVData`（帶當前 lang），覆蓋該筆 `summary_zh`/`conclusion_zh`/`pv_data`。

### 切換 UI
- header（現有 `PV-Link Auditor` 標題列右側）加兩個小控制：語言切換（`中 / EN` 段落鈕）與主題切換（☀/🌙）。

## 暗色樣式範圍

保留水彩設計語言：
- 頂部漸層 blur div：indigo/rose/teal 降飽和 + 深底（`dark:` 變體）
- 玻璃卡片：`bg-white/30` → `dark:bg-white/5`、`border-white/40` → `dark:border-white/10`
- 文字：`text-slate-900` → `dark:text-slate-100`、次要文字對應調整
- 表格、輸入框、分頁鈕、日誌區逐一加 `dark:` 變體

這是本功能最大宗的機械工作，需逐容器覆蓋，避免遺漏造成亮暗混雜。

## 錯誤處理

- i18n 缺 key：回退繁中 → 回退 key 字串，不拋錯、不顯示空白。
- 主題：localStorage 讀取失敗（隱私模式）時 fallback 記憶體 state，不影響切換。
- AI 重新產出：沿用現有 `llmService` 的 try/catch 與 fallback，失敗顯示既有錯誤訊息。

## 測試與驗證

- `tests/i18n.test.ts`：驗 `zh` 與 `en` 的 key 集合完全一致（無漏譯）；`t()` 對缺 key 的回退行為。
- 現有 23 測試維持綠。
- `npm run typecheck` + `npm run build`：驗 Tailwind 正規化後 CSS 正確產出（**正規化的主要風險點**）。
- 本機 `npm run preview` 實際目視：明暗切換、中英切換、水彩暗色版樣式無破損。
- 部署後於 pvlink.uic-ai.com 硬重整實測。

## 風險與注意

- **Tailwind 正規化**是最大風險：content 掃描需涵蓋所有用到 class 的檔案，否則 production CSS 會漏樣式（畫面裂）。現有大量任意值 class（`bg-[#f8fafc]`、`blur-[120px]`、`animate-[pulse_8s_infinite]`）JIT 支援，但需 build 後目視確認。
- App.tsx 已較大，i18n key 化 + `dark:` 變體會使其更大；本次不做結構性拆分（避免範圍蔓延），但若切換 UI 與 provider 邏輯可獨立成小元件則順手抽出。

## 非目標（YAGNI）

- 不支援第三種語言（只中/英）。
- 不做 AI 產出的中英雙份儲存（只依當前語言產、按需重產）。
- 不引入 i18n library、不做複數/日期在地化格式（醫學摘要不需要）。
