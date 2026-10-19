import type { Vehicle } from '@/api/types'
import { parseDbId } from '@/lib/ids'

export const PAGE_SIZE = 12
/** Igual al tope de la API: más allá, la API responde 400. */
export const MAX_PAGE = 100_000

/** Página escrita en decimal, de 1 a MAX_PAGE. `Number("1e3")` daría 1000, por eso no se usa `Number` a ciegas. */
export function parsePage(raw: string | null): number {
  if (!raw || !/^[1-9]\d{0,5}$/.test(raw)) return 1
  const page = Number(raw)
  return page <= MAX_PAGE ? page : 1
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'year_desc', label: 'Año: más nuevos primero' },
  { value: 'year_asc', label: 'Año: más antiguos primero' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']

/** Filtros del catálogo; viven en la URL para poder compartir y recargar la búsqueda. */
export interface CatalogFilters {
  brandId: string
  priceMin: string
  priceMax: string
  yearMin: string
  yearMax: string
  fuel: '' | Vehicle['fuel']
  transmission: '' | Vehicle['transmission']
  status: '' | 'nuevo' | 'usado'
  sort: SortValue
  page: number
}

export const EMPTY_FILTERS: CatalogFilters = {
  brandId: '',
  priceMin: '',
  priceMax: '',
  yearMin: '',
  yearMax: '',
  fuel: '',
  transmission: '',
  status: '',
  sort: 'newest',
  page: 1,
}

const FUELS = ['gasolina', 'diesel', 'hibrido', 'electrico']
const TRANSMISSIONS = ['manual', 'automatica']
const STATUSES = ['nuevo', 'usado']

/** Entero positivo sin ceros a la izquierda; 10 dígitos es el máximo que acepta la API en montos. */
const digits = (value: string | null, maxLength = 10): string =>
  value && value.length <= maxLength && /^[1-9]\d*$/.test(value) ? value : ''
const oneOf = <T extends string>(value: string | null, allowed: readonly string[]): '' | T =>
  value && allowed.includes(value) ? (value as T) : ''

/** Lee la URL y descarta cualquier valor inválido (la URL es entrada del usuario). */
export function parseFilters(params: URLSearchParams): CatalogFilters {
  const sort = SORT_OPTIONS.find((option) => option.value === params.get('sort'))?.value ?? 'newest'
  return {
    brandId: String(parseDbId(params.get('brandId')) ?? ''),
    priceMin: digits(params.get('priceMin')),
    priceMax: digits(params.get('priceMax')),
    yearMin: digits(params.get('yearMin'), 4),
    yearMax: digits(params.get('yearMax'), 4),
    fuel: oneOf<Vehicle['fuel']>(params.get('fuel'), FUELS),
    transmission: oneOf<Vehicle['transmission']>(params.get('transmission'), TRANSMISSIONS),
    status: oneOf<'nuevo' | 'usado'>(params.get('status'), STATUSES),
    sort,
    page: parsePage(params.get('page')),
  }
}

/** Solo escribe en la URL lo que se aparta del valor por defecto. */
export function toSearchParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    const empty = EMPTY_FILTERS[key as keyof CatalogFilters]
    if (value !== empty) params.set(key, String(value))
  }
  return params
}

/** Parámetros para `GET /vehiculos`; omite los vacíos. */
export function toApiParams(filters: CatalogFilters): Record<string, string | number> {
  const params: Record<string, string | number> = { page: filters.page, limit: PAGE_SIZE, sort: filters.sort }
  const optional = ['brandId', 'priceMin', 'priceMax', 'yearMin', 'yearMax', 'fuel', 'transmission', 'status'] as const
  for (const key of optional) if (filters[key]) params[key] = filters[key]
  return params
}

/** Cantidad de filtros activos (sin contar orden ni página). */
export function activeFilterCount(filters: CatalogFilters): number {
  const keys = ['brandId', 'priceMin', 'priceMax', 'yearMin', 'yearMax', 'fuel', 'transmission', 'status'] as const
  return keys.filter((key) => filters[key] !== '').length
}
