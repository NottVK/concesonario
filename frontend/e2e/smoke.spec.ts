import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * SMOKE de la Fase 3: tres flujos encadenados sobre una base temporal con el seed cargado.
 *   1. Catálogo → detalle → agendar cita (cliente anónimo).
 *   2. Login admin → confirmar esa cita.
 *   3. Login vendedor → registrar una venta a ese mismo cliente.
 *
 * Variables (se pasan en el comando; nunca se leen de `.env`):
 *   E2E_PASSWORD      contraseña de los usuarios demo de la base temporal (obligatoria)
 *   E2E_BASE_URL      dirección de Vite (por defecto http://localhost:5174)
 *   E2E_ADMIN_EMAIL   (por defecto admin@automax.co)  E2E_SELLER_EMAIL (por defecto vendedor@automax.co)
 */
const PASSWORD = process.env.E2E_PASSWORD
const ADMIN = process.env.E2E_ADMIN_EMAIL ?? 'admin@automax.co'
const SELLER = process.env.E2E_SELLER_EMAIL ?? 'vendedor@automax.co'

// Datos únicos de la corrida; los flujos 2 y 3 reutilizan al cliente del flujo 1.
const run = Date.now()
const customer = { name: `Smoke Cliente ${run}`, email: `smoke-${run}@example.com` }

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  if (!PASSWORD) throw new Error('Falta E2E_PASSWORD: pásala en el comando (no se lee de .env).')
})

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/admin/login')
  await page.getByLabel(/correo/i).fill(email)
  await page.getByLabel(/contraseña/i).fill(PASSWORD ?? '')
  await page.getByRole('button', { name: /entrar|iniciar/i }).click()
}

test('1. catálogo → detalle → agendar cita', async ({ page }) => {
  await page.goto('/catalogo')
  const first = page.getByRole('link', { name: /\$/ }).first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page).toHaveURL(/\/catalogo\/\d+/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Agendar test-drive' }).click()
  const dialog = page.getByRole('dialog', { name: 'Agenda tu test-drive' })
  await expect(dialog).toBeVisible()

  // Primer día habilitado (no domingo ni pasado) y su primera hora libre.
  await dialog.locator('fieldset', { hasText: 'Día de la visita' }).locator('label:has(input:not(:disabled))').first().click()
  await dialog.locator('fieldset', { hasText: 'Hora de inicio' }).locator('label:has(input:not(:disabled))').first().click()

  await dialog.getByLabel('Nombre completo').fill(customer.name)
  await dialog.getByLabel('Correo electrónico').fill(customer.email)
  await dialog.getByRole('button', { name: 'Agendar test-drive' }).click()
  await expect(page.getByRole('heading', { name: 'Tu test-drive quedó agendado' })).toBeVisible()
})

test('2. login admin → confirmar la cita', async ({ page }) => {
  await login(page, ADMIN)
  await page.waitForURL('**/admin/metricas')
  await page.getByRole('navigation', { name: 'Panel' }).getByRole('link', { name: 'Citas' }).click()
  const row = page.getByRole('list', { name: 'Citas', exact: true }).getByRole('listitem').filter({ hasText: customer.name })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Pendiente')
  await row.getByRole('button', { name: /^Confirmar la cita de/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar cita' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'confirmada' })).toBeVisible()
  // Ya no está entre las pendientes.
  await expect(row).toHaveCount(0)
  // Y aparece entre las confirmadas, con ese estado.
  await page.getByRole('button', { name: 'Confirmadas' }).click()
  const confirmed = page.getByRole('list', { name: 'Citas', exact: true }).getByRole('listitem').filter({ hasText: customer.name })
  await expect(confirmed).toContainText('Confirmada')
})

test('3. login vendedor → registrar una venta', async ({ page }) => {
  await login(page, SELLER)
  await page.waitForURL('**/admin/citas')
  await page.getByRole('navigation', { name: 'Panel' }).getByRole('link', { name: 'Registrar venta' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Registrar venta' })).toBeVisible()

  const vehicles = page.getByRole('list', { name: 'Vehículos disponibles' })
  await expect(vehicles).toBeVisible()
  await vehicles.getByRole('button', { name: /^Elegir / }).first().click()

  await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill(customer.name)
  await page.getByRole('button', { name: `Elegir a ${customer.name}` }).click()
  await page.getByLabel('Precio final (COP)').fill('90000000')
  await page.getByRole('radio', { name: 'Contado' }).click()
  await page.getByRole('button', { name: 'Revisar venta' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar venta' }).click()
  await expect(page.getByRole('status', { name: 'Venta registrada' })).toBeVisible()

  // El vendedor no ve el historial ni las métricas (solo admin).
  await expect(page.getByRole('navigation', { name: 'Panel' }).getByRole('link', { name: 'Ventas', exact: true })).toHaveCount(0)
})
