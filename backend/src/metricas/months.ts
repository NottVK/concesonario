import { BUSINESS_TIME_ZONE } from '../citas/appointment-rules.js';

/**
 * Meses calendario en hora de Bogotá, como "YYYY-MM". Colombia no usa horario de verano,
 * así que el inicio de cada mes es siempre `-05:00`.
 */
const monthParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});

const pad = (value: number): string => String(value).padStart(2, '0');

export function bogotaMonthKey(instant: Date): string {
  const parts = Object.fromEntries(monthParts.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Los últimos `count` meses terminando en el de `now`, del más antiguo al más reciente. */
export function lastMonthKeys(now: Date, count: number): string[] {
  const current = bogotaMonthKey(now);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)));
}

/** Primer instante del mes (00:00 en Bogotá). */
export function monthStart(key: string): Date {
  return new Date(`${key}-01T00:00:00-05:00`);
}

/** Primer instante del mes siguiente; sirve como límite superior exclusivo. */
export function monthEnd(key: string): Date {
  return monthStart(shiftMonth(key, 1));
}
