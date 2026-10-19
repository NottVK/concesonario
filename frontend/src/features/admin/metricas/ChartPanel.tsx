import { BarChart3, Table2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { StateBody } from './Panel'
import type { LoadState } from './Panel'

/**
 * Gráfica con tabla equivalente: quien no ve bien el color o usa lector de pantalla cambia a la tabla con
 * los mismos datos. Los valores también van escritos sobre cada barra.
 */
export function ChartPanel({
  title,
  description,
  state,
  emptyText,
  onRetry,
  chart,
  table,
}: {
  title: string
  description: string
  state: LoadState
  emptyText: string
  onRetry: () => void
  chart: ReactNode
  table: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const bodyId = useId()
  return (
    <section aria-labelledby={`${bodyId}-t`} className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${bodyId}-t`} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {state === 'ready' && (
          <Button size="sm" variant="outline" aria-pressed={asTable} aria-controls={bodyId} onClick={() => setAsTable((v) => !v)}>
            {asTable ? <BarChart3 size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
            {asTable ? 'Ver gráfica' : 'Ver como tabla'}
          </Button>
        )}
      </div>
      <div id={bodyId} className="mt-5">
        <StateBody state={state} emptyText={emptyText} onRetry={onRetry} skeletonClass="h-64 w-full">
          {asTable ? table : chart}
        </StateBody>
      </div>
    </section>
  )
}
