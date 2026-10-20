import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const copExactFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Como `formatCOP`, pero sin redondear: si el monto tiene centavos ("115000000.50") los muestra
 * ("$ 115.000.000,50"). Para valores que se pactaron o se pagaron (ventas), donde un peso de más es un dato falso.
 */
export function formatCOPExact(amount: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount
  return /\.(?!0+$)\d+$/.test(amount) ? copExactFormatter.format(value) : copFormatter.format(value)
}

/** Formatea un monto en COP que llega como string de la API (numeric(12,2)). */
export function formatCOP(amount: string): string {
  const value = Number(amount)
  return Number.isFinite(value) ? copFormatter.format(value) : amount
}
