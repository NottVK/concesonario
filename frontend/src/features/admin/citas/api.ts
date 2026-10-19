import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Appointment, Customer, Paginated, VehicleWithBrand } from '@/api/types'

/** Cita con su cliente y vehículo, tal como la devuelve el backend a la lista y al detalle. */
export type AppointmentRow = Omit<Appointment, 'customer' | 'vehicle'> & { customer: Customer; vehicle: VehicleWithBrand }
export type AppointmentStatus = Appointment['status']

/**
 * Datos de clientes: solo en memoria (la caché de react-query), durante un minuto como máximo tras dejar de usarse,
 * y se vacían por completo al cerrar sesión. Nunca se persisten ni se ponen en la URL.
 */
const MEMORY_ONLY = { gcTime: 60_000 } as const

export const citasQuery = (params: Record<string, string | number>) =>
  queryOptions({
    queryKey: ['admin', 'citas', 'list', params],
    queryFn: async () => (await api.get<Paginated<AppointmentRow>>('/citas', { params })).data,
    ...MEMORY_ONLY,
  })

/** Estado actual de una cita, siempre fresco (se usa para explicar un 409). */
export const citaQuery = (id: number) =>
  queryOptions({
    queryKey: ['admin', 'citas', 'detail', id],
    queryFn: async () => (await api.get<AppointmentRow>(`/citas/${id}`)).data,
    staleTime: 0,
    ...MEMORY_ONLY,
  })

export async function updateCitaStatus(id: number, status: 'confirmada' | 'cancelada'): Promise<AppointmentRow> {
  return (await api.patch<AppointmentRow>(`/citas/${id}/estado`, { status })).data
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}
