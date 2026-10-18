const ONE_MINUTE_MS = 60_000;

/**
 * Límite por minuto para rutas públicas que escriben o calculan. `THROTTLE_PUBLIC_LIMIT`
 * permite subirlo en las pruebas e2e; en producción rige el valor `base` de cada ruta.
 * El login NO usa esto: su límite es fijo para que nadie lo relaje por entorno.
 */
export function publicThrottle(base: number): { default: { limit: number; ttl: number } } {
  const override = Number(process.env.THROTTLE_PUBLIC_LIMIT);
  return { default: { limit: override > 0 ? override : base, ttl: ONE_MINUTE_MS } };
}
