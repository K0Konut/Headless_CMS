import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // En dev, Vite relaie l'API : dashboard et API restent sur la même origine, comme en production.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  test: { environment: 'happy-dom' },
})
