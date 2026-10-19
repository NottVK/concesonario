import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type LoadState = 'loading' | 'error' | 'empty' | 'ready'

/** Mismo cuerpo para cualquier tarjeta: carga, error con reintento o vacío, cada uno con su propio mensaje. */
export function StateBody({
  state,
  emptyText,
  onRetry,
  skeletonClass = 'h-8 w-28',
  children,
}: {
  state: LoadState
  emptyText: string
  onRetry: () => void
  skeletonClass?: string
  children: ReactNode
}) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label="Cargando">
        <Skeleton className={skeletonClass} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <p className="flex items-center gap-2 text-muted">
          <AlertTriangle size={16} aria-hidden="true" />
          No pudimos cargar este dato.
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    )
  }
  if (state === 'empty') return <p className="text-sm text-muted">{emptyText}</p>
  return <>{children}</>
}

export function stateOf(query: { isPending: boolean; isError: boolean }, empty: boolean): LoadState {
  if (query.isPending) return 'loading'
  if (query.isError) return 'error'
  return empty ? 'empty' : 'ready'
}

export function MetricCard({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={cn('rounded-lg border border-border bg-surface p-5', className)}>
      <h2 className="font-sans text-sm font-medium text-muted">{label}</h2>
      <div className="mt-3 min-h-14">{children}</div>
    </section>
  )
}
