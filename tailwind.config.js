import colors from 'tailwindcss/colors';

/**
 * 色彩 token。
 *
 * 元件裡只寫語意色名，不寫色相名（rose、amber……）。原因是這套介面的顏色
 * 本身就是資訊：藥安人員看到紅色會以為法規時鐘出事了。色相名讓人「挑個好看
 * 的粉紅」，語意名逼人先回答「這是不是危險」。tests/designTokens.test.ts 會擋
 * 下元件裡出現未列在這裡的色相。
 *
 *   brand    主要動作、目前選取、品牌識別
 *   danger   只用在「出事了」：法規期限逾期、嚴重不良反應、錯誤、必填未填
 *   caution  需要有人注意但還沒出事：內部工作逾期、待補件、離線、未儲存
 *   success  完成、已送達、已確認
 *   slate    唯一的中性色（文字、邊框、底色）；不另用 gray／zinc／neutral
 *
 * 色階沿用 Tailwind 原色，所以改名前後畫面逐像素相同；日後要換品牌色只改這裡。
 */
const semantic = {
  brand: colors.indigo,
  danger: colors.rose,
  caution: colors.amber,
  success: colors.emerald,
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './index.tsx', './App.tsx', './components/**/*.{ts,tsx}', './services/**/*.{ts,tsx}', './i18n/**/*.{ts,tsx}', './theme/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * 字型 token。
       *
       * 系統字型而非網路字型：原本 index.html 載入 Google Fonts 的 Inter 與 Noto Sans TC，
       * 但 App、通報表單、建檔畫面三個根元素都套了 font-sans（Tailwind 預設的系統字型），
       * 網路字型實際上從未被使用——卻仍是一個阻塞渲染的外部請求，業務在診所用手機網路
       * 開表單時最慢的就是它。另外，病人資料系統少一個對第三方的請求也比較乾淨。
       *
       * 明列繁中字型：介面切成英文時 <html lang> 會變成 en（WCAG 3.1.1），瀏覽器就不再
       * 依 zh-TW 挑中文後備字型；Windows 可能改用微軟雅黑，病人敘述裡的中文會出現簡體字形。
       * 拉丁字仍由 system-ui 負責，所以英文的呈現不變。
       *
       * 字級沿用 Tailwind 預設級距（xs 12／sm 14／base 16／lg 18…），下限 12px，
       * 不寫 text-[10px] 這類任意值；12px 字最粗用 font-bold。由 tests/designTokens.test.ts 把關。
       */
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '"PingFang TC"', '"Microsoft JhengHei"', '"Noto Sans TC"', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
      },
      colors: {
        ...semantic,
        // 頁面底色。值定義在 index.css 的 CSS 變數，亮暗色由 :root.dark 切換，
        // 元件只寫 bg-canvas，不必每處成對寫 dark: 變體。
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        // 次要文字（說明、時間戳、欄位小標）。亮暗色各自已驗過對比，取代成對的
        // text-slate-500 dark:text-slate-400 等寫法。
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
