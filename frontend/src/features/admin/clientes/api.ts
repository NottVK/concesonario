import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Customer, Paginated, UpdateCustomerInput } from '@/api/types'

export const CLIENTES_PAGE_SIZE = 12

/**
 * Datos personales: solo en memoria (la caché de react-query), un minuto como máximo tras dejar de usarse,
 * y se vacían por completo al cerrar sesión. Nunca se persisten ni se ponen en la URL.
 */
const MEMORY_ONLY = { gcTime: 60_000 } as const

export const clientesQuery = (params: Record<string, string | number>) =>
  queryOptions({
    queryKey: ['admin', 'clientes', 'list', params],
    queryFn: async () => (await api.get<Paginated<Customer>>('/clientes', { params })).data,
    ...MEMORY_ONLY,
  })

/** Cliente actual, siempre fresco (se usa para explicar un 409). */
export const clienteQuery = (id: number) =>
  queryOptions({
    queryKey: ['admin', 'clientes', 'detail', id],
    queryFn: async () => (await api.get<Customer>(`/clientes/${id}`)).data,
    staleTime: 0,
    ...MEMORY_ONLY,
  })

export async function updateCliente(id: number, body: UpdateCustomerInput): Promise<Customer> {
  return (await api.put<Customer>(`/clientes/${id}`, body)).data
}
