import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Cabecera con la que el bot se identifica ante la propia API (solo quita el límite por IP; no da permisos). */
export const INTERNAL_HEADER = 'x-internal-chat';

/**
 * Secreto de arranque: 32 bytes aleatorios que viven solo en memoria (no van en `.env`) y que NUNCA se
 * registran, ni en logs ni en mensajes de error.
 */
@Injectable()
export class InternalSecret {
  // Campo privado de JS (#): no aparece en JSON.stringify ni en console.log del objeto.
  readonly #value = randomBytes(32).toString('hex');

  /** Valor para la cabecera de las llamadas internas. */
  header(): string {
    return this.#value;
  }

  /** Comparación en tiempo constante (se comparan hashes para que ambos midan lo mismo). */
  matches(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 256) return false;
    const a = createHash('sha256').update(candidate).digest();
    const b = createHash('sha256').update(this.#value).digest();
    return timingSafeEqual(a, b);
  }

  toString(): string {
    return '[InternalSecret]';
  }
}
