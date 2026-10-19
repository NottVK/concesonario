import { Link, useLocation } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { MAX_COMPARE, MIN_COMPARE } from './compare'
import { useCompare } from './CompareContext'

/** Barra inferior con la selección en curso. Se oculta en /comparar, donde ya está a la vista. */
export function CompareTray() {
  const { ids, isFull, clear } = useCompare()
  const { pathname } = useLocation()
  if (ids.length === 0 || pathname.startsWith('/comparar')) return null

  const ready = ids.length >= MIN_COMPARE
  return (
    <section
      aria-label="Vehículos para comparar"
      className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg sm:p-4"
    >
      <div role="status" className="text-sm">
        <p className="font-medium">
          {ids.length} de {MAX_COMPARE} para comparar
        </p>
        <p className="text-xs text-muted">
          {isFull
            ? `Máximo ${MAX_COMPARE}: quita uno para agregar otro.`
            : ready
              ? 'Ya puedes compararlos.'
              : `Elige al menos ${MIN_COMPARE} vehículos.`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={clear}>
          Vaciar
        </Button>
        {ready ? (
          <Link to={`/comparar?ids=${ids.join(',')}`} className={buttonVariants({ size: 'sm' })}>
            Comparar
          </Link>
        ) : (
          <Button size="sm" disabled>
            Comparar
          </Button>
        )}
      </div>
    </section>
  )
}
