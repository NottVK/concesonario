import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { CarFront, CircleCheck, Plus, Tag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { brandsQuery } from '@/api/queries'
import { errorMessage } from '@/api/client'
import type { VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CarImage } from '@/components/CarImage'
import { Pagination } from '@/features/catalog/Pagination'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { formatKm, STATUS_LABELS } from '@/lib/labels'
import { cn, formatCOP } from '@/lib/utils'
import { INVENTARIO_KEY, inventarioQuery } from './api'
import { DeleteDialog } from './DeleteDialog'
import {
  MODEL_SEARCH_MAX,
  cleanModelSearch,
  isDefaultInventarioFilters,
  parseInventarioFilters,
  toInventarioApiParams,
  toInventarioSearchParams,
} from './filters'
import type { InventarioFilters, StatusFilter } from './filters'
import { VehicleDialog } from './VehicleDialog'
import type { DialogMode } from './VehicleDialog'

const TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'nuevo', label: 'Nuevos' },
  { value: 'usado', label: 'Usados' },
  { value: 'vendido', label: 'Vendidos' },
]

const rowGrid = 'md:grid-cols-[5.5rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_9rem_11rem] md:items-center'

/** Estado con texto, icono y forma del borde: no depende solo del color. */
function StatusBadge({ status }: { status: VehicleWithBrand['status'] }) {
  const Icon = status === 'vendido' ? CircleCheck : Tag
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        status === 'nuevo' && 'border-accent bg-accent text-accent-foreground',
        status === 'usado' && 'border-dashed border-foreground',
        status === 'vendido' && 'border-border text-muted line-through decoration-1',
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}

function Row({ vehicle, onEdit, onDelete }: { vehicle: VehicleWithBrand; onEdit: () => void; onDelete: () => void }) {
  const name = `${vehicle.brand.name} ${vehicle.model} ${vehicle.year}`
  const sold = vehicle.status === 'vendido'
  return (
    <li className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:gap-4', rowGrid)}>
      <CarImage src={vehicle.images[0]} alt={`Foto de ${name}`} className="w-24 rounded-md md:w-full" />
      <div className="min-w-0 text-sm">
        <Link to={`/catalogo/${vehicle.id}`} className="font-medium hover:underline">
          {name}
        </Link>
        <p className="text-muted">
          {vehicle.version} · {vehicle.color}
        </p>
      </div>
      <p className="text-sm text-muted">{formatKm(vehicle.mileage)}</p>
      <div>
        <StatusBadge status={vehicle.status} />
      </div>
      <p className="font-display text-sm font-semibold tabular-nums">{formatCOP(vehicle.price)}</p>
      <div className="flex flex-wrap gap-2">
        {sold ? (
          <span className="text-sm text-muted">Con venta: sin cambios</span>
        ) : (
          <>
            <Button size="sm" variant="outline" aria-label={`Editar ${name}`} onClick={onEdit}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Borrar ${name}`} onClick={onDelete}>
              Borrar
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando inventario" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0', rowGrid)}>
          <Skeleton className="h-14 w-24 md:w-full" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-9 w-40" />
        </li>
      ))}
    </ul>
  )
}

/** Inventario completo (vendidos incluidos) con alta, edición y borrado. Solo admin (ver la ruta). */
export function InventarioPage() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseInventarioFilters(params), [params])
  const queryClient = useQueryClient()
  const brands = useQuery(brandsQuery())
  const [search, setSearch] = useState('')
  const model = cleanModelSearch(useDebouncedValue(search, 350))
  const [dialog, setDialog] = useState<DialogMode | null>(null)
  const [deleting, setDeleting] = useState<VehicleWithBrand | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const list = useQuery({ ...inventarioQuery(toInventarioApiParams(filters, model)), placeholderData: keepPreviousData })

  useEffect(() => {
    document.title = 'Inventario | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  // La URL manda: si traía basura (estado desconocido, marca imposible, página enorme) se deja en su forma limpia.
  useEffect(() => {
    const clean = toInventarioSearchParams(filters).toString()
    if (params.toString() !== clean) setParams(toInventarioSearchParams(filters), { replace: true })
  }, [params, filters, setParams])

  // Si al borrar el último de una página esta queda vacía, se vuelve a la anterior.
  useEffect(() => {
    if (list.isSuccess && !list.isPlaceholderData && list.data.data.length === 0 && filters.page > 1) {
      setParams(toInventarioSearchParams({ ...filters, page: Math.max(1, Math.min(filters.page - 1, list.data.meta.pages || 1)) }))
    }
  }, [list.isSuccess, list.isPlaceholderData, list.data, filters, setParams])

  const update = (patch: Partial<InventarioFilters>, keepPage = false): void => {
    setDone(null)
    setParams(toInventarioSearchParams({ ...filters, ...patch, page: keepPage ? (patch.page ?? filters.page) : 1 }))
  }
  /** Tras cualquier cambio: el inventario, el catálogo público y las métricas dejan de ser ciertos. */
  const refresh = (): Promise<void[]> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: INVENTARIO_KEY }),
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'metricas'] }),
    ])

  const rows = list.data?.data ?? []
  const total = list.isPlaceholderData ? undefined : list.data?.meta.total
  const filtered = !isDefaultInventarioFilters(filters) || model !== ''
  const clearAll = (): void => {
    setSearch('')
    update({ status: 'all', brandId: 0 })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Inventario</h1>
          <p className="mt-1 text-muted" aria-live="polite">
            {total === undefined ? (list.data ? 'Actualizando…' : 'Cargando inventario…') : `${total} ${total === 1 ? 'vehículo' : 'vehículos'}`}
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus size={16} aria-hidden="true" />
          Agregar vehículo
        </Button>
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
                filters.status === tab.value ? 'border-accent bg-accent text-accent-foreground' : 'border-border hover:border-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Marca</span>
          <select
            value={filters.brandId}
            onChange={(event) => update({ brandId: Number(event.target.value) })}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value={0}>Todas las marcas</option>
            {brands.data?.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Buscar por modelo</span>
          <input
            type="search"
            role="searchbox"
            autoComplete="off"
            maxLength={MODEL_SEARCH_MAX}
            value={search}
            onChange={(event) => {
              setDone(null)
              setSearch(event.target.value)
              if (filters.page > 1) setParams(toInventarioSearchParams({ ...filters, page: 1 }), { replace: true })
            }}
            className="h-10 w-56 rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        {filtered && (
          <Button variant="ghost" onClick={clearAll}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {done && (
        <div role="status" className="mb-4 flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-3 text-sm">
          <p>{done}</p>
          <Button variant="ghost" size="sm" onClick={() => setDone(null)}>
            Entendido
          </Button>
        </div>
      )}

      {list.isPending && <ListSkeleton />}

      {list.isError && !list.data && (
        <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium">No pudimos cargar el inventario</p>
          <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
          <Button className="mt-5" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <CarFront size={32} aria-hidden="true" className="mx-auto text-muted" />
          <p className="mt-3 font-medium">{filtered ? 'No hay vehículos con estos filtros' : 'Todavía no hay vehículos en el inventario'}</p>
          <p className="mt-1 text-sm text-muted">{filtered ? 'Prueba con otro estado, otra marca u otro modelo.' : 'Agrega el primero para que aparezca en el catálogo.'}</p>
          <Button variant="outline" className="mt-5" onClick={() => (filtered ? clearAll() : setDialog({ kind: 'create' }))}>
            {filtered ? 'Limpiar filtros' : 'Agregar vehículo'}
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length > 0 && (
        <>
          <div aria-hidden="true" className={cn('hidden gap-4 px-4 pb-2 text-xs text-muted md:grid', rowGrid)}>
            <span>Foto</span>
            <span>Vehículo</span>
            <span>Kilometraje</span>
            <span>Estado</span>
            <span>Precio</span>
            <span>Acciones</span>
          </div>
          <ul
            aria-label="Inventario"
            aria-busy={list.isFetching}
            className={cn('rounded-xl border border-border bg-surface', list.isPlaceholderData && 'opacity-60 transition-opacity')}
          >
            {rows.map((vehicle) => (
              <Row key={vehicle.id} vehicle={vehicle} onEdit={() => setDialog({ kind: 'edit', vehicle })} onDelete={() => setDeleting(vehicle)} />
            ))}
          </ul>
          <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onChange={(page) => update({ page }, true)} />
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando {rows.length} de {list.data.meta.total}.
          </p>
        </>
      )}

      <VehicleDialog
        mode={dialog}
        onClose={() => setDialog(null)}
        onStale={() => void refresh()}
        onSaved={(saved, created) => {
          setDialog(null)
          setDone(created ? `${saved.brand.name} ${saved.model} ${saved.year} agregado al inventario.` : `Cambios de ${saved.brand.name} ${saved.model} ${saved.year} guardados.`)
          void refresh()
        }}
      />
      <DeleteDialog
        vehicle={deleting}
        onClose={() => setDeleting(null)}
        onStale={() => void refresh()}
        onDeleted={(removed) => {
          setDeleting(null)
          setDone(`${removed.brand.name} ${removed.model} ${removed.year} borrado del inventario.`)
          void refresh()
        }}
      />
    </div>
  )
}
