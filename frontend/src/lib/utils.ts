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

/** Formatea un monto en COP que llega como string de la API (numeric(12,2)). */
export function formatCOP(amount: string): string {
  const value = Number(amount)
  return Number.isFinite(value) ? copFormatter.format(value) : amount
}
