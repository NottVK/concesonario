/** Ayudantes de prueba para la sesión: tokens con la forma de un JWT (sin firma válida; el frontend no la verifica). */
const b64url = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

let counter = 0

export function makeToken(payload: { sub: number; role?: string; exp?: number }): string {
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 3600
  // `jti` distinto en cada llamada: dos tokens del mismo usuario nunca son iguales.
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ ...payload, role: payload.role ?? 'vendedor', exp, jti: ++counter })}.firma`
}

export const USERS = {
  'admin@automax.co': { id: 1, name: 'Ana Admin', email: 'admin@automax.co', role: 'admin' as const },
  'vendedor@automax.co': { id: 2, name: 'Víctor Vendedor', email: 'vendedor@automax.co', role: 'vendedor' as const },
  'otro@automax.co': { id: 3, name: 'Olga Otra', email: 'otro@automax.co', role: 'vendedor' as const },
  'cliente@correo.co': { id: 4, name: 'Carlos Cliente', email: 'cliente@correo.co', role: 'cliente' as const },
}
export type TestUser = (typeof USERS)[keyof typeof USERS]
export const GOOD_PASSWORD = 'clave-correcta-123'
