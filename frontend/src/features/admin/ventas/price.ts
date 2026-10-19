/** Precio final máximo de una venta, igual que el del servidor (`sale-rules.ts`): 5 000 millones de COP. */
export const MAX_SALE_PRICE = 5_000_000_000n
/** El servidor acepta hasta 10 dígitos enteros. */
export const MAX_SALE_PRICE_DIGITS = 10

/** `digits` es el valor limpio del campo (solo dígitos). Devuelve el mensaje de error, o undefined si es válido. */
export function validateSalePrice(digits: string): string | undefined {
  if (digits === '') return 'Escribe el precio final.'
  if (!/^\d+$/.test(digits)) return 'El precio final solo puede tener números.'
  const value = BigInt(digits)
  if (value <= 0n) return 'El precio final debe ser mayor que cero.'
  if (value > MAX_SALE_PRICE) return 'El precio final no puede superar $ 5.000.000.000.'
  return undefined
}
