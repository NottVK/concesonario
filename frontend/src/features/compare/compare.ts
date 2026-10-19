import type { VehicleWithBrand } from '@/api/types'

export const MAX_COMPARE = 3
export const MIN_COMPARE = 2

/** Entero positivo sin ceros a la izquierda y de hasta 10 dígitos (lo que acepta la API). */
const ID = /^[1-9]\d{0,9}$/

export interface ParsedCompareIds {
  /** Ids válidos, sin repetir y con un máximo de 3. */
  ids: number[]
  /** Forma limpia para la URL: "1,2,3". */
  normalized: string
  /** La URL actual no está en su forma limpia y conviene reescribirla. */
  needsRewrite: boolean
  /** Qué se descartó, para avisarle a quien abrió el enlace. */
  notice: string | null
}

/**
 * Lee `?ids=1,2,3` (también `ids=1&ids=2`) como entrada no confiable: descarta lo que no sea un id,
 * quita repetidos y se queda con los 3 primeros, de modo que la URL nunca pida más de 3 vehículos.
 */
export function parseCompareIds(params: URLSearchParams): ParsedCompareIds {
  const rawValues = params.getAll('ids')
  const tokens = rawValues.flatMap((value) => value.split(',')).map((token) => token.trim()).filter(Boolean)

  const valid: number[] = []
  let invalid = 0
  for (const token of tokens) {
    if (!ID.test(token)) invalid++
    else if (!valid.includes(Number(token))) valid.push(Number(token))
  }

  const ids = valid.slice(0, MAX_COMPARE)
  const normalized = ids.join(',')
  const truncated = valid.length > MAX_COMPARE
  let notice: string | null = null
  if (truncated) notice = `Solo se pueden comparar ${MAX_COMPARE} vehículos a la vez. Mostramos los ${MAX_COMPARE} primeros.`
  else if (invalid > 0) notice = 'Ignoramos algunos datos del enlace que no eran vehículos válidos.'

  const needsRewrite = params.has('ids') && !(rawValues.length === 1 && rawValues[0] === normalized)
  return { ids, normalized, needsRewrite, notice }
}

export type Metric = 'price' | 'year' | 'mileage'

/** "168900000.00" → 16890000000n (centavos), sin pasar por números decimales. */
export function moneyToCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}

const METRICS: Record<Metric, { value: (vehicle: VehicleWithBrand) => bigint; better: 'min' | 'max' }> = {
  price: { value: (v) => moneyToCents(v.price), better: 'min' },
  year: { value: (v) => BigInt(v.year), better: 'max' },
  mileage: { value: (v) => BigInt(v.mileage), better: 'min' },
}

/**
 * Ids con el mejor valor de cada fila comparable (menor precio, año más reciente, menos km).
 * Solo cuentan los vehículos disponibles, hacen falta al menos dos, y si todos empatan no se
 * destaca ninguno (marcar a todos como "mejor" no informa).
 */
export function bestIds(vehicles: readonly VehicleWithBrand[]): Record<Metric, Set<number>> {
  const result: Record<Metric, Set<number>> = { price: new Set(), year: new Set(), mileage: new Set() }
  const available = vehicles.filter((vehicle) => vehicle.status !== 'vendido')
  if (available.length < MIN_COMPARE) return result

  for (const metric of Object.keys(METRICS) as Metric[]) {
    const { value, better } = METRICS[metric]
    const values = available.map(value)
    const best = values.reduce((a, b) => ((better === 'min' ? b < a : b > a) ? b : a))
    if (values.every((v) => v === best)) continue
    available.forEach((vehicle, index) => {
      if (values[index] === best) result[metric].add(vehicle.id)
    })
  }
  return result
}
