import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Widget del chat en el navegador, con `/api/chat` INTERCEPTADO (respuestas fijas): prueba la interfaz, no al
 * modelo. Se ejecuta contra una API y un Vite ya encendidos sobre una BASE TEMPORAL (ver `e2e/smoke.spec.ts`).
 *   1. Precio → ficha del vehículo.
 *   2. Agendar → tarjeta → confirmar (un solo POST).
 *   3. Móvil de 375 px sin scroll horizontal.
 */
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function firstVehicleId(page: Page): Promise<number> {
  const response = await page.request.get('/api/vehiculos?limit=1')
  const body = (await response.json()) as { data: { id: number }[] }
  expect(body.data.length, 'la base temporal necesita al menos un vehículo (seed)').toBeGreaterThan(0)
  return body.data[0]!.id
}

const card = (id: number) => ({
  id, title: 'Vehículo de prueba', year: 2024, price: '95900000.00', priceText: '$95.900.000',
  fuel: 'gasolina', transmission: 'automatica', mileage: 0, status: 'nuevo', image: null,
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/chat/estado', (route) => json(route, { available: true, provider: 'mock', external: false }))
})

test('1. el asistente responde un precio y lleva a la ficha', async ({ page }) => {
  const id = await firstVehicleId(page)
  await page.route('**/api/chat', (route) =>
    route.request().method() === 'POST'
      ? json(route, { reply: 'Te muestro una opción.', cards: [card(id)], proposal: null, sessionToken: 'a'.repeat(43) })
      : route.continue(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const box = page.getByLabel('Escribe tu mensaje')
  await expect(box).toBeFocused()
  await box.fill('¿Cuánto cuesta?')
  await box.press('Enter')
  await expect(page.getByText('Te muestro una opción.')).toBeVisible()
  await expect(page.getByText('$95.900.000')).toBeVisible()
  await page.getByRole('link', { name: /Ver ficha/ }).click()
  await expect(page).toHaveURL(new RegExp(`/catalogo/${id}$`))
})

test('2. agendar → tarjeta → confirmar manda un solo POST', async ({ page }) => {
  const id = await firstVehicleId(page)
  const proposal = {
    id: '11111111-1111-4111-8111-111111111111',
    summary: 'Test-drive del Vehículo de prueba, martes 3 de noviembre, 10:00 a. m. (hora de Bogotá)',
    vehicleLabel: 'Vehículo de prueba', startsAt: '2026-11-03T15:00:00.000Z', expiresAt: '2026-11-03T15:10:00.000Z',
  }
  const confirms: unknown[] = []
  await page.route('**/api/chat', (route) =>
    route.request().method() === 'POST'
      ? json(route, { reply: 'Preparé tu propuesta.', cards: [card(id)], proposal, sessionToken: 'b'.repeat(43) })
      : route.continue(),
  )
  await page.route('**/api/chat/citas/confirmar', async (route) => {
    confirms.push(route.request().postDataJSON())
    await json(route, { appointmentId: 77, message: 'Cita #77 registrada para Vehículo de prueba.' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  await page.getByLabel('Escribe tu mensaje').fill('Quiero agendar mañana a las 10')
  await page.getByRole('button', { name: 'Enviar mensaje' }).click()
  const form = page.getByRole('form', { name: 'Confirmar cita' })
  await expect(form.getByText(proposal.summary)).toBeVisible()
  expect(confirms).toHaveLength(0)
  await form.getByLabel('Nombre').fill('Ana Pérez')
  await form.getByLabel('Correo').fill('ana@correo.co')
  await form.getByRole('button', { name: 'Confirmar cita' }).click()
  await expect(page.getByText('Cita #77 registrada para Vehículo de prueba.')).toBeVisible()
  expect(confirms).toHaveLength(1)
  expect(confirms[0]).toMatchObject({ proposalId: proposal.id, customer: { name: 'Ana Pérez', email: 'ana@correo.co' } })
})

test('3. en un móvil de 375 px el panel ocupa la pantalla y no hay scroll horizontal', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 700 }, locale: 'es-CO' })
  const page = await context.newPage()
  await page.route('**/api/chat/estado', (route) => json(route, { available: true, provider: 'mock', external: false }))
  // Se mide en /catalogo: la portada ya desbordaba 36 px a 375 px antes del widget (pendiente de la Fase 7).
  await page.goto('/catalogo')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Asistente de AutoMax' })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(374)
  expect(box?.height).toBeGreaterThanOrEqual(699)
  // Como texto: el proyecto de e2e no incluye los tipos del DOM.
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  expect(overflow).toBeLessThanOrEqual(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await context.close()
})
