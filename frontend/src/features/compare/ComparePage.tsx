import { useQueries } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { vehicleQuery } from '@/api/queries'
import { buttonVariants } from '@/components/ui/button'
import { MAX_COMPARE, MIN_COMPARE, parseCompareIds } from './compare'
import { useCompare } from './CompareContext'
import { CompareTable } from './CompareTable'
import type { CompareColumn } from './CompareTable'

export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const compare = useCompare()
  const parsed = useMemo(() => parseCompareIds(params), [params])
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Comparador | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  // La URL manda. Sin `ids` se adopta la selección hecha en el catálogo; con `ids` sucios, se limpian.
  useEffect(() => {
    if (!params.has('ids') && compare.ids.length > 0) {
      setParams({ ids: compare.ids.join(',') }, { replace: true })
      return
    }
    if (parsed.needsRewrite) {
      setParams(parsed.normalized ? { ids: parsed.normalized } : {}, { replace: true })
      setNotice(parsed.notice)
    }
    compare.replace(parsed.ids)
    // `compare.ids` se excluye a propósito: depender de él haría que la selección y la URL se pelearan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, parsed])

  // Una consulta por vehículo: así uno inexistente o vendido no tumba a los demás (la ruta
  // /vehiculos/comparar rechaza todo el lote con un 404 si falta uno) y se reutiliza la caché del detalle.
  const results = useQueries({ queries: parsed.ids.map((id) => vehicleQuery(id)) })

  const columns: CompareColumn[] = parsed.ids.map((id, index) => {
    const result = results[index]
    if (result.data) return { id, kind: 'vehicle', vehicle: result.data }
    if (result.isError) {
      if (isAxiosError(result.error) && result.error.response?.status === 404) return { id, kind: 'missing' }
      return { id, kind: 'error', error: result.error, retry: () => void result.refetch() }
    }
    return { id, kind: 'loading' }
  })

  const remove = (id: number) => {
    const rest = parsed.ids.filter((item) => item !== id)
    compare.remove(id)
    setNotice(null)
    setParams(rest.length > 0 ? { ids: rest.join(',') } : {})
  }

  const remaining = MAX_COMPARE - parsed.ids.length
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold sm:text-4xl">Comparador</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Compara hasta {MAX_COMPARE} vehículos lado a lado. Marcamos con «Mejor» el valor más conveniente de cada fila
          entre los que siguen disponibles.
        </p>
      </header>

      {notice && (
        <p role="status" className="mb-4 rounded-md border border-border p-3 text-sm">
          {notice}
        </p>
      )}

      {parsed.ids.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <p className="font-medium">Todavía no elegiste vehículos para comparar</p>
          <p className="mt-1 text-sm text-muted">
            En el catálogo, pulsa «Comparar» en las tarjetas (de {MIN_COMPARE} a {MAX_COMPARE}).
          </p>
          <Link to="/catalogo" className={buttonVariants({ className: 'mt-5' })}>
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <>
          {columns.length > 1 && <p className="mb-2 text-xs text-muted sm:hidden">Desliza la tabla para ver los demás vehículos.</p>}
          <CompareTable columns={columns} onRemove={remove} />
          {parsed.ids.length < MIN_COMPARE && (
            <p className="mt-4 text-sm text-muted">Agrega al menos otro vehículo para poder compararlos.</p>
          )}
          {remaining > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/catalogo" className={buttonVariants({ variant: 'outline' })}>
                Agregar otro vehículo
              </Link>
              <span className="text-sm text-muted">
                Puedes agregar {remaining} más. Tu selección se conserva al volver.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
