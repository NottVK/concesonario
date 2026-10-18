import { describe, expect, it } from 'vitest';
import { centsToMoney, moneyToCents } from './money.js';

describe('moneyToCents', () => {
  it.each([
    ['0', 0n],
    ['1', 100n],
    ['1234.5', 123_450n],
    ['1234.56', 123_456n],
    ['95000000', 9_500_000_000n],
  ])('convierte %s', (input, expected) => {
    expect(moneyToCents(input)).toBe(expected);
  });

  it.each(['', '-5', '1.234', '1,5', 'abc', '1e5', ' 10', '12345678901'])(
    'rechaza %j',
    (input) => {
      expect(() => moneyToCents(input)).toThrow(RangeError);
    },
  );
});

describe('centsToMoney', () => {
  it.each([
    [0n, '0.00'],
    [5n, '0.05'],
    [123_450n, '1234.50'],
    [-250n, '-2.50'],
  ])('formatea %s', (cents, expected) => {
    expect(centsToMoney(cents)).toBe(expected);
  });

  it('es inverso de moneyToCents', () => {
    expect(centsToMoney(moneyToCents('87654321.09'))).toBe('87654321.09');
  });
});
