import { useMemo } from 'react'
import { SLOT_HOURS, buildCalendar, formatDay, formatMonth, isSlotBusy, isSlotPast, slotLabelTime } from '@/lib/bogota'
import type { BusyInterval, CalendarDay } from '@/lib/bogota'
import { cn } from '@/lib/utils'

const WEEKDAYS = [
  { short: 'L', full: 'lunes' },
  { short: 'M', full: 'martes' },
  { short: 'X', full: 'miércoles' },
  { short: 'J', full: 'jueves' },
  { short: 'V', full: 'viernes' },
  { short: 'S', full: 'sábado' },
  { short: 'D', full: 'domingo' },
]

const choice =
  'flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border border-border text-sm transition-colors duration-200 ' +
  'hover:border-muted peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ' +
  'peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:text-muted peer-disabled:opacity-40 peer-disabled:hover:border-transparent'

function dayLabel(day: CalendarDay): string {
  const base = formatDay(day.date)
  if (day.block === 'sunday') return `${base}, no atendemos los domingos`
  if (day.block === 'past') return `${base}, fecha pasada`
  if (day.block === 'full') return `${base}, sin horas libres`
  return base
}

interface DayPickerProps {
  value: string
  onChange: (date: string) => void
  now: Date
  /** Franjas ya reservadas del vehículo; un día sin horas libres queda deshabilitado. */
  busy: readonly BusyInterval[]
  invalid?: boolean
  describedBy?: string
}

/** Calendario de lunes a domingo. Usa radios nativos: una sola parada de Tab y flechas para moverse. */
export function DayPicker({ value, onChange, now, busy, invalid, describedBy }: DayPickerProps) {
  const weeks = useMemo(() => buildCalendar(now, undefined, busy), [now, busy])
  return (
    <fieldset aria-invalid={invalid || undefined} aria-describedby={describedBy}>
      <legend className="mb-2 text-sm font-medium">Día de la visita</legend>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday.full}>{weekday.short}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => (
          <label key={day.date} className="block">
            <input
              type="radio"
              name="visit-day"
              value={day.date}
              checked={value === day.date}
              disabled={day.block !== null}
              onChange={() => onChange(day.date)}
              aria-label={dayLabel(day)}
              className="peer sr-only"
            />
            <span className={cn(choice, 'py-1')} aria-hidden="true">
              <span className="font-medium">{day.day}</span>
              {day.firstOfMonth && <span className="text-[0.65rem] leading-none">{formatMonth(day.date).slice(0, 3)}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface TimePickerProps {
  date: string
  value: number | null
  onChange: (hour: number) => void
  now: Date
  busy: readonly BusyInterval[]
  invalid?: boolean
  describedBy?: string
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'a. m.' : 'p. m.'
  return `${hour > 12 ? hour - 12 : hour}:00 ${suffix}`
}

/** Horas de inicio posibles (8:00 a 17:00). Las de hoy que ya pasaron y las ya reservadas aparecen deshabilitadas. */
export function TimePicker({ date, value, onChange, now, busy, invalid, describedBy }: TimePickerProps) {
  const taken = (hour: number): boolean => !!date && isSlotBusy(date, hour, busy)
  const anyTaken = SLOT_HOURS.some((hour) => !isSlotPast(date, hour, now) && taken(hour))
  return (
    <fieldset aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={!date}>
      <legend className="mb-2 text-sm font-medium">Hora de inicio</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {SLOT_HOURS.map((hour) => (
          <label key={hour} className="block">
            <input
              type="radio"
              name="visit-hour"
              value={hour}
              checked={value === hour}
              disabled={!date || isSlotPast(date, hour, now) || taken(hour)}
              onChange={() => onChange(hour)}
              aria-label={`${hourLabel(hour)}, empieza a las ${slotLabelTime(hour)}${taken(hour) ? ', ya reservada' : ''}`}
              className="peer sr-only"
            />
            <span className={cn(choice, taken(hour) && 'line-through')} aria-hidden="true">
              {hourLabel(hour)}
            </span>
          </label>
        ))}
      </div>
      {!date && <p className="mt-2 text-xs text-muted">Elige primero un día.</p>}
      {anyTaken && <p className="mt-2 text-xs text-muted">Las horas tachadas ya están reservadas para este vehículo.</p>}
    </fieldset>
  )
}
