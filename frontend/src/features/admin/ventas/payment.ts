import type { PaymentMethod } from '@/api/types'

export const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'contado', label: 'Contado' },
  { value: 'credito', label: 'Crédito' },
  { value: 'leasing', label: 'Leasing' },
]

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  contado: 'Contado',
  credito: 'Crédito',
  leasing: 'Leasing',
}
