import { parsePage } from '@/features/catalog/filters'

export const CITAS_PAGE_SIZE = 12

export type StatusFilter = 'pendiente' | 'confirmada' | 'cancelada' | 'all'
const STATUSES: readonly StatusFilter[] = ['pendiente', 'confirmada', 'cancelada', 'all']

/**
 * Filtros de la lista de citas. Viven en la URL, y por eso solo llevan datos que no son personales:
 * estado, fechas y página. Nunca nombres, correos ni teléfonos de clientes.
 */
export interface CitasFilters {
  status: StatusFilter
  /** Día "YYYY-MM-DD" (hora de Bogotá), inclusive. */
  from: string
  to: string
  page: number
}

/** Por defecto se ven las pendientes: llegan sin confirmar y alguien debe atenderlas. */
export const DEFAULT_CITAS_FILTERS: CitasFilters = { status: 'pendiente', from: '', to: '', page: 1 }

/** Un día real del calendario, entre 2000 y 2100 (no "2026-02-30" ni "9999-99-99"). */
export function validDay(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (year < 2000 || year > 2100) return ''
  const check = new Date(Date.UTC(year, month - 1, day))
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  return real ? value : ''
}

/** Lee la URL como entrada no confiable: lo inválido vuelve al valor por defecto. */
export function parseCitasFilters(params: URLSearchParams): CitasFilters {
  const rawStatus = params.get('status')
  const status = STATUSES.find((candidate) => candidate === rawStatus) ?? DEFAULT_CITAS_FILTERS.status
  let from = validDay(params.get('from'))
  let to = validDay(params.get('to'))
  if (from && to && from > to) [from, to] = [to, from] // un rango al revés se endereza
  return { status, from, to, page: parsePage(params.get('page')) }
}

/** Solo escribe en la URL lo que se aparta del valor por defecto. */
export function toCitasSearchParams(filters: CitasFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== DEFAULT_CITAS_FILTERS.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

/**
 * Parámetros de `GET /citas`: los días se envían como instantes de Bogotá (-05:00), de principio a fin del día.
 * `customer` (nombre o correo) NO forma parte de los filtros de la URL: es un dato personal y vive solo en el estado de la página.
 */
export function toCitasApiParams(filters: CitasFilters, customer = ''): Record<string, string | number> {
  const params: Record<string, string | number> = { page: filters.page, limit: CITAS_PAGE_SIZE }
  if (filters.status !== 'all') params.status = filters.status
  if (filters.from) params.from = `${filters.from}T00:00:00-05:00`
  if (filters.to) params.to = `${filters.to}T23:59:59-05:00`
  if (customer) params.customer = customer
  return params
}

export const isDefaultCitasFilters = (filters: CitasFilters): boolean =>
  filters.status === DEFAULT_CITAS_FILTERS.status && !filters.from && !filters.to
