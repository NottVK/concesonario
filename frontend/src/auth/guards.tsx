import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { Role } from './jwt'
import { NoPermission } from '@/features/admin/NoPermission'

/**
 * Protege una zona del panel. Sin sesión lleva al login y recuerda SOLO la ruta de destino (nunca datos).
 * Con sesión pero sin el rol, muestra "sin permiso". Es una comodidad de la interfaz: los permisos reales
 * los verifica siempre el backend.
 */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return (
      <p role="status" className="p-10 text-center text-muted">
        Comprobando tu sesión…
      </p>
    )
  }
  if (auth.status === 'anonymous' || !auth.user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (!roles.includes(auth.user.role)) return <NoPermission user={auth.user} />
  return <>{children}</>
}

/** Solo acepta rutas internas del panel como destino tras el login (evita redirecciones a otros sitios). */
export function safeAdminPath(value: unknown): string {
  if (typeof value !== 'string') return '/admin'
  // "/admin" o "/admin/…" (nunca "/administrador" ni otro sitio), sin barras invertidas ni caracteres de control.
  if (!/^\/admin(?:[/?#]|$)/.test(value) || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return '/admin'
  if (/^\/admin\/login(?:[/?#]|$)/.test(value)) return '/admin'
  return value
}
