import { queryOptions } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/api/client'
import type { CreateSaleInput, Paginated, Sale, SaleDetail, SaleListItem, VehicleWithBrand } from '@/api/types'

export const PICKER_PAGE_SIZE = 6

/** Vehículos que se pueden vender: el catálogo público nunca incluye los vendidos. */
export const sellableVehiclesQuery = (model: string, page: number) =>
  queryOptions({
    queryKey: ['vehicles', 'sellable', model, page],
    queryFn: async () =>
      (
        await api.get<Paginated<VehicleWithBrand>>('/vehiculos', {
          params: { limit: PICKER_PAGE_SIZE, page, sort: 'newest', ...(model ? { model } : {}) },
        })
      ).data,
    // Siempre al día: un vehículo recién vendido por otra persona no debe seguir ofreciéndose.
    staleTime: 0,
  })

/** Citas abiertas (pendientes o confirmadas) de un vehículo: las que la venta va a cancelar. Solo cuenta, no trae datos. */
export const openAppointmentsQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['admin', 'citas', 'open-count', vehicleId],
    queryFn: async () => {
      const count = async (status: 'pendiente' | 'confirmada'): Promise<number> =>
        (await api.get<Paginated<unknown>>('/citas', { params: { vehicleId, status, limit: 1 } })).data.meta.total
      const [pending, confirmed] = await Promise.all([count('pendiente'), count('confirmada')])
      return pending + confirmed
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  return (await api.post<Sale>('/ventas', input)).data
}

export const HISTORIAL_PAGE_SIZE = 10

/** Nombres de clientes: solo en memoria (caché de react-query), un minuto tras dejar de usarse y vaciada al cerrar sesión. */
const MEMORY_ONLY = { gcTime: 60_000 } as const

/** Historial (más recientes primero). Siempre al día: una venta nueva debe verse al volver. */
export const historialQuery = (page: number) =>
  queryOptions({
    queryKey: ['admin', 'ventas', 'list', page],
    queryFn: async () =>
      (await api.get<Paginated<SaleListItem>>('/ventas', { params: { page, limit: HISTORIAL_PAGE_SIZE } })).data,
    staleTime: 0,
    ...MEMORY_ONLY,
  })

/** Detalle de una venta (lleva el correo del cliente). Un 404 no mejora al reintentar. */
export const saleDetailQuery = (id: number) =>
  queryOptions({
    queryKey: ['admin', 'ventas', 'detail', id],
    queryFn: async () => (await api.get<SaleDetail>(`/ventas/${id}`)).data,
    retry: (failures, error) => !(isAxiosError(error) && error.response?.status === 404) && failures < 1,
    ...MEMORY_ONLY,
  })
