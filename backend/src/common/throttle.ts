const ONE_MINUTE_MS = 60_000;

/**
 * Límite por minuto para rutas públicas que escriben o calculan. `THROTTLE_PUBLIC_LIMIT`
 * solo se respeta con NODE_ENV=test (Vitest lo fija solo), para que una variable mal
 * puesta en producción no desactive el límite. El login NO usa esto: su límite es fijo.
 */
export function publicThrottle(base: number): { default: { limit: number; ttl: number } } {
  const override = process.env.NODE_ENV === 'test' ? Number(process.env.THROTTLE_PUBLIC_LIMIT) : 0;
  return { default: { limit: override > 0 ? override : base, ttl: ONE_MINUTE_MS } };
}
