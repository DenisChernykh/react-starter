import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    css: true,
    environment: 'jsdom',
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
    },
    setupFiles: ['./src/shared/lib/testing/setup-tests.ts'],
  },
})
