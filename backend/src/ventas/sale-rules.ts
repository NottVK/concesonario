import { BadRequestException } from '@nestjs/common';
import { MONEY_REGEX, moneyToCents } from '../common/money.js';

/** Precio final máximo de una venta: 5 000 millones de COP (en centavos). Un monto mayor casi seguro es un error de digitación. */
export const MAX_SALE_PRICE_CENTS = 500_000_000_000n;
const MAX_SALE_PRICE_LABEL = '$ 5.000.000.000';

/**
 * Valida el precio final EN EL SERVIDOR (no solo en el DTO): mayor que cero y con tope.
 * Devuelve el monto normalizado a 2 decimales para guardarlo. Es una función pura para poder probarla sola.
 */
export function assertFinalPrice(finalPrice: string): void {
  if (typeof finalPrice !== 'string' || !MONEY_REGEX.test(finalPrice)) {
    throw new BadRequestException('El precio final debe ser un monto en COP con hasta 2 decimales');
  }
  const cents = moneyToCents(finalPrice);
  if (cents <= 0n) throw new BadRequestException('El precio final debe ser mayor que cero');
  if (cents > MAX_SALE_PRICE_CENTS) {
    throw new BadRequestException(`El precio final no puede superar ${MAX_SALE_PRICE_LABEL} COP`);
  }
}
