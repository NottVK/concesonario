import { EMPTY_FILTERS, activeFilterCount, parseFilters, toApiParams, toSearchParams } from './filters'
import { pageItems } from './Pagination'

describe('filtros del catálogo', () => {
  it('lee los valores válidos de la URL', () => {
    const filters = parseFilters(new URLSearchParams('brandId=3&fuel=diesel&priceMax=90000000&sort=price_asc&page=2'))
    expect(filters).toMatchObject({ brandId: '3', fuel: 'diesel', priceMax: '90000000', sort: 'price_asc', page: 2 })
  })

  it('descarta valores manipulados o inválidos', () => {
    const filters = parseFilters(
      new URLSearchParams("brandId=1 OR 1=1&fuel=agua&sort=drop&page=-4&priceMin=abc&yearMin=20e3"),
    )
    expect(filters).toEqual(EMPTY_FILTERS)
  })

  it('la URL solo guarda lo que se aparta del valor por defecto', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('')
    expect(toSearchParams({ ...EMPTY_FILTERS, brandId: '3', page: 2 }).toString()).toBe('brandId=3&page=2')
  })

  it('arma los parámetros de la API sin campos vacíos', () => {
    expect(toApiParams({ ...EMPTY_FILTERS, fuel: 'hibrido', yearMin: '2022' })).toEqual({
      page: 1, limit: 12, sort: 'newest', fuel: 'hibrido', yearMin: '2022',
    })
  })

  it('cuenta filtros activos sin contar orden ni página', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, sort: 'price_desc', page: 3 })).toBe(0)
    expect(activeFilterCount({ ...EMPTY_FILTERS, brandId: '1', status: 'usado' })).toBe(2)
  })
})

describe('pageItems', () => {
  it('muestra todas las páginas si son pocas', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
  })
  it('usa "gap" en los huecos', () => {
    expect(pageItems(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageItems(2, 10)).toEqual([1, 2, 3, 'gap', 10])
  })
})
