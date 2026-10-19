import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import type { Brand, Paginated, VehicleWithBrand } from './types'

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
  })

export const vehiclesQuery = (params: Record<string, string | number | undefined>) =>
  queryOptions({
    queryKey: ['vehicles', params],
    queryFn: async () => (await api.get<Paginated<VehicleWithBrand>>('/vehiculos', { params })).data,
  })
