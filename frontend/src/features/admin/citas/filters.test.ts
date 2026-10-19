import {
  DEFAULT_CITAS_FILTERS,
  isDefaultCitasFilters,
  parseCitasFilters,
  toCitasApiParams,
  toCitasSearchParams,
  validDay,
} from './filters'

const parse = (query: string) => parseCitasFilters(new URLSearchParams(query))

describe('filtros de citas', () => {
  it('por defecto muestra las pendientes', () => {
    expect(parse('')).toEqual({ status: 'pendiente', from: '', to: '', page: 1 })
    expect(DEFAULT_CITAS_FILTERS.status).toBe('pendiente')
    expect(isDefaultCitasFilters(parse(''))).toBe(true)
  })

  it('lee estado, fechas y página válidos', () => {
    expect(parse('status=confirmada&from=2026-11-01&to=2026-11-30&page=3')).toEqual({
      status: 'confirmada', from: '2026-11-01', to: '2026-11-30', page: 3,
    })
    expect(parse('status=all').status).toBe('all')
    expect(parse('status=cancelada').status).toBe('cancelada')
  })

  it.each([
    ['estado desconocido', 'status=bogus', { status: 'pendiente' }],
    ['estado en mayúsculas', 'status=PENDIENTE', { status: 'pendiente' }],
    ['fecha imposible', 'from=2026-02-30', { from: '' }],
    ['fecha con hora', 'from=2026-11-01T10:00:00', { from: '' }],
    ['mes 13', 'to=2026-13-01', { to: '' }],
    ['año fuera de rango', 'from=1999-12-31&to=2101-01-01', { from: '', to: '' }],
    ['texto', 'from=ayer&to=<script>', { from: '', to: '' }],
    ['inyección', `from=${encodeURIComponent("2026-11-01' OR '1'='1")}`, { from: '' }],
    ['página negativa', 'page=-3', { page: 1 }],
    ['página decimal', 'page=1.5', { page: 1 }],
    ['página enorme', 'page=99999999999999999999', { page: 1 }],
    ['página sobre el tope', 'page=100001', { page: 1 }],
    ['página en notación científica', 'page=1e3', { page: 1 }],
  ])('descarta %s', (_label, query, expected) => {
    expect(parse(query)).toMatchObject(expected)
  })

  it('endereza un rango al revés', () => {
    expect(parse('from=2026-11-30&to=2026-11-01')).toMatchObject({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('29 de febrero solo en año bisiesto', () => {
    expect(validDay('2028-02-29')).toBe('2028-02-29')
    expect(validDay('2027-02-29')).toBe('')
  })

  it('la URL solo guarda lo que se aparta del valor por defecto', () => {
    expect(toCitasSearchParams(DEFAULT_CITAS_FILTERS).toString()).toBe('')
    expect(toCitasSearchParams({ status: 'all', from: '2026-11-01', to: '', page: 2 }).toString()).toBe('status=all&from=2026-11-01&page=2')
  })

  it('la URL nunca lleva datos de clientes: solo estado, fechas y página', () => {
    const keys = [...toCitasSearchParams({ status: 'cancelada', from: '2026-01-01', to: '2026-12-31', page: 4 }).keys()]
    expect(keys.sort()).toEqual(['from', 'page', 'status', 'to'])
  })

  it('arma los parámetros de la API con instantes de Bogotá (-05:00) de principio a fin de día', () => {
    expect(toCitasApiParams({ status: 'pendiente', from: '2026-11-05', to: '2026-11-07', page: 2 })).toEqual({
      page: 2, limit: 12, status: 'pendiente', from: '2026-11-05T00:00:00-05:00', to: '2026-11-07T23:59:59-05:00',
    })
  })

  it('"Todas" no envía estado, y sin fechas tampoco las envía', () => {
    expect(toCitasApiParams({ status: 'all', from: '', to: '', page: 1 })).toEqual({ page: 1, limit: 12 })
  })
})
