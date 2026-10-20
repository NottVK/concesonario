import { isAxiosError } from 'axios'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { clearChatToken, getChatToken, setChatToken } from './chatSession'

export type ChatReply = components['schemas']['ChatReplyDto']
export type ChatStatus = components['schemas']['ChatStatusDto']
export type VehicleCardData = components['schemas']['VehicleCardDto']
export type ProposalData = components['schemas']['ProposalViewDto']
export type ConfirmedAppointment = components['schemas']['ConfirmedAppointmentDto']
export type ConfirmInput = components['schemas']['ConfirmAppointmentDto']

export const MAX_MESSAGE = 500
/** El modelo local puede tardar; el servidor corta a los 90 s, aquí se espera un poco más. */
const CHAT_TIMEOUT_MS = 100_000

export type ChatFailureKind = 'unavailable' | 'slow' | 'rate-limit' | 'invalid' | 'network' | 'unknown'

export interface ChatFailure {
  kind: ChatFailureKind
  message: string
  /** Segundos que indicó el servidor (429 y 503 con cola llena). */
  retryAfter?: number
}

const sessionHeaders = (): Record<string, string> => {
  const token = getChatToken()
  return token ? { 'X-Chat-Session': token } : {}
}

/** Un turno del chat. Si la respuesta trae un token de sesión nuevo, lo guarda. */
export async function sendChatMessage(message: string, vehicleId: number | null): Promise<ChatReply> {
  const { data } = await api.post<ChatReply>(
    '/chat',
    { message, ...(vehicleId ? { vehicleId } : {}) },
    { headers: sessionHeaders(), timeout: CHAT_TIMEOUT_MS, skipReauth: true },
  )
  if (data.sessionToken) setChatToken(data.sessionToken)
  return data
}

export async function fetchChatStatus(): Promise<ChatStatus> {
  return (await api.get<ChatStatus>('/chat/estado', { skipReauth: true })).data
}

/** Derecho a borrar: el servidor elimina la sesión y todo lo suyo; el navegador olvida el token. */
export async function deleteChatSession(): Promise<void> {
  const token = getChatToken()
  if (token) await api.delete('/chat/sesion', { headers: sessionHeaders(), skipReauth: true })
  clearChatToken()
}

export async function confirmChatAppointment(input: ConfirmInput): Promise<ConfirmedAppointment> {
  return (await api.post<ConfirmedAppointment>('/chat/citas/confirmar', input, { headers: sessionHeaders(), skipReauth: true })).data
}

const serverText = (error: unknown): string => {
  if (!isAxiosError<{ message?: string | string[] }>(error)) return ''
  const message = error.response?.data?.message
  return Array.isArray(message) ? (message[0] ?? '') : (message ?? '')
}

/** Traduce los errores de POST /chat a un mensaje en español y a qué hacer (reintentar, esperar). */
export function classifyChatError(error: unknown): ChatFailure {
  if (!isAxiosError(error)) return { kind: 'unknown', message: 'Ocurrió un error inesperado. Intenta de nuevo.' }
  const status = error.response?.status
  const retryAfter = Number(error.response?.headers?.['retry-after'])
  const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  if (!error.response || error.code === 'ECONNABORTED') {
    return { kind: 'network', message: 'No pudimos comunicarnos con el asistente. Revisa tu conexión e intenta de nuevo.' }
  }
  if (status === 429) {
    return { kind: 'rate-limit', message: serverText(error) || 'Enviaste muchos mensajes seguidos. Espera un momento.', retryAfter: wait ?? 30 }
  }
  if (status === 503) {
    return { kind: 'unavailable', message: serverText(error) || 'El asistente no está disponible ahora. Puedes usar el catálogo.', retryAfter: wait }
  }
  if (status === 504) return { kind: 'slow', message: 'El asistente tardó demasiado en responder. Intenta de nuevo.' }
  if (status === 400) return { kind: 'invalid', message: serverText(error) || 'No pudimos procesar ese mensaje.' }
  return { kind: 'unknown', message: 'El asistente tuvo un problema. Intenta de nuevo en un momento.' }
}

/** Errores de la confirmación de cita. */
export function classifyConfirmError(error: unknown): string {
  if (!isAxiosError(error)) return 'Ocurrió un error inesperado. Intenta de nuevo.'
  if (!error.response) {
    return 'No recibimos respuesta del sistema de citas y la cita pudo quedar registrada. Consulta con un asesor antes de volver a intentarlo.'
  }
  const status = error.response.status
  if (status === 410) return 'Esa propuesta ya venció o se usó. Pídele al asistente una nueva.'
  if (status === 429) return 'Hiciste varios intentos seguidos. Espera un minuto e inténtalo de nuevo.'
  if (status === 409) return 'Ese horario ya no está disponible. Pídele al asistente otra hora.'
  if (status === 400) return serverText(error) || 'Revisa tus datos e inténtalo de nuevo.'
  if (status === 502) return serverText(error) || 'No recibimos respuesta del sistema de citas; la cita pudo quedar registrada.'
  return 'No pudimos registrar la cita. Intenta de nuevo en un momento.'
}
