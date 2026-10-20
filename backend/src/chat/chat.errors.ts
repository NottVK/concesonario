import { HttpException, HttpStatus } from '@nestjs/common';

/** Respuesta 429/503 que debe llevar `Retry-After` (el controlador lo copia a la cabecera). */
export class ChatRetryException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus.TOO_MANY_REQUESTS | HttpStatus.SERVICE_UNAVAILABLE,
    readonly retryAfterSeconds: number,
  ) {
    super(message, status);
  }
}

export const MODEL_UNAVAILABLE_MESSAGE =
  'El asistente no está disponible ahora. Puedes usar el catálogo o agendar desde el detalle del vehículo.';
export const MODEL_SLOW_MESSAGE = 'El asistente tardó demasiado en responder. Intenta de nuevo en un momento.';
