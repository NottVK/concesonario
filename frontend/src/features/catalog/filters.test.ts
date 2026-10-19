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

describe('límites de los filtros', () => {
  it('brandId fuera del rango de la API se descarta', () => {
    expect(parseFilters(new URLSearchParams('brandId=2147483647')).brandId).toBe('2147483647')
    expect(parseFilters(new URLSearchParams('brandId=2147483648')).brandId).toBe('')
    expect(parseFilters(new URLSearchParams('brandId=1e3')).brandId).toBe('')
  })

  it('descarta precios de más de 10 dígitos (la API respondería 400) y años de más de 4', () => {
    const filters = parseFilters(new URLSearchParams('priceMin=12345678901&priceMax=9999999999&yearMin=20244&yearMax=2024'))
    expect(filters).toMatchObject({ priceMin: '', priceMax: '9999999999', yearMin: '', yearMax: '2024' })
  })
  it('descarta ceros a la izquierda y el cero solo', () => {
    expect(parseFilters(new URLSearchParams('priceMin=0&yearMin=0099'))).toMatchObject({ priceMin: '', yearMin: '' })
  })
})

describe('página de la URL', () => {
  it.each(['1e3', '1E3', '0x10', '+5', ' 5', '5 ', '05', '5.0', '１２'])('descarta %j (solo vale un entero decimal)', (raw) => {
    expect(parseFilters(new URLSearchParams({ page: raw })).page).toBe(1)
  })

  it('acepta hasta el tope de la API y descarta lo que lo supere', () => {
    expect(parseFilters(new URLSearchParams('page=100000')).page).toBe(100000)
    expect(parseFilters(new URLSearchParams('page=100001')).page).toBe(1)
    expect(parseFilters(new URLSearchParams('page=99999999999999999999')).page).toBe(1)
  })
})

describe('pageItems', () => {
  it('con 7 páginas o menos las muestra todas, sin huecos', () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pageItems(1, 1)).toEqual([1])
  })
  it('con 8 o más vuelve a abreviar', () => {
    expect(pageItems(1, 8)).toEqual([1, 2, 'gap', 8])
  })
  it('usa "gap" en los huecos', () => {
    expect(pageItems(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageItems(2, 10)).toEqual([1, 2, 3, 'gap', 10])
  })
})
