import { describe, expect, it } from 'vitest';
import { DEFAULT_THROTTLE_LIMIT, MAX_THROTTLE_LIMIT, globalThrottleLimit } from './throttle.js';

describe('globalThrottleLimit', () => {
  it('sin valor usa el límite por defecto', () => {
    expect(globalThrottleLimit(undefined)).toBe(DEFAULT_THROTTLE_LIMIT);
    expect(globalThrottleLimit('')).toBe(DEFAULT_THROTTLE_LIMIT);
    expect(globalThrottleLimit('   ')).toBe(DEFAULT_THROTTLE_LIMIT);
  });

  it('acepta enteros entre 1 y el máximo', () => {
    expect(globalThrottleLimit('1')).toBe(1);
    expect(globalThrottleLimit(' 250 ')).toBe(250);
    expect(globalThrottleLimit(String(MAX_THROTTLE_LIMIT))).toBe(MAX_THROTTLE_LIMIT);
  });

  it.each(['abc', '0', '-5', '1.5', '1e3', '100001', '9999999', '0x10', 'NaN', 'Infinity', '10 20'])(
    'rechaza %j en lugar de dejar el servicio sin límite',
    (raw) => {
      expect(() => globalThrottleLimit(raw)).toThrow(/THROTTLE_LIMIT debe ser un entero/);
    },
  );
});
