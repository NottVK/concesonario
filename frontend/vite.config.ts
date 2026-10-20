import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // El navegador solo habla con el origen de Vite; /api se reenvía a la API (sin CORS en desarrollo).
  const apiTarget = env.VITE_API_TARGET ?? 'http://localhost:8000'
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
      css: false,
      // El smoke de Playwright (e2e/) lo ejecuta `npm run e2e:smoke`, no Vitest.
      exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
      // Con 23 archivos en paralelo el formulario de citas (jsdom + <dialog>) pasaba de 5 s en equipos lentos.
      testTimeout: 15_000,
      // Los archivos de pruebas son pesados (jsdom): con todos los núcleos el equipo se satura y salen fallos por tiempo.
      maxWorkers: 3,
    },
  }
})
