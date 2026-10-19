import { LogOut } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import type { Role } from '@/auth/jwt'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from './NoPermission'
import { SessionBanner } from './SessionBanner'

interface NavItem {
  to: string
  label: string
  roles: readonly Role[]
  end?: boolean
}

/** Secciones del panel por rol. Solo se listan las que ya existen; las demás se agregan al construirlas. */
export const ADMIN_NAV: NavItem[] = [{ to: '/admin', label: 'Inicio', roles: ['admin', 'vendedor'], end: true }]

export function AdminLayout() {
  const auth = useAuth()
  const user = auth.user
  const items = ADMIN_NAV.filter((item) => user && item.roles.includes(user.role))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/admin" className="font-display text-lg font-semibold tracking-tight">
            Auto<span className="text-accent">Max</span>
            <span className="ml-2 text-sm font-normal text-muted">Panel</span>
          </Link>
          <nav aria-label="Panel" className="flex flex-1 items-center gap-5 overflow-x-auto text-sm">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('whitespace-nowrap transition-colors hover:text-foreground', isActive ? 'text-accent' : 'text-muted')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <div className="hidden text-right leading-tight sm:block">
                <p className="font-medium">{user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
              </div>
              <Link to="/" className="hidden text-muted transition-colors hover:text-foreground md:inline">
                Ver sitio
              </Link>
              <Button variant="outline" size="sm" onClick={auth.logout}>
                <LogOut size={14} aria-hidden="true" />
                Cerrar sesión
              </Button>
            </div>
          )}
        </div>
      </header>

      <SessionBanner />
      {auth.notice && (
        <div role="status" className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-sm sm:px-6">
            <p>{auth.notice}</p>
            <Button variant="ghost" size="sm" onClick={auth.dismissNotice}>
              Entendido
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
