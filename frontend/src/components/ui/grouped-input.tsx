import type { InputHTMLAttributes } from 'react'

const groupFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** "900000000" → "900.000.000" (para mostrar); vacío si no hay dígitos. */
export function formatGrouped(digits: string): string {
  return digits === '' ? '' : groupFormatter.format(Number(digits))
}

/** Deja solo dígitos, sin ceros a la izquierda y con un máximo de longitud. */
export function cleanDigits(raw: string, maxLength: number): string {
  return raw.replace(/\D/g, '').slice(0, maxLength).replace(/^0+(?=\d)/, '')
}

interface GroupedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Valor limpio (solo dígitos); es lo que se envía a la API. */
  value: string
  onValueChange: (digits: string) => void
  maxLength?: number
  /** false para años y similares: solo dígitos, sin separador de miles. Por defecto true. */
  grouped?: boolean
}

/** Campo numérico que muestra separador de miles pero guarda el número limpio. */
export function GroupedInput({ value, onValueChange, maxLength = 10, grouped = true, ...props }: GroupedInputProps) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={grouped ? formatGrouped(value) : value}
      onChange={(event) => onValueChange(cleanDigits(event.target.value, maxLength))}
    />
  )
}
