import { describe, expect, it } from 'vitest';
import { bogotaMonthKey, lastMonthKeys, monthEnd, monthStart } from './months.js';

describe('meses en hora de Bogotá', () => {
  it('a las 11 p. m. del último día del mes en Bogotá sigue siendo ese mes aunque en UTC ya sea el siguiente', () => {
    // 2026-10-31 23:30 en Bogotá = 2026-11-01 04:30 UTC
    expect(bogotaMonthKey(new Date('2026-11-01T04:30:00Z'))).toBe('2026-10');
    expect(bogotaMonthKey(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
  });

  it('devuelve los últimos meses del más antiguo al más reciente, cruzando el año', () => {
    expect(lastMonthKeys(new Date('2026-02-10T12:00:00Z'), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonthKeys(new Date('2026-10-18T12:00:00Z'), 1)).toEqual(['2026-10']);
    expect(lastMonthKeys(new Date('2026-10-18T12:00:00Z'), 12)).toHaveLength(12);
  });

  it('el mes empieza a las 00:00 de Bogotá y termina donde empieza el siguiente', () => {
    expect(monthStart('2026-10').toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(monthEnd('2026-10').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(monthEnd('2026-12').toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});
