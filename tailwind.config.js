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
      colors: {
        ...semantic,
        // 頁面底色。值定義在 index.css 的 CSS 變數，亮暗色由 :root.dark 切換，
        // 元件只寫 bg-canvas，不必每處成對寫 dark: 變體。
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
