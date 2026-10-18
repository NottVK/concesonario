const BOGOTA_OFFSET_HOURS = 5;
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Próxima fecha (a ≥ `minDaysAhead` días) que cae en el día de la semana pedido
 * (0 = domingo … 6 = sábado) en Bogotá, a la hora indicada, como ISO con offset -05:00.
 */
export function bogotaSlot(weekday: number, hour: number, minute = 0, minDaysAhead = 7): string {
  // Desplazar -5 h hace que los getUTC* devuelvan el calendario de Bogotá.
  const local = new Date(Date.now() - BOGOTA_OFFSET_HOURS * 3_600_000 + minDaysAhead * 86_400_000);
  while (local.getUTCDay() !== weekday) local.setUTCDate(local.getUTCDate() + 1);
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  return `${date}T${pad(hour)}:${pad(minute)}:00-05:00`;
}

export const TUESDAY = 2;
export const WEDNESDAY = 3;
export const THURSDAY = 4;
export const SUNDAY = 0;
