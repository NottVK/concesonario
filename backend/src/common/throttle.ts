const ONE_MINUTE_MS = 60_000;

export const DEFAULT_THROTTLE_LIMIT = 100;
export const MAX_THROTTLE_LIMIT = 100_000;

/**
 * Límite global por IP y minuto (`THROTTLE_LIMIT`). Si la variable está mal puesta NO se sigue en silencio:
 * `Number('abc')` daría NaN y `totalHits > NaN` nunca es verdadero, o sea, sin límite. Se falla al arrancar.
 */
export function globalThrottleLimit(raw: string | undefined = process.env.THROTTLE_LIMIT): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_THROTTLE_LIMIT;
  const value = raw.trim();
  const limit = /^\d{1,6}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_THROTTLE_LIMIT) {
    throw new Error(`THROTTLE_LIMIT debe ser un entero entre 1 y ${MAX_THROTTLE_LIMIT} (recibido: "${raw}")`);
  }
  return limit;
}

/**
 * Límite por minuto para rutas públicas que escriben o calculan. `THROTTLE_PUBLIC_LIMIT`
 * solo se respeta con NODE_ENV=test (Vitest lo fija solo), para que una variable mal
 * puesta en producción no desactive el límite. El login NO usa esto: su límite es fijo.
 */
export function publicThrottle(base: number): { default: { limit: number; ttl: number } } {
  const override = process.env.NODE_ENV === 'test' ? Number(process.env.THROTTLE_PUBLIC_LIMIT) : 0;
  return { default: { limit: override > 0 ? override : base, ttl: ONE_MINUTE_MS } };
}
