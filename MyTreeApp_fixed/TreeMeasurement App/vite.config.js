import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 아이폰에서 같은 Wi-Fi로 접속해 테스트할 수 있도록 외부 접속 허용
  server: { host: true },
})
