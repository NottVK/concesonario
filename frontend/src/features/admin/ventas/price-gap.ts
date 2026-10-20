import { moneyToCents } from '@/features/compare/compare'

export interface PriceGap {
  kind: 'discount' | 'above' | 'same'
  /** Monto absoluto con 2 decimales, listo para `formatCOP`. */
  amount: string
}

const toMoney = (cents: bigint): string => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`

/** Diferencia entre el precio de lista y el final, calculada en centavos (sin decimales flotantes). */
export function priceGap(listPrice: string, finalPrice: string): PriceGap {
  const diff = moneyToCents(listPrice) - moneyToCents(finalPrice)
  if (diff === 0n) return { kind: 'same', amount: '0.00' }
  return diff > 0n ? { kind: 'discount', amount: toMoney(diff) } : { kind: 'above', amount: toMoney(-diff) }
}
