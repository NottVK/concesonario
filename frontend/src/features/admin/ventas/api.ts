import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { CreateSaleInput, Paginated, Sale, VehicleWithBrand } from '@/api/types'

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
