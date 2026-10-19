export type Role = 'admin' | 'vendedor' | 'cliente'

export interface JwtPayload {
  /** Id del usuario. */
  sub: number
  role: Role
  /** Vencimiento, en segundos desde la época. */
  exp: number
}

const ROLES: readonly string[] = ['admin', 'vendedor', 'cliente']

/**
 * Lee el contenido de un JWT SIN verificar la firma (eso solo puede hacerlo el servidor). Sirve para saber
 * cuándo vence la sesión y de quién es el token; nunca para decidir permisos: esos los verifica el backend.
 */
export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const payload: unknown = JSON.parse(json)
    if (typeof payload !== 'object' || payload === null) return null
    const { sub, role, exp } = payload as Record<string, unknown>
    if (typeof sub !== 'number' || !Number.isInteger(sub) || sub < 1) return null
    if (typeof role !== 'string' || !ROLES.includes(role)) return null
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    return { sub, role: role as Role, exp }
  } catch {
    return null
  }
}

/** Id del usuario al que pertenece un token, o null si no se puede leer. */
export function subjectOf(token: string | null | undefined): number | null {
  return decodeJwt(token)?.sub ?? null
}
