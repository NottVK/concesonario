import { expect, test } from '@playwright/test'

/**
 * Portada en móvil (decisión 89): a 375 px desbordaba 36 px en horizontal. Medición real en un navegador; las clases que lo evitan
 * están fijadas además en Vitest (`HomePage.test.tsx` y `test/hygiene.test.ts`). Se ejecuta como el resto de e2e (ver `smoke.spec.ts`):
 * contra una API y un Vite ya encendidos sobre una BASE TEMPORAL con el seed.
 */
for (const width of [320, 360, 375, 390, 414]) {
  test(`la portada no desborda en horizontal a ${width} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'es-CO' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Destacados' })).toBeVisible()
    // Como texto: el proyecto de e2e no incluye los tipos del DOM.
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    expect(overflow, `desborde horizontal a ${width} px`).toBeLessThanOrEqual(0)
    // Y ningún elemento de la portada sobresale del borde derecho (el recorte de <main> no debe estar tapando un desborde real).
    const sticking = await page.evaluate<number>(
      `[...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > ${width} + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('[class*="overflow-x-auto"]') }).length`,
    )
    expect(sticking, 'elementos que sobresalen del borde derecho').toBe(0)
    await context.close()
  })
}
