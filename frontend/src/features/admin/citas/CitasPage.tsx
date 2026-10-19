import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarX2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/features/catalog/Pagination'
import { formatShortDate, formatTime } from '@/lib/bogota'
import { cn } from '@/lib/utils'
import { citasQuery } from './api'
import type { AppointmentRow } from './api'
import {
  isDefaultCitasFilters,
  parseCitasFilters,
  toCitasApiParams,
  toCitasSearchParams,
  validDay,
} from './filters'
import type { CitasFilters, StatusFilter } from './filters'
import { StatusBadge } from './StatusBadge'
import { StatusDialog } from './StatusDialog'
import type { StatusTarget } from './StatusDialog'

const TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'cancelada', label: 'Canceladas' },
  { value: 'all', label: 'Todas' },
]

/** "12 citas pendientes", "1 cita confirmada", "3 citas". */
function countLabel(total: number, status: StatusFilter): string {
  const noun = total === 1 ? 'cita' : 'citas'
  if (status === 'all') return `${total} ${noun}`
  const adjective = { pendiente: 'pendiente', confirmada: 'confirmada', cancelada: 'cancelada' }[status]
  return `${total} ${noun} ${adjective}${total === 1 ? '' : 's'}`
}

const dateInput = 'h-10 rounded-md border border-border bg-background px-3 text-sm'
const rowGrid = 'md:grid-cols-[12rem_minmax(0,1.3fr)_minmax(0,1.1fr)_8.5rem_12rem] md:items-start'

function endTime(row: AppointmentRow): string {
  return formatTime(new Date(new Date(row.scheduledAt).getTime() + row.durationMin * 60_000))
}

function CitaRow({ row, now, onAction }: { row: AppointmentRow; now: number; onAction: (target: StatusTarget) => void }) {
  const past = new Date(row.scheduledAt).getTime() < now && row.status !== 'cancelada'
  const who = `${row.customer.name}, ${formatShortDate(row.scheduledAt)} ${formatTime(row.scheduledAt)}`
  return (
    <li className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:gap-4', rowGrid)}>
      <div>
        <p className="font-medium">{formatShortDate(row.scheduledAt)}</p>
        <p className="text-sm text-muted">
          {formatTime(row.scheduledAt)} a {endTime(row)}
        </p>
        {past && <p className="mt-1 text-xs font-medium">Ya pasó</p>}
      </div>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{row.customer.name}</p>
        <p className="break-all text-muted">{row.customer.email}</p>
        {row.customer.phone && <p className="text-muted">{row.customer.phone}</p>}
      </div>
      <div className="min-w-0 text-sm">
        <Link to={`/catalogo/${row.vehicleId}`} className="font-medium hover:underline">
          {row.vehicle.brand.name} {row.vehicle.model} {row.vehicle.year}
        </Link>
        <p className="text-muted">{row.vehicle.version}</p>
      </div>
      <div>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        {row.status === 'pendiente' && (
          <Button size="sm" aria-label={`Confirmar la cita de ${who}`} onClick={() => onAction({ appointment: row, to: 'confirmada' })}>
            Confirmar
          </Button>
        )}
        {row.status !== 'cancelada' && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Cancelar la cita de ${who}`}
            onClick={() => onAction({ appointment: row, to: 'cancelada' })}
          >
            Cancelar
          </Button>
        )}
        {row.status === 'cancelada' && <span className="text-sm text-muted">Sin acciones</span>}
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando citas" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0', rowGrid)}>
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-9 w-40" />
        </li>
      ))}
    </ul>
  )
}

export function CitasPage() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseCitasFilters(params), [params])
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<StatusTarget | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // "Ahora" se fija al cargar la lista: sirve para marcar las citas que ya pasaron.
  const [now, setNow] = useState(() => Date.now())

  // Solo el personal con sesión pide datos de clientes (el backend lo exige igual).
  const allowed = auth.status === 'authenticated' && (auth.user?.role === 'admin' || auth.user?.role === 'vendedor')
  const list = useQuery({ ...citasQuery(toCitasApiParams(filters)), enabled: allowed, placeholderData: keepPreviousData })

  useEffect(() => {
    document.title = 'Citas | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  // La URL manda: si traía basura (estado desconocido, fecha imposible, rango al revés) se deja en su forma limpia.
  useEffect(() => {
    const clean = toCitasSearchParams(filters).toString()
    if (params.toString() !== clean) setParams(toCitasSearchParams(filters), { replace: true })
  }, [params, filters, setParams])

  useEffect(() => {
    if (list.dataUpdatedAt) setNow(Date.now())
  }, [list.dataUpdatedAt])

  // Si al atender la última cita de una página esta queda vacía, se vuelve a la anterior.
  useEffect(() => {
    if (list.isSuccess && !list.isPlaceholderData && list.data.data.length === 0 && filters.page > 1) {
      setParams(toCitasSearchParams({ ...filters, page: Math.max(1, Math.min(filters.page - 1, list.data.meta.pages || 1)) }))
    }
  }, [list.isSuccess, list.isPlaceholderData, list.data, filters, setParams])

  const update = (patch: Partial<CitasFilters>, keepPage = false): void => {
    setDone(null)
    setParams(toCitasSearchParams({ ...filters, ...patch, page: keepPage ? (patch.page ?? filters.page) : 1 }))
  }
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['admin', 'citas', 'list'] })

  const finish = (finished: StatusTarget): void => {
    const name = finished.appointment.customer.name
    setTarget(null)
    setDone(
      finished.to === 'confirmada'
        ? `Cita de ${name} confirmada. Ahora aparece en Confirmadas.`
        : `Cita de ${name} cancelada. La hora quedó libre.`,
    )
    void refresh()
  }

  const rows = list.data?.data ?? []
  // Con placeholderData, mientras llega el nuevo filtro `list.data` aún es el anterior: no se muestra su total con la etiqueta nueva.
  const total = list.isPlaceholderData ? undefined : list.data?.meta.total
  const filtered = !isDefaultCitasFilters(filters)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Citas</h1>
        <p className="mt-1 text-muted" aria-live="polite">
          {total === undefined ? (list.data ? 'Actualizando…' : 'Cargando citas…') : countLabel(total, filters.status)}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filters.status === tab.value}
              onClick={() => update({ status: tab.value })}
              className={cn(
                'h-10 rounded-full border px-4 text-sm font-medium transition-colors duration-200',
                filters.status === tab.value
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border hover:border-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Desde</span>
            <input
              type="date"
              value={filters.from}
              min="2000-01-01"
              max="2100-12-31"
              onChange={(event) => update({ from: validDay(event.target.value) })}
              className={dateInput}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Hasta</span>
            <input
              type="date"
              value={filters.to}
              min="2000-01-01"
              max="2100-12-31"
              onChange={(event) => update({ to: validDay(event.target.value) })}
              className={dateInput}
            />
          </label>
          {filtered && (
            <Button variant="ghost" onClick={() => update({ status: 'pendiente', from: '', to: '' })}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {done && (
        <div role="status" className="mb-4 flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-3 text-sm">
          <p>{done}</p>
          <Button variant="ghost" size="sm" onClick={() => setDone(null)}>
            Entendido
          </Button>
        </div>
      )}

      {list.isPending && allowed && <ListSkeleton />}

      {list.isError && !list.data && (
        <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium">No pudimos cargar las citas</p>
          <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
          <Button className="mt-5" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <CalendarX2 size={32} aria-hidden="true" className="mx-auto text-muted" />
          <p className="mt-3 font-medium">
            {filtered ? 'No hay citas con estos filtros' : 'No hay citas pendientes: todo está al día'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {filtered ? 'Prueba con otro estado o con otro rango de fechas.' : 'Cuando alguien agende un test-drive aparecerá aquí.'}
          </p>
          <Button variant="outline" className="mt-5" onClick={() => update(filtered ? { status: 'pendiente', from: '', to: '' } : { status: 'all' })}>
            {filtered ? 'Volver a las pendientes' : 'Ver todas las citas'}
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length > 0 && (
        <>
          <div aria-hidden="true" className={cn('hidden gap-4 px-4 pb-2 text-xs text-muted md:grid', rowGrid)}>
            <span>Fecha y hora</span>
            <span>Cliente</span>
            <span>Vehículo</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>
          <ul
            aria-label="Citas"
            aria-busy={list.isFetching}
            className={cn('rounded-xl border border-border bg-surface', list.isPlaceholderData && 'opacity-60 transition-opacity')}
          >
            {rows.map((row) => (
              <CitaRow key={row.id} row={row} now={now} onAction={setTarget} />
            ))}
          </ul>
          <Pagination
            page={list.data.meta.page}
            pages={list.data.meta.pages}
            onChange={(page) => update({ page }, true)}
          />
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando {rows.length} de {list.data.meta.total}. Las horas son de Bogotá.
          </p>
        </>
      )}

      <StatusDialog target={target} onClose={() => setTarget(null)} onDone={finish} onStale={() => void refresh()} />
    </div>
  )
}

