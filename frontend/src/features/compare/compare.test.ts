import type { VehicleWithBrand } from '@/api/types'
import { bestIds, moneyToCents, parseCompareIds } from './compare'

const parse = (query: string) => parseCompareIds(new URLSearchParams(query))

describe('parseCompareIds: URLs enormes', () => {
  it('no procesa miles de fragmentos: devuelve los 3 primeros y avisa', () => {
    const huge = Array.from({ length: 50_000 }, (_, i) => i + 1).join(',')
    const started = performance.now()
    const result = parseCompareIds(new URLSearchParams({ ids: huge }))
    expect(performance.now() - started).toBeLessThan(200)
    expect(result.ids).toEqual([1, 2, 3])
    expect(result.needsRewrite).toBe(true)
    expect(result.notice).not.toBeNull()
  })

  it('un solo valor larguísimo tampoco se procesa entero', () => {
    const result = parseCompareIds(new URLSearchParams({ ids: '7,' + 'x'.repeat(1_000_000) }))
    expect(result.ids).toEqual([7])
  })
})

describe('parseCompareIds: la URL nunca pide más de 3 vehículos', () => {
  it('lee una lista limpia sin reescribir la URL', () => {
    expect(parse('ids=1,2,3')).toMatchObject({ ids: [1, 2, 3], normalized: '1,2,3', needsRewrite: false, notice: null })
  })

  it('se queda con los 3 primeros y avisa', () => {
    const result = parse('ids=1,2,3,4,5')
    expect(result.ids).toEqual([1, 2, 3])
    expect(result.needsRewrite).toBe(true)
    expect(result.notice).toMatch(/Solo se pueden comparar 3/)
  })

  it('quita repetidos antes de contar el máximo', () => {
    expect(parse('ids=1,1,2,2,3').ids).toEqual([1, 2, 3])
    expect(parse('ids=1,1,1,2').ids).toEqual([1, 2])
  })

  it('descarta lo que no sea un id válido y lo dice', () => {
    const result = parse('ids=2,abc,0,-1,01,1e3,3.5,99999999999,3')
    expect(result.ids).toEqual([2, 3])
    expect(result.notice).toMatch(/Ignoramos/)
    expect(result.needsRewrite).toBe(true)
  })

  it('acepta ids repetidos como parámetro (ids=1&ids=2) y los unifica', () => {
    const result = parse('ids=1&ids=2,3&ids=4')
    expect(result.ids).toEqual([1, 2, 3])
    expect(result.normalized).toBe('1,2,3')
    expect(result.needsRewrite).toBe(true)
  })

  it('descarta ids que la API no aceptaría (más de 2147483647)', () => {
    expect(parse('ids=2147483647,2147483648,99999999999').ids).toEqual([2147483647])
  })

  it('espacios alrededor se toleran y se limpian', () => {
    const result = parse('ids=%201%20,%202')
    expect(result.ids).toEqual([1, 2])
    expect(result.needsRewrite).toBe(true)
  })

  it('sin parámetro no hay nada que reescribir; vacío o basura, sí', () => {
    expect(parse('')).toMatchObject({ ids: [], needsRewrite: false })
    expect(parse('ids=')).toMatchObject({ ids: [], needsRewrite: false })
    expect(parse('ids=abc')).toMatchObject({ ids: [], needsRewrite: true })
  })

  it('no confunde intentos de inyección con ids', () => {
    expect(parse(`ids=${encodeURIComponent("1 OR 1=1")},2`).ids).toEqual([2])
    expect(parse(`ids=${encodeURIComponent('<script>alert(1)</script>')}`).ids).toEqual([])
  })
})

const car = (id: number, extra: Partial<VehicleWithBrand> = {}): VehicleWithBrand => ({
  id, brandId: 1, brand: { id: 1, name: 'Marca', country: 'X', logoUrl: null }, model: `M${id}`, year: 2022,
  version: 'Base', price: '100000000.00', mileage: 10000, fuel: 'gasolina', transmission: 'manual', color: 'Gris',
  status: 'usado', description: null, images: [], ...extra,
})

describe('bestIds: mejor valor por fila', () => {
  it('menor precio, año más reciente y menor kilometraje', () => {
    const best = bestIds([
      car(1, { price: '100000000.00', year: 2022, mileage: 20000 }),
      car(2, { price: '90000000.00', year: 2024, mileage: 0 }),
      car(3, { price: '95000000.00', year: 2023, mileage: 5000 }),
    ])
    expect([...best.price]).toEqual([2])
    expect([...best.year]).toEqual([2])
    expect([...best.mileage]).toEqual([2])
  })

  it('reparte los mejores entre vehículos distintos', () => {
    const best = bestIds([car(1, { price: '80000000.00', year: 2020 }), car(2, { price: '120000000.00', year: 2025 })])
    expect([...best.price]).toEqual([1])
    expect([...best.year]).toEqual([2])
  })

  it('un empate en el mejor valor los marca a todos los que empatan', () => {
    const best = bestIds([car(1, { price: '70000000.00' }), car(2, { price: '70000000.00' }), car(3, { price: '90000000.00' })])
    expect([...best.price].sort()).toEqual([1, 2])
  })

  it('si todos empatan no se destaca ninguno', () => {
    const best = bestIds([car(1), car(2), car(3)])
    expect(best.price.size + best.year.size + best.mileage.size).toBe(0)
  })

  it('los vendidos no cuentan, aunque tengan el mejor valor', () => {
    const best = bestIds([
      car(1, { price: '100000000.00' }),
      car(2, { price: '90000000.00' }),
      car(3, { price: '10000000.00', status: 'vendido', year: 2030, mileage: 0 }),
    ])
    expect([...best.price]).toEqual([2])
    expect([...best.year]).toEqual([])
    expect(best.price.has(3) || best.year.has(3) || best.mileage.has(3)).toBe(false)
  })

  it('con menos de dos vehículos disponibles no hay nada que destacar', () => {
    expect(bestIds([car(1)]).price.size).toBe(0)
    expect(bestIds([car(1), car(2, { status: 'vendido' })]).price.size).toBe(0)
    expect(bestIds([]).price.size).toBe(0)
  })

  it('compara el dinero en centavos exactos, sin decimales flotantes', () => {
    expect(moneyToCents('168900000.00')).toBe(16890000000n)
    expect(moneyToCents('0.1')).toBe(10n)
    expect(moneyToCents('1234')).toBe(123400n)
    const best = bestIds([car(1, { price: '9999999999.99' }), car(2, { price: '9999999999.98' })])
    expect([...best.price]).toEqual([2])
  })
})
