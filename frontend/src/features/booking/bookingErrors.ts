import { isAxiosError } from 'axios'
import { errorMessage } from '@/api/client'

export type BookingFailureKind =
  | 'sold'
  | 'slot-taken'
  | 'customer-busy'
  | 'invalid-slot'
  | 'invalid-data'
  | 'unavailable'
  | 'rate-limit'
  | 'no-response'
  | 'unknown'

export interface BookingFailure {
  kind: BookingFailureKind
  message: string
}

const serverMessage = (error: unknown): string | string[] | undefined =>
  isAxiosError<{ message?: string | string[] }>(error) ? error.response?.data?.message : undefined

/**
 * Traduce el error de POST /citas a un mensaje para el usuario. La API no manda códigos de error,
 * solo mensajes en español, así que los 409 se distinguen por su texto; lo que no se reconoce
 * cae en "horario ocupado", que es el motivo más común de un 409.
 */
export function classifyBookingError(error: unknown): BookingFailure {
  if (!isAxiosError(error)) return { kind: 'unknown', message: errorMessage(error) }
  const status = error.response?.status
  const message = serverMessage(error)

  if (!error.response) {
    return {
      kind: 'no-response',
      message:
        'No pudimos confirmar tu cita por un problema de conexión. Si vuelves a intentarlo y te dice que ya tienes una cita en ese horario, es que sí quedó registrada.',
    }
  }
  if (status === 429) {
    return { kind: 'rate-limit', message: 'Hiciste varios intentos seguidos. Espera un minuto e inténtalo de nuevo.' }
  }
  if (status === 404) {
    return { kind: 'unavailable', message: 'Este vehículo ya no está disponible.' }
  }
  if (status === 409) {
    const text = typeof message === 'string' ? message : ''
    if (/vendido/i.test(text)) {
      return { kind: 'sold', message: 'Este vehículo se acaba de vender, por eso no pudimos agendar la cita.' }
    }
    if (/ya tienes otra cita/i.test(text)) {
      return {
        kind: 'customer-busy',
        message: 'Con ese correo ya tienes una cita que se cruza con ese horario. Elige otra hora u otro día.',
      }
    }
    return {
      kind: 'slot-taken',
      message: 'Ese horario ya no está disponible para este vehículo. Elige otra hora u otro día; tus datos siguen aquí.',
    }
  }
  if (status === 400) {
    // Las reglas de horario llegan como texto en español; los errores de campos, como lista técnica.
    if (typeof message === 'string') return { kind: 'invalid-slot', message }
    return { kind: 'invalid-data', message: 'Revisa los datos del formulario e inténtalo de nuevo.' }
  }
  return { kind: 'unknown', message: errorMessage(error) }
}
