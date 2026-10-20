import {
  cleanModelSearch,
  isDefaultInventarioFilters,
  parseInventarioFilters,
  toInventarioApiParams,
  toInventarioSearchParams,
} from './filters'

const parse = (query: string) => parseInventarioFilters(new URLSearchParams(query))

describe('filtros del inventario', () => {
  it('sin parámetros: todos, todas las marcas, página 1', () => {
    expect(parse('')).toEqual({ status: 'all', brandId: 0, page: 1 })
  })

  it('lee estado, marca y página válidos', () => {
    expect(parse('status=vendido&brandId=3&page=2')).toEqual({ status: 'vendido', brandId: 3, page: 2 })
  })

  it.each([
    'status=hackeado', 'status=NUEVO', 'brandId=0', 'brandId=-1', 'brandId=1e3', 'brandId=99999999999', 'brandId=abc',
    'page=0', 'page=-3', 'page=1e3', 'page=99999999', 'page=2.5', 'status=nuevo&status=usado',
  ])('descarta la basura de la URL: %s', (query) => {
    const filters = parse(query)
    expect(['all', 'nuevo', 'usado', 'vendido']).toContain(filters.status)
    expect(filters.brandId).toBeGreaterThanOrEqual(0)
    expect(filters.brandId).toBeLessThanOrEqual(2_147_483_647)
    expect(filters.page).toBeGreaterThanOrEqual(1)
    expect(filters.page).toBeLessThanOrEqual(100_000)
  })

  it('solo escribe en la URL lo que se aparta del valor por defecto', () => {
    expect(toInventarioSearchParams({ status: 'all', brandId: 0, page: 1 }).toString()).toBe('')
    expect(toInventarioSearchParams({ status: 'usado', brandId: 4, page: 3 }).toString()).toBe('status=usado&brandId=4&page=3')
  })

  it('arma los parámetros de la API (más recientes primero)', () => {
    expect(toInventarioApiParams({ status: 'all', brandId: 0, page: 1 })).toEqual({ page: 1, limit: 10, sort: 'newest' })
    expect(toInventarioApiParams({ status: 'nuevo', brandId: 2, page: 2 }, 'Mazda 3')).toEqual({
      page: 2, limit: 10, sort: 'newest', status: 'nuevo', brandId: 2, model: 'Mazda 3',
    })
  })

  it('limpia el texto de búsqueda: sin controles, recortado y con tope', () => {
    expect(cleanModelSearch('  Cx\u0000-5\n ')).toBe('Cx-5')
    expect(cleanModelSearch('a'.repeat(200))).toHaveLength(80)
  })

  it('detecta cuándo hay filtros activos', () => {
    expect(isDefaultInventarioFilters({ status: 'all', brandId: 0, page: 5 })).toBe(true)
    expect(isDefaultInventarioFilters({ status: 'nuevo', brandId: 0, page: 1 })).toBe(false)
  })
})
