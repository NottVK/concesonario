import { queryOptions } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from './client'
import type { Brand, FinancingSimulation, Paginated, SimulateFinancingInput, VehicleWithBrand } from './types'

export const brandsQuery = () =>
  queryOptions({
    queryKey: ['brands'],
    queryFn: async () => (await api.get<Brand[]>('/marcas')).data,
    staleTime: 5 * 60_000,
  })

export const vehicleQuery = (id: number) =>
  queryOptions({
    queryKey: ['vehicles', id],
    queryFn: async () => (await api.get<VehicleWithBrand>(`/vehiculos/${id}`)).data,
    // Un 404 no mejora al reintentar.
    retry: (failures, error) => !(isAxiosError(error) && error.response?.status === 404) && failures < 1,
  })

export const vehiclesQuery = (params: Record<string, string | number | undefined>) =>
  queryOptions({
    queryKey: ['vehicles', params],
    queryFn: async () => (await api.get<Paginated<VehicleWithBrand>>('/vehiculos', { params })).data,
  })

export async function simulateFinancing(input: SimulateFinancingInput): Promise<FinancingSimulation> {
  return (await api.post<FinancingSimulation>('/financiacion/simular', input)).data
}
