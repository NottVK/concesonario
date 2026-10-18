import { describe, expect, it } from 'vitest';
import { canTransition, validateSlot } from './appointment-rules.js';
import { AppointmentStatus } from './entities/appointment.entity.js';

// Referencia fija: domingo 1 de noviembre de 2026, 12:00 en Bogotá (UTC-5, sin horario de verano).
const NOW = new Date('2026-11-01T12:00:00-05:00');
const at = (iso: string): Date => new Date(iso);

describe('validateSlot (horario en America/Bogota)', () => {
  it('acepta martes a las 10:00', () => {
    expect(validateSlot(at('2026-11-03T10:00:00-05:00'), 60, NOW)).toBeNull();
  });

  it('acepta la primera hora de apertura (8:00) y la última que termina a las 18:00 (17:00)', () => {
    expect(validateSlot(at('2026-11-03T08:00:00-05:00'), 60, NOW)).toBeNull();
    expect(validateSlot(at('2026-11-03T17:00:00-05:00'), 60, NOW)).toBeNull();
  });

  it('acepta sábado', () => {
    expect(validateSlot(at('2026-11-07T09:00:00-05:00'), 60, NOW)).toBeNull();
  });

  it('rechaza domingo', () => {
    expect(validateSlot(at('2026-11-08T10:00:00-05:00'), 60, NOW)).toMatch(/domingo/i);
  });

  it('rechaza antes de abrir (7:59) y a las 17:01, porque terminaría después del cierre', () => {
    expect(validateSlot(at('2026-11-03T07:59:00-05:00'), 60, NOW)).toMatch(/horario/i);
    expect(validateSlot(at('2026-11-03T17:01:00-05:00'), 60, NOW)).toMatch(/horario/i);
    expect(validateSlot(at('2026-11-03T18:00:00-05:00'), 60, NOW)).toMatch(/horario/i);
  });

  it('interpreta la hora en Bogotá aunque llegue en UTC (15:00Z = 10:00 en Bogotá)', () => {
    expect(validateSlot(at('2026-11-03T15:00:00Z'), 60, NOW)).toBeNull();
    // 23:30Z = 18:30 en Bogotá: fuera de horario.
    expect(validateSlot(at('2026-11-03T23:30:00Z'), 60, NOW)).toMatch(/horario/i);
  });

  it('el domingo en Bogotá puede ser lunes en UTC', () => {
    // 2026-11-09T02:00Z = domingo 8 de noviembre 21:00 en Bogotá.
    expect(validateSlot(at('2026-11-09T02:00:00Z'), 60, NOW)).toMatch(/domingo|horario/i);
  });

  it('rechaza fechas pasadas, el instante actual y fechas inválidas', () => {
    expect(validateSlot(at('2026-10-30T10:00:00-05:00'), 60, NOW)).toMatch(/futura/i);
    expect(validateSlot(NOW, 60, NOW)).toMatch(/futura/i);
    expect(validateSlot(new Date('no-es-fecha'), 60, NOW)).toMatch(/válida/i);
  });

  it('una duración mayor exige terminar antes del cierre', () => {
    expect(validateSlot(at('2026-11-03T16:30:00-05:00'), 120, NOW)).toMatch(/horario/i);
    expect(validateSlot(at('2026-11-03T16:00:00-05:00'), 120, NOW)).toBeNull();
  });
});

describe('canTransition', () => {
  const { PENDING, CONFIRMED, CANCELLED } = AppointmentStatus;

  it.each([
    [PENDING, CONFIRMED, true],
    [PENDING, CANCELLED, true],
    [CONFIRMED, CANCELLED, true],
    [CONFIRMED, PENDING, false],
    [PENDING, PENDING, false],
    [CONFIRMED, CONFIRMED, false],
    [CANCELLED, PENDING, false],
    [CANCELLED, CONFIRMED, false],
    [CANCELLED, CANCELLED, false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});
