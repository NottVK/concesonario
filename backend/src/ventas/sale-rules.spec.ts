import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_SALE_PRICE_CENTS, assertFinalPrice } from './sale-rules.js';

describe('assertFinalPrice (validación del precio final en el servidor)', () => {
  it.each(['0.01', '1', '115000000.50', '4999999999.99', '5000000000', '5000000000.00'])('acepta %s', (price) => {
    expect(() => assertFinalPrice(price)).not.toThrow();
  });

  it.each(['0', '0.00', '00', '0.0'])('rechaza %s: debe ser mayor que cero', (price) => {
    expect(() => assertFinalPrice(price)).toThrow(/mayor que cero/);
  });

  it.each(['5000000000.01', '5000000001', '9999999999.99'])('rechaza %s: supera el tope', (price) => {
    expect(() => assertFinalPrice(price)).toThrow(/no puede superar/);
  });

  it.each(['-1', '-0.01', '1.234', '1e3', '1,5', ' 10', '10 ', 'abc', '', '１２３', '99999999999999999999', "1'--", '0x10', 'NaN', 'Infinity'])(
    'rechaza %j como monto inválido (400)',
    (price) => {
      expect(() => assertFinalPrice(price)).toThrow(BadRequestException);
    },
  );

  it('también rechaza lo que no es texto (el DTO podría saltarse)', () => {
    for (const value of [1000, null, undefined, {}, [], true]) {
      expect(() => assertFinalPrice(value as unknown as string)).toThrow(BadRequestException);
    }
  });

  it('el tope es de 5 000 millones de COP en centavos', () => {
    expect(MAX_SALE_PRICE_CENTS).toBe(500_000_000_000n);
  });
});
