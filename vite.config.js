import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 會把網站放在 https://<user>.github.io/<repo>/，
// 所以 build 出來的資源路徑必須帶這個前綴。
// 只在 build 時套用：dev server 維持在 /，本機與內網測試、e2e 都不受影響。
const GITHUB_PAGES_BASE = '/Travel_planner/'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? GITHUB_PAGES_BASE : '/',
  server: {
    port: 5173,
    // host: true → 綁 0.0.0.0，同一個區域網路的手機／平板可以直接用內網 IP 連進來測試
    host: true,
  },
}))
