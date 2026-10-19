import { Link, NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const links = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/comparar', label: 'Comparar' },
]

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Auto<span className="text-accent">Max</span>
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-6 text-sm">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn('transition-colors hover:text-foreground', isActive ? 'text-accent' : 'text-muted')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-8 text-sm text-muted">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          © {new Date().getFullYear()} AutoMax. Precios en pesos colombianos (COP).
        </div>
      </footer>
    </div>
  )
}
