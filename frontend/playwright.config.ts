import { defineConfig } from '@playwright/test'

/**
 * Smoke de navegador (tres flujos). No levanta servidores ni lee `.env`: se ejecuta contra una API y un Vite
 * ya encendidos sobre una BASE TEMPORAL, con las direcciones y la contraseña de demostración pasadas en el
 * comando (ver `e2e/smoke.spec.ts`). Los e2e formales completos quedan para la Fase 7.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    viewport: { width: 1366, height: 900 },
    locale: 'es-CO',
    trace: 'retain-on-failure',
  },
})
