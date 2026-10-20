import { Link, NavLink, Outlet } from 'react-router-dom'
import { ChatWidget } from '@/features/chat/ChatWidget'
import { CompareTray } from '@/features/compare/CompareTray'
import { useCompare } from '@/features/compare/CompareContext'
import { cn } from '@/lib/utils'

const links = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/comparar', label: 'Comparar' },
]

export function Layout() {
  const { ids } = useCompare()
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
                to={link.to === '/comparar' && ids.length > 0 ? `/comparar?ids=${ids.join(',')}` : link.to}
                className={({ isActive }) =>
                  cn('transition-colors hover:text-foreground', isActive ? 'text-accent' : 'text-muted')
                }
              >
                {link.label}
                {link.to === '/comparar' && ids.length > 0 && (
                  <>
                    <span aria-hidden="true" className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
                      {ids.length}
                    </span>
                    <span className="sr-only"> ({ids.length} seleccionados)</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {/* `overflow-x-clip` (no crea un contenedor de scroll): ninguna pantalla puede ensanchar la página en horizontal. */}
      <main id="contenido" className={cn('min-w-0 flex-1 overflow-x-clip', ids.length > 0 && 'pb-24')}>
        <Outlet />
      </main>
      <CompareTray />
      <ChatWidget />
      <footer className="border-t border-border py-8 text-sm text-muted">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          © {new Date().getFullYear()} AutoMax. Precios en pesos colombianos (COP).
        </div>
      </footer>
    </div>
  )
}
