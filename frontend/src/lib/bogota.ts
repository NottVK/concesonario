/**
 * Fechas y horas del concesionario, siempre en hora de Bogotá y sin depender de la zona del
 * navegador. El día se maneja como texto "YYYY-MM-DD" y la hora como número (8 = 8:00).
 * Las reglas replican las del backend (`appointment-rules.ts`); la API sigue siendo la que decide.
 */
export const BOGOTA_TZ = 'America/Bogota'
/** Colombia no usa horario de verano: el desfase es fijo todo el año. */
export const BOGOTA_OFFSET = '-05:00'
export const VISIT_MINUTES = 60
/** La visita dura 60 min y debe terminar a las 18:00, así que la última empieza a las 17:00. */
export const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const
/** Semanas que muestra el calendario (límite de la interfaz, no del backend). */
export const BOOKING_WEEKS = 5

const SUNDAY = 0

const clockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BOGOTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const pad = (value: number): string => String(value).padStart(2, '0')

/** Día ("YYYY-MM-DD") y minuto del día actuales en Bogotá. */
export function bogotaNow(now: Date = new Date()): { date: string; minutes: number } {
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

/** Suma días a un "YYYY-MM-DD" usando UTC, para que la zona del navegador no intervenga. */
export function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`)
  moment.setUTCDate(moment.getUTCDate() + days)
  return moment.toISOString().slice(0, 10)
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export const slotLabelTime = (hour: number): string => `${pad(hour)}:00`

/** Instante ISO 8601 con desfase explícito, p. ej. 2026-11-03T10:00:00-05:00. */
export function buildScheduledAt(date: string, hour: number): string {
  return `${date}T${pad(hour)}:00:00${BOGOTA_OFFSET}`
}

/** La API exige que la cita empiece estrictamente después de ahora. */
export function isSlotPast(date: string, hour: number, now: Date = new Date()): boolean {
  const today = bogotaNow(now)
  if (date < today.date) return true
  return date === today.date && hour * 60 <= today.minutes
}

export type DayBlock = 'past' | 'sunday' | null

/** Motivo por el que un día no se puede elegir, o null si tiene al menos una hora libre. */
export function dayBlock(date: string, now: Date = new Date()): DayBlock {
  if (weekdayOf(date) === SUNDAY) return 'sunday'
  return SLOT_HOURS.every((hour) => isSlotPast(date, hour, now)) ? 'past' : null
}

export interface CalendarDay {
  date: string
  day: number
  /** Día 1 de un mes (para mostrar el nombre del mes). */
  firstOfMonth: boolean
  block: DayBlock
}

/** Semanas de lunes a domingo desde el lunes de la semana actual, con los días ya marcados. */
export function buildCalendar(now: Date = new Date(), weeks: number = BOOKING_WEEKS): CalendarDay[][] {
  const today = bogotaNow(now).date
  const mondayOffset = (weekdayOf(today) + 6) % 7
  const start = addDays(today, -mondayOffset)
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, week * 7 + dayIndex)
      const day = Number(date.slice(8))
      return { date, day, firstOfMonth: day === 1, block: dayBlock(date, now) }
    }),
  )
}

const longDate = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const monthName = new Intl.DateTimeFormat('es-CO', { timeZone: BOGOTA_TZ, month: 'long' })

/** "sábado, 7 de noviembre de 2026" a partir de cualquier instante, siempre en hora de Bogotá. */
export const formatLongDate = (instant: string | Date): string => longDate.format(new Date(instant))
/** "10:00 a. m." en hora de Bogotá. */
export const formatTime = (instant: string | Date): string => shortTime.format(new Date(instant))
export const formatMonth = (date: string): string => monthName.format(new Date(`${date}T12:00:00-05:00`))
/** Etiqueta de un día "YYYY-MM-DD" para lectores de pantalla y resúmenes. */
export const formatDay = (date: string): string => longDate.format(new Date(`${date}T12:00:00-05:00`))
