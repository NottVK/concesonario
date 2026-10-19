import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Summary = components['schemas']['SummaryDto']
export type SalesByMonth = components['schemas']['SalesByMonthDto']
export type StockByBrand = components['schemas']['StockByBrandDto']

export const SALES_MONTHS = 12

/** Las tres consultas son solo para admin: se montan únicamente dentro de la ruta protegida por rol. */
const common = { staleTime: 60_000, retry: false } as const

export const summaryQuery = () =>
  queryOptions({
    queryKey: ['admin', 'metricas', 'resumen'],
    queryFn: async () => (await api.get<Summary>('/admin/metricas/resumen')).data,
    ...common,
  })

export const salesByMonthQuery = () =>
  queryOptions({
    queryKey: ['admin', 'metricas', 'ventas-por-mes', SALES_MONTHS],
    queryFn: async () => (await api.get<SalesByMonth[]>('/admin/metricas/ventas-por-mes', { params: { months: SALES_MONTHS } })).data,
    ...common,
  })

export const stockByBrandQuery = () =>
  queryOptions({
    queryKey: ['admin', 'metricas', 'stock-por-marca'],
    queryFn: async () => (await api.get<StockByBrand[]>('/admin/metricas/stock-por-marca')).data,
    ...common,
  })
