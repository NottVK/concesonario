import type { Vehicle, VehicleInput } from '@/api/types'
import { MAX_IMAGES, MAX_IMAGE_LENGTH, isVehicleImagePath, parseImageLines } from '@/lib/images'

/** Topes iguales a los del servidor (`vehicle.dto.ts`, `limits.ts` y la base de datos). */
export const LIMITS = {
  modelMax: 80,
  versionMax: 80,
  colorMax: 40,
  descriptionMax: 2000,
  yearMin: 1990,
  yearMax: 2100,
  mileageMax: 10_000_000,
  /** El servidor acepta hasta 10 dígitos enteros de pesos. */
  priceDigits: 10,
} as const

export type FuelValue = Vehicle['fuel']
export type TransmissionValue = Vehicle['transmission']
export type ManualStatus = 'nuevo' | 'usado'

/** Valores del formulario: todo texto; `price`, `year` y `mileage` guardan solo dígitos. */
export interface VehicleForm {
  brandId: string
  model: string
  year: string
  version: string
  price: string
  mileage: string
  fuel: FuelValue | ''
  transmission: TransmissionValue | ''
  color: string
  status: ManualStatus
  description: string
  /** Una imagen por línea. */
  images: string
}

export type FormErrors = Partial<Record<keyof VehicleForm, string>>

export const EMPTY_FORM: VehicleForm = {
  brandId: '',
  model: '',
  year: String(new Date().getFullYear()),
  version: '',
  price: '',
  mileage: '0',
  fuel: '',
  transmission: '',
  color: '',
  status: 'nuevo',
  description: '',
  images: '',
}

/** "95500000.50" → "95500000" (el formulario trabaja en pesos enteros). */
export const wholePesos = (price: string): string => price.split('.')[0].replace(/^0+(?=\d)/, '')

export function toForm(vehicle: Vehicle): VehicleForm {
  return {
    brandId: String(vehicle.brandId),
    model: vehicle.model,
    year: String(vehicle.year),
    version: vehicle.version,
    price: wholePesos(vehicle.price),
    mileage: String(vehicle.mileage),
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    color: vehicle.color,
    // Un vehículo vendido no se edita, así que aquí siempre es nuevo o usado.
    status: vehicle.status === 'usado' ? 'usado' : 'nuevo',
    description: vehicle.description ?? '',
    images: vehicle.images.join('\n'),
  }
}

const required = (value: string, message: string): string | undefined => (value.trim() === '' ? message : undefined)

function textError(value: string, label: string, max: number): string | undefined {
  if (value.trim() === '') return `Escribe ${label}.`
  if (value.trim().length > max) return `Máximo ${max} caracteres.`
  return undefined
}

function numberError(digits: string, label: string, min: number, max: number): string | undefined {
  if (digits === '') return `Escribe ${label}.`
  const value = Number(digits)
  if (value < min || value > max) {
    const fmt = new Intl.NumberFormat('es-CO')
    return `${label[0].toUpperCase()}${label.slice(1)} debe estar entre ${fmt.format(min)} y ${fmt.format(max)}.`
  }
  return undefined
}

function priceError(digits: string): string | undefined {
  if (digits === '') return 'Escribe el precio.'
  if (!/^\d+$/.test(digits) || BigInt(digits) <= 0n) return 'El precio debe ser mayor que cero.'
  if (digits.length > LIMITS.priceDigits) return 'El precio no puede tener más de 10 dígitos.'
  return undefined
}

function imagesError(text: string): string | undefined {
  const lines = parseImageLines(text)
  if (lines.length > MAX_IMAGES) return `Máximo ${MAX_IMAGES} imágenes.`
  const bad = lines.findIndex((line) => !isVehicleImagePath(line))
  if (bad === -1) return undefined
  const reason = lines[bad].length > MAX_IMAGE_LENGTH ? `supera los ${MAX_IMAGE_LENGTH} caracteres` : 'no es válida'
  return `La imagen ${bad + 1} ${reason}. Usa una ruta que empiece por /autos/ o una URL que empiece por https://.`
}

/** Devuelve un mensaje por campo inválido; vacío si el formulario se puede enviar. */
export function validateVehicleForm(form: VehicleForm): FormErrors {
  const errors: FormErrors = {
    brandId: required(form.brandId, 'Elige la marca.'),
    model: textError(form.model, 'el modelo', LIMITS.modelMax),
    version: textError(form.version, 'la versión', LIMITS.versionMax),
    color: textError(form.color, 'el color', LIMITS.colorMax),
    year: numberError(form.year, 'el año', LIMITS.yearMin, LIMITS.yearMax),
    mileage: numberError(form.mileage, 'el kilometraje', 0, LIMITS.mileageMax),
    price: priceError(form.price),
    fuel: required(form.fuel, 'Elige el combustible.'),
    transmission: required(form.transmission, 'Elige la transmisión.'),
    description: form.description.length > LIMITS.descriptionMax ? `Máximo ${LIMITS.descriptionMax} caracteres.` : undefined,
    images: imagesError(form.images),
  }
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message !== undefined)) as FormErrors
}

/**
 * Cuerpo para la API. Si el precio no se tocó y el original tenía centavos ("95500000.50"), se envía tal cual
 * para no perderlos: el campo trabaja en pesos enteros.
 */
export function toPayload(form: VehicleForm, original?: Vehicle): VehicleInput {
  const keepOriginalPrice = original !== undefined && wholePesos(original.price) === form.price
  const description = form.description.trim()
  return {
    brandId: Number(form.brandId),
    model: form.model.trim(),
    year: Number(form.year),
    version: form.version.trim(),
    price: keepOriginalPrice ? original.price : form.price,
    mileage: Number(form.mileage),
    fuel: form.fuel as FuelValue,
    transmission: form.transmission as TransmissionValue,
    color: form.color.trim(),
    status: form.status,
    ...(description ? { description } : {}),
    images: parseImageLines(form.images),
  }
}

/** ¿El formulario difiere de lo que se cargó? (para no ofrecer guardar sin cambios) */
export function isDirty(form: VehicleForm, base: VehicleForm): boolean {
  return (Object.keys(base) as (keyof VehicleForm)[]).some((key) => form[key] !== base[key])
}
