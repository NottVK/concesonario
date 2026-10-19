import {
  BOGOTA_OFFSET,
  SLOT_HOURS,
  addDays,
  bogotaNow,
  buildCalendar,
  buildScheduledAt,
  dayBlock,
  formatLongDate,
  formatTime,
  isSlotPast,
  weekdayOf,
} from './bogota'

// Miércoles 4 de noviembre de 2026, 10:30 a. m. en Bogotá (15:30 UTC).
const NOW = new Date('2026-11-04T10:30:00-05:00')
const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('hora de Bogotá', () => {
  it('el desfase enviado es siempre -05:00', () => {
    expect(BOGOTA_OFFSET).toBe('-05:00')
    expect(buildScheduledAt('2026-11-06', 10)).toBe('2026-11-06T10:00:00-05:00')
    expect(buildScheduledAt('2026-11-06', 8)).toBe('2026-11-06T08:00:00-05:00')
  })

  it.each(['America/Bogota', 'Asia/Tokyo', 'America/Los_Angeles', 'Europe/Madrid', 'UTC', 'Pacific/Kiritimati'])(
    'da el mismo resultado con el navegador en %s',
    (zone) => {
      process.env.TZ = zone
      expect(bogotaNow(NOW)).toEqual({ date: '2026-11-04', minutes: 10 * 60 + 30 })
      expect(buildScheduledAt('2026-11-06', 17)).toBe('2026-11-06T17:00:00-05:00')
      expect(weekdayOf('2026-11-08')).toBe(0)
      expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
      expect(isSlotPast('2026-11-04', 10, NOW)).toBe(true)
      expect(isSlotPast('2026-11-04', 11, NOW)).toBe(false)
      expect(formatTime('2026-11-06T10:00:00-05:00')).toMatch(/^10:00\s?a\.\s?m\.$/)
      expect(formatLongDate('2026-11-06T10:00:00-05:00')).toMatch(/viernes.*6 de noviembre de 2026/)
    },
  )

  it('a las 11 p. m. en Bogotá sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    const lateNight = new Date('2026-11-05T04:00:00Z') // 23:00 del 4 en Bogotá
    expect(bogotaNow(lateNight).date).toBe('2026-11-04')
  })
})

describe('horas disponibles', () => {
  it('solo hay inicios de 8:00 a 17:00, para que la visita de 60 min termine a las 18:00', () => {
    expect([...SLOT_HOURS]).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('la fecha pasada y la hora que ya empezó están bloqueadas; el futuro no', () => {
    expect(isSlotPast('2026-11-03', 17, NOW)).toBe(true)
    expect(isSlotPast('2026-11-04', 8, NOW)).toBe(true)
    expect(isSlotPast('2026-11-04', 17, NOW)).toBe(false)
    expect(isSlotPast('2026-11-05', 8, NOW)).toBe(false)
  })
})

describe('calendario', () => {
  const calendar = buildCalendar(NOW)
  const days = calendar.flat()
  const find = (date: string) => days.find((day) => day.date === date)

  it('empieza el lunes de la semana actual y cubre 5 semanas de lunes a domingo', () => {
    expect(calendar).toHaveLength(5)
    expect(calendar[0][0].date).toBe('2026-11-02')
    expect(calendar.every((week) => week.length === 7 && weekdayOf(week[6].date) === 0)).toBe(true)
  })

  it('bloquea los domingos y las fechas pasadas, y deja libres los demás', () => {
    expect(find('2026-11-08')?.block).toBe('sunday')
    expect(find('2026-11-15')?.block).toBe('sunday')
    expect(find('2026-11-02')?.block).toBe('past')
    expect(find('2026-11-03')?.block).toBe('past')
    expect(find('2026-11-04')?.block).toBeNull() // hoy aún tiene horas libres
    expect(find('2026-11-07')?.block).toBeNull() // sábado: se atiende
  })

  it('hoy se bloquea cuando ya no queda ninguna hora', () => {
    const lateToday = new Date('2026-11-04T17:30:00-05:00')
    expect(dayBlock('2026-11-04', lateToday)).toBe('past')
    expect(dayBlock('2026-11-05', lateToday)).toBeNull()
  })

  it('marca el día 1 de cada mes para mostrar su nombre', () => {
    expect(find('2026-12-01')?.firstOfMonth).toBe(true)
    expect(find('2026-11-10')?.firstOfMonth).toBe(false)
  })
})
