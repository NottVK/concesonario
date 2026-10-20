import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import type { SaleListItem } from '@/api/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/features/catalog/Pagination'
import { parsePage } from '@/features/catalog/filters'
import { formatShortDate, formatTime } from '@/lib/bogota'
import { cn, formatCOPExact } from '@/lib/utils'
import { historialQuery } from './api'
import { PAYMENT_LABELS } from './payment'

const rowGrid = 'md:grid-cols-[9rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_9.5rem_7rem] md:items-center'

function Row({ sale, page }: { sale: SaleListItem; page: number }) {
  const car = `${sale.vehicle.brand} ${sale.vehicle.model} ${sale.vehicle.year}`
  return (
    <li className={cn('grid gap-2 border-b border-border px-4 py-4 last:border-b-0 md:gap-4', rowGrid)}>
      <div className="text-sm">
        <p className="font-medium">{formatShortDate(sale.soldAt)}</p>
        <p className="text-muted">{formatTime(sale.soldAt)}</p>
      </div>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{car}</p>
        <p className="text-muted">{sale.vehicle.version}</p>
      </div>
      <p className="min-w-0 break-words text-sm">{sale.customer.name}</p>
      <p className="text-sm text-muted">{PAYMENT_LABELS[sale.payment]}</p>
      <p className="font-display text-sm font-semibold tabular-nums">{formatCOPExact(sale.finalPrice)}</p>
      <div>
        <Link
          to={page > 1 ? `/admin/ventas/${sale.id}?page=${page}` : `/admin/ventas/${sale.id}`}
          aria-label={`Ver el detalle de la venta de ${car} a ${sale.customer.name}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Ver detalle
        </Link>
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando ventas" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0', rowGrid)}>
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  )
}

/** Historial de ventas, solo admin (ver la ruta). La lista lleva únicamente el nombre del cliente. */
export function HistorialPage() {
  const [params, setParams] = useSearchParams()
  const page = useMemo(() => parsePage(params.get('page')), [params])
  const list = useQuery({ ...historialQuery(page), placeholderData: keepPreviousData })

  useEffect(() => {
    document.title = 'Historial de ventas | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  // La URL manda: si traía basura (página 0, "1e3", otros parámetros) se deja en su forma limpia.
  useEffect(() => {
    const clean = page > 1 ? `page=${page}` : ''
    if (params.toString() !== clean) setParams(clean ? { page: String(page) } : {}, { replace: true })
  }, [params, page, setParams])

  // Si la página pedida ya no existe, se vuelve a la última que sí.
  useEffect(() => {
    if (list.isSuccess && !list.isPlaceholderData && list.data.data.length === 0 && page > 1) {
      setParams({ page: String(Math.max(1, Math.min(page - 1, list.data.meta.pages || 1))) })
    }
  }, [list.isSuccess, list.isPlaceholderData, list.data, page, setParams])

  const rows = list.data?.data ?? []
  const total = list.isPlaceholderData ? undefined : list.data?.meta.total

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Historial de ventas</h1>
          <p className="mt-1 text-muted" aria-live="polite">
            {total === undefined ? (list.data ? 'Actualizando…' : 'Cargando ventas…') : `${total} ${total === 1 ? 'venta' : 'ventas'}. Las horas son de Bogotá.`}
          </p>
        </div>
        <Link to="/admin/ventas/nueva" className={buttonVariants({ variant: 'outline' })}>
          Registrar venta
        </Link>
      </header>

      {list.isPending && <ListSkeleton />}

      {list.isError && !list.data && (
        <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium">No pudimos cargar el historial</p>
          <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
          <Button className="mt-5" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && page === 1 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <Receipt size={32} aria-hidden="true" className="mx-auto text-muted" />
          <p className="mt-3 font-medium">Todavía no hay ventas registradas</p>
          <p className="mt-1 text-sm text-muted">Cuando registres la primera, aparecerá aquí con su detalle.</p>
          <Link to="/admin/ventas/nueva" className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}>
            Registrar una venta
          </Link>
        </div>
      )}

      {list.isSuccess && rows.length > 0 && (
        <>
          <div aria-hidden="true" className={cn('hidden gap-4 px-4 pb-2 text-xs text-muted md:grid', rowGrid)}>
            <span>Fecha</span>
            <span>Vehículo</span>
            <span>Cliente</span>
            <span>Pago</span>
            <span>Precio final</span>
            <span>Detalle</span>
          </div>
          <ul
            aria-label="Ventas"
            aria-busy={list.isFetching}
            className={cn('rounded-xl border border-border bg-surface', list.isPlaceholderData && 'opacity-60 transition-opacity')}
          >
            {rows.map((sale) => (
              <Row key={sale.id} sale={sale} page={page} />
            ))}
          </ul>
          <Pagination
            page={list.data.meta.page}
            pages={list.data.meta.pages}
            onChange={(next) => setParams(next > 1 ? { page: String(next) } : {})}
          />
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando {rows.length} de {list.data.meta.total}. El correo del cliente está en el detalle de cada venta.
          </p>
        </>
      )}
    </div>
  )
}
