import type { Bot, CreateBotInput, UpdateBotInput } from './api'

export const NAME_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,79}$/u
export const KEY_REGEX = /^[\x21-\x7E]{8,200}$/
export const URL_MAX = 255
export const LIMITS = {
  outboundPerMinute: [1, 60],
  perMinute: [1, 600],
  perDay: [1, 100_000],
} as const

export type OutboundAuth = 'bearer' | 'x_api_key'

/** Todo el formulario como texto (lo que hay en los campos); se convierte a números al enviar. */
export interface BotForm {
  name: string
  url: string
  outboundApiKey: string
  /** Solo al editar: quitar la key saliente guardada. */
  removeKey: boolean
  outboundAuth: OutboundAuth
  outboundLimitPerMinute: string
  limitPerMinute: string
  limitPerDay: string
}

export type BotFormErrors = Partial<Record<keyof BotForm, string>>

export const EMPTY_FORM: BotForm = {
  name: '',
  url: '',
  outboundApiKey: '',
  removeKey: false,
  outboundAuth: 'bearer',
  outboundLimitPerMinute: '10',
  limitPerMinute: '30',
  limitPerDay: '2000',
}

export const toForm = (bot: Bot): BotForm => ({
  name: bot.name,
  url: bot.url ?? '',
  outboundApiKey: '',
  removeKey: false,
  outboundAuth: bot.outboundAuth === 'x_api_key' ? 'x_api_key' : 'bearer',
  outboundLimitPerMinute: String(bot.outboundLimitPerMinute),
  limitPerMinute: String(bot.limitPerMinute),
  limitPerDay: String(bot.limitPerDay),
})

const integerIn = (text: string, [min, max]: readonly [number, number]): number | null => {
  if (!/^\d{1,6}$/.test(text.trim())) return null
  const value = Number(text)
  return value >= min && value <= max ? value : null
}

/** Origen (esquema, host y puerto) de una URL, o null si no es una URL. */
export function originOf(url: string): string | null {
  try {
    return new URL(url.trim()).origin
  } catch {
    return null
  }
}

/**
 * Validación del formulario. Es una ayuda para no ir y volver: la política de verdad (https, nombre público, sin red
 * interna) la aplica el servidor y su mensaje se muestra tal cual.
 */
export function validateBotForm(form: BotForm, existing: Bot | null): BotFormErrors {
  const errors: BotFormErrors = {}
  if (!NAME_REGEX.test(form.name.trim())) errors.name = 'De 2 a 80 caracteres: letras, números, espacio, punto o guion.'
  const url = form.url.trim()
  if (url) {
    if (url.length > URL_MAX) errors.url = `Máximo ${URL_MAX} caracteres.`
    else if (!/^https?:\/\/\S+$/i.test(url)) errors.url = 'Escribe la dirección completa, con https://.'
  }
  const key = form.outboundApiKey
  if (key && !KEY_REGEX.test(key)) errors.outboundApiKey = 'De 8 a 200 caracteres, sin espacios.'
  if (key && !url) errors.url = 'La key saliente se guarda atada a la dirección del bot: escribe también la dirección.'
  if (integerIn(form.outboundLimitPerMinute, LIMITS.outboundPerMinute) === null) errors.outboundLimitPerMinute = 'Un número de 1 a 60.'
  if (integerIn(form.limitPerMinute, LIMITS.perMinute) === null) errors.limitPerMinute = 'Un número de 1 a 600.'
  if (integerIn(form.limitPerDay, LIMITS.perDay) === null) errors.limitPerDay = 'Un número de 1 a 100.000.'
  // Dejar una key guardada sin dirección no tiene sentido: el servidor la borraría al quitar la URL.
  if (existing?.hasOutboundKey && !url && !form.removeKey && !key) errors.url = 'Sin dirección no se puede conservar la key saliente. Marca «Quitar la key guardada» o escribe la dirección.'
  return errors
}

/** ¿Este cambio de URL cambia el origen de un bot que tiene una key saliente? El servidor borrará la key si no se da una nueva. */
export function willDropKey(form: BotForm, existing: Bot): boolean {
  if (!existing.hasOutboundKey || form.outboundApiKey || form.removeKey) return false
  const before = existing.url ? originOf(existing.url) : null
  const after = form.url.trim() ? originOf(form.url) : null
  return before !== after
}

const num = (text: string): number => Number(text.trim())

export function buildCreateBody(form: BotForm): CreateBotInput {
  const url = form.url.trim()
  return {
    name: form.name.trim(),
    ...(url ? { url } : {}),
    ...(form.outboundApiKey ? { outboundApiKey: form.outboundApiKey } : {}),
    outboundAuth: form.outboundAuth,
    outboundLimitPerMinute: num(form.outboundLimitPerMinute),
    limitPerMinute: num(form.limitPerMinute),
    limitPerDay: num(form.limitPerDay),
  }
}

/** Solo lo que cambió: así un cambio de límite no toca la URL ni la key. */
export function buildUpdateBody(existing: Bot, form: BotForm): UpdateBotInput {
  const body: UpdateBotInput = {}
  const url = form.url.trim()
  if (url !== (existing.url ?? '')) body.url = url || null
  if (form.outboundApiKey) body.outboundApiKey = form.outboundApiKey
  else if (form.removeKey) body.outboundApiKey = null
  if (form.outboundAuth !== existing.outboundAuth) body.outboundAuth = form.outboundAuth
  if (num(form.outboundLimitPerMinute) !== existing.outboundLimitPerMinute) body.outboundLimitPerMinute = num(form.outboundLimitPerMinute)
  if (num(form.limitPerMinute) !== existing.limitPerMinute) body.limitPerMinute = num(form.limitPerMinute)
  if (num(form.limitPerDay) !== existing.limitPerDay) body.limitPerDay = num(form.limitPerDay)
  return body
}
