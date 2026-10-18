/** Formato de dinero aceptado en las entradas: enteros o con hasta 2 decimales. */
export const MONEY_REGEX = /^\d{1,10}(\.\d{1,2})?$/;

/** Igual que MONEY_REGEX pero rechaza el cero (precios y ventas deben ser > 0). */
export const POSITIVE_MONEY_REGEX = /^(?!0+(\.0{1,2})?$)\d{1,10}(\.\d{1,2})?$/;

/** Convierte "1234.5" a centavos (123450n). Evita floats para no perder precisión. */
export function moneyToCents(value: string): bigint {
  if (!MONEY_REGEX.test(value)) {
    throw new RangeError(`Monto inválido: ${value}`);
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Convierte centavos a string con 2 decimales: 123450n → "1234.50". */
export function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
