import { queryOptions } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from './client'
import type {
  Availability,
  Brand,
  CreateAppointmentInput,
  FinancingSimulation,
  Paginated,
  PublicAppointment,
  SimulateFinancingInput,
  VehicleWithBrand,
} from './types'

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

export async function createAppointment(input: CreateAppointmentInput): Promise<PublicAppointment> {
  return (await api.post<PublicAppointment>('/citas', input)).data
}

/** Franjas ya reservadas de un vehículo en un rango (ISO 8601 con desfase). */
export const availabilityQuery = (vehicleId: number, from: string, to: string) =>
  queryOptions({
    queryKey: ['availability', vehicleId, from, to],
    queryFn: async () => (await api.get<Availability>(`/vehiculos/${vehicleId}/disponibilidad`, { params: { from, to } })).data,
    // Siempre fresca al abrir el formulario, y sin reintentos: si falla, el formulario sigue siendo usable.
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  })
