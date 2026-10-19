import { AppointmentStatus } from './entities/appointment.entity.js';

export const BUSINESS_TIME_ZONE = 'America/Bogota';
export const APPOINTMENT_DURATION_MIN = 60;

/**
 * Mensaje único para cualquier cruce de horario (del vehículo o del cliente). Si el texto distinguiera
 * "ya tienes otra cita", un anónimo podría confirmar que un correo ajeno tiene una cita a esa hora.
 */
export const SLOT_UNAVAILABLE_MESSAGE = 'Ese horario no está disponible. Elige otra hora u otro día';
const OPENING_MINUTE = 8 * 60;
const CLOSING_MINUTE = 18 * 60;

const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Día de la semana (Mon..Sun) y minuto del día de un instante, en hora de Bogotá. */
function bogotaClock(instant: Date): { weekday: string; minuteOfDay: number } {
  const parts = Object.fromEntries(localParts.formatToParts(instant).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Valida que la cita sea futura y quepa por completo en el horario de atención
 * (lunes a sábado, 8:00–18:00 hora de Bogotá). Devuelve el motivo del rechazo o null.
 */
export function validateSlot(start: Date, durationMin: number, now: Date): string | null {
  if (Number.isNaN(start.getTime())) return 'La fecha de la cita no es válida';
  if (start.getTime() <= now.getTime()) return 'La cita debe ser en una fecha futura';

  const { weekday, minuteOfDay } = bogotaClock(start);
  if (weekday === 'Sun') return 'No atendemos los domingos; elige de lunes a sábado';
  if (minuteOfDay < OPENING_MINUTE || minuteOfDay + durationMin > CLOSING_MINUTE) {
    return 'El horario de atención es de 8:00 a. m. a 6:00 p. m. (hora de Bogotá) y la cita debe terminar antes del cierre';
  }
  return null;
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.CANCELLED],
  [AppointmentStatus.CANCELLED]: [],
};

/** pendiente → confirmada | cancelada; confirmada → cancelada; una cancelada no se reactiva. */
export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
