import { isAxiosError } from 'axios';
import { ProviderAbortedError, ProviderTimeoutError, ProviderUnavailableError } from './model-provider.js';

/**
 * Traduce cualquier error de Axios a un error propio con mensaje seguro.
 * Los errores de Axios traen `config.headers` (con el `Authorization` de Groq): jamás se propagan ni se registran.
 */
export function toProviderError(error: unknown, provider: string): Error {
  if (!isAxiosError(error)) {
    return new ProviderUnavailableError(`${provider}: respuesta inesperada`);
  }
  if (error.code === 'ERR_CANCELED') return new ProviderAbortedError();
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new ProviderTimeoutError();
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError(`${provider}: credenciales rechazadas`);
  }
  if (status === 429) return new ProviderUnavailableError(`${provider}: límite de uso alcanzado`);
  return new ProviderUnavailableError(status ? `${provider}: error HTTP ${status}` : `${provider}: sin conexión`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Convierte los argumentos que llegan como texto JSON (Groq) en objeto; si no lo son, lo marca. */
export function parseArguments(raw: unknown): { value: Record<string, unknown>; invalid: boolean } {
  const direct = asRecord(raw);
  if (direct) return { value: direct, invalid: false };
  if (typeof raw === 'string') {
    try {
      const parsed = asRecord(JSON.parse(raw));
      if (parsed) return { value: parsed, invalid: false };
    } catch {
      // Texto que no es JSON: se devuelve como inválido sin guardar el contenido.
    }
  }
  return { value: {}, invalid: true };
}
