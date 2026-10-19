import type { Vehicle } from '@/api/types'

export const FUEL_LABELS: Record<Vehicle['fuel'], string> = {
  gasolina: 'Gasolina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
}

export const TRANSMISSION_LABELS: Record<Vehicle['transmission'], string> = {
  manual: 'Manual',
  automatica: 'Automática',
}

export const STATUS_LABELS: Record<Vehicle['status'], string> = {
  nuevo: 'Nuevo',
  usado: 'Usado',
  vendido: 'Vendido',
}

const kmFormatter = new Intl.NumberFormat('es-CO')

export function formatKm(km: number): string {
  return km === 0 ? '0 km' : `${kmFormatter.format(km)} km`
}
