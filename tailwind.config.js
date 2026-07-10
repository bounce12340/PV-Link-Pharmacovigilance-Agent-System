/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './index.tsx', './App.tsx', './services/**/*.{ts,tsx}', './i18n/**/*.{ts,tsx}', './theme/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
