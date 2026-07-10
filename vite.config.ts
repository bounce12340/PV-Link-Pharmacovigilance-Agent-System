import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// LLM 金鑰不再由 Vite 注入前端 bundle。
// 前端只讀 VITE_ 前綴的公開設定（見 .env.example）：
//   - 公開/多人部署：設定 VITE_PV_PROXY_ENDPOINT，金鑰留在後端 Worker。
//   - 本機開發：設定 VITE_LLM_BASE_URL / VITE_LLM_API_KEY / VITE_LLM_MODEL。
export default defineConfig(() => ({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  test: {
    // theme.test.ts 需要 localStorage（Node 環境無此全域），改用 jsdom。
    environment: 'jsdom',
  },
}));
