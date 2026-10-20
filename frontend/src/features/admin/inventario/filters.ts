import { parseDbId } from '@/lib/ids'
import { parsePage } from '@/features/catalog/filters'

export const INVENTARIO_PAGE_SIZE = 10
export const MODEL_SEARCH_MAX = 80

export type StatusFilter = 'all' | 'nuevo' | 'usado' | 'vendido'
const STATUSES: readonly StatusFilter[] = ['all', 'nuevo', 'usado', 'vendido']

/** Filtros del inventario: estado, marca y página (viven en la URL; no hay datos personales). */
export interface InventarioFilters {
  status: StatusFilter
  /** 0 = todas las marcas. */
  brandId: number
  page: number
}

export const DEFAULT_INVENTARIO_FILTERS: InventarioFilters = { status: 'all', brandId: 0, page: 1 }

/** Lee la URL como entrada no confiable: lo inválido vuelve al valor por defecto. */
export function parseInventarioFilters(params: URLSearchParams): InventarioFilters {
  const rawStatus = params.get('status')
  const status = STATUSES.find((candidate) => candidate === rawStatus) ?? 'all'
  return { status, brandId: parseDbId(params.get('brandId')) ?? 0, page: parsePage(params.get('page')) }
}

export function toInventarioSearchParams(filters: InventarioFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.brandId > 0) params.set('brandId', String(filters.brandId))
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

/** Texto del buscador de modelo: sin caracteres de control y con tope de largo; '' = sin filtro. */
// eslint-disable-next-line no-control-regex
export const cleanModelSearch = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MODEL_SEARCH_MAX)

export function toInventarioApiParams(filters: InventarioFilters, model = ''): Record<string, string | number> {
  const params: Record<string, string | number> = { page: filters.page, limit: INVENTARIO_PAGE_SIZE, sort: 'newest' }
  if (filters.status !== 'all') params.status = filters.status
  if (filters.brandId > 0) params.brandId = filters.brandId
  if (model) params.model = model
  return params
}

export const isDefaultInventarioFilters = (filters: InventarioFilters): boolean =>
  filters.status === 'all' && filters.brandId === 0
