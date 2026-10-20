import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Paginated, UpdateVehicleInput, VehicleInput, VehicleWithBrand } from '@/api/types'

/** Todo el inventario cuelga de esta clave: invalidarla refresca listas y fichas del panel. */
export const INVENTARIO_KEY = ['admin', 'inventario'] as const

/** Inventario completo (vendidos incluidos). Siempre al día: lo que ve el admin no debe estar viejo. */
export const inventarioQuery = (params: Record<string, string | number>) =>
  queryOptions({
    queryKey: [...INVENTARIO_KEY, 'list', params],
    queryFn: async () => (await api.get<Paginated<VehicleWithBrand>>('/admin/vehiculos', { params })).data,
    staleTime: 0,
  })

/** Vehículo actual, siempre fresco (se usa para explicar un 409). */
export const vehicleFreshQuery = (id: number) =>
  queryOptions({
    queryKey: [...INVENTARIO_KEY, 'detail', id],
    queryFn: async () => (await api.get<VehicleWithBrand>(`/vehiculos/${id}`)).data,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

export async function createVehicle(body: VehicleInput): Promise<VehicleWithBrand> {
  return (await api.post<VehicleWithBrand>('/vehiculos', body)).data
}

export async function updateVehicle(id: number, body: UpdateVehicleInput): Promise<VehicleWithBrand> {
  return (await api.put<VehicleWithBrand>(`/vehiculos/${id}`, body)).data
}

export async function deleteVehicle(id: number): Promise<void> {
  await api.delete(`/vehiculos/${id}`)
}
