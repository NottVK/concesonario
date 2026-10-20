import { queryOptions } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

type Schemas = components['schemas']
export type Bot = Schemas['BotViewDto']
export type BotWithKey = Schemas['BotWithKeyDto']
export type CreateBotInput = Schemas['CreateBotDto']
export type UpdateBotInput = Schemas['UpdateBotDto']
export type ConnectionTest = Schemas['ConnectionTestDto']
export type Exchange = Schemas['ExchangeViewDto']
export type ExchangesPage = Schemas['ExchangesPageDto']

export const EXCHANGES_PAGE_SIZE = 15

/**
 * Nada de esto se persiste: la caché vive solo en memoria y se descarta casi de inmediato. Las keys en claro NUNCA pasan
 * por la caché de consultas (solo las devuelve una mutación y se muestran una vez).
 */
const MEMORY_ONLY = { gcTime: 30_000 } as const

export const botsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'bots', 'list'],
    queryFn: async () => (await api.get<Bot[]>('/admin/bots')).data,
    ...MEMORY_ONLY,
  })

export interface ExchangesFilters {
  page: number
  botId?: number
  channel?: 'a2a' | 'mcp'
  direction?: 'entrante' | 'saliente'
  status?: string
}

export const exchangesQuery = (filters: ExchangesFilters) =>
  queryOptions({
    queryKey: ['admin', 'bots', 'exchanges', filters],
    queryFn: async () => (await api.get<ExchangesPage>('/admin/intercambios', { params: { limit: EXCHANGES_PAGE_SIZE, ...filters } })).data,
    ...MEMORY_ONLY,
  })

export async function createBot(body: CreateBotInput): Promise<BotWithKey> {
  return (await api.post<BotWithKey>('/admin/bots', body)).data
}

export async function updateBot(id: number, body: UpdateBotInput): Promise<Bot> {
  return (await api.patch<Bot>(`/admin/bots/${id}`, body)).data
}

export async function rotateBotKey(id: number): Promise<BotWithKey> {
  return (await api.post<BotWithKey>(`/admin/bots/${id}/rotar-clave`)).data
}

export async function testBotConnection(id: number): Promise<ConnectionTest> {
  return (await api.post<ConnectionTest>(`/admin/bots/${id}/probar-conexion`)).data
}
