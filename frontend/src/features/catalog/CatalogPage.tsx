import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { brandsQuery, vehiclesQuery } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { FiltersPanel } from './FiltersPanel'
import { Pagination } from './Pagination'
import { VehicleCard, VehicleCardSkeleton } from './VehicleCard'
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  SORT_OPTIONS,
  activeFilterCount,
  parseFilters,
  toApiParams,
  toSearchParams,
} from './filters'
import type { CatalogFilters, SortValue } from './filters'

/** Si el mínimo supera al máximo se intercambian, en vez de enviar un rango que la API rechaza. */
function orderedRange<K extends 'price' | 'year'>(patch: Partial<CatalogFilters>, key: K): Partial<CatalogFilters> {
  const minKey = `${key}Min` as const
  const maxKey = `${key}Max` as const
  const min = patch[minKey]
  const max = patch[maxKey]
  if (min && max && Number(min) > Number(max)) return { ...patch, [minKey]: max, [maxKey]: min }
  return patch
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFilters(searchParams)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const resultsRef = useRef<HTMLHeadingElement>(null)

  const brands = useQuery(brandsQuery())
  const vehicles = useQuery({ ...vehiclesQuery(toApiParams(filters)), placeholderData: keepPreviousData })
  const activeCount = activeFilterCount(filters)

  const update = (patch: Partial<CatalogFilters>, keepPage = false) => {
    const next = { ...filters, ...orderedRange(orderedRange(patch, 'price'), 'year') }
    if (!keepPage) next.page = 1
    setSearchParams(toSearchParams(next))
  }

  // Al cambiar de página se vuelve al inicio de los resultados.
  useEffect(() => {
    if (filters.page > 1) resultsRef.current?.scrollIntoView({ block: 'start' })
  }, [filters.page])

  const total = vehicles.data?.meta.total
  const showSkeletons = vehicles.isPending
  const isEmpty = vehicles.isSuccess && vehicles.data.data.length === 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Catálogo</h1>
        <p className="mt-2 text-muted" aria-live="polite">
          {total === undefined ? 'Cargando vehículos…' : `${total} ${total === 1 ? 'vehículo disponible' : 'vehículos disponibles'}`}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Button
            variant="outline"
            className="mb-4 w-full lg:hidden"
            aria-expanded={filtersOpen}
            aria-controls="panel-filtros"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
          <div id="panel-filtros" className={filtersOpen ? 'block' : 'hidden lg:block'}>
            <FiltersPanel
              filters={filters}
              brands={brands.data}
              activeCount={activeCount}
              onChange={update}
              onClear={() => setSearchParams(toSearchParams({ ...EMPTY_FILTERS, sort: filters.sort }))}
            />
          </div>
        </aside>

        <section aria-labelledby="resultados">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h2 id="resultados" ref={resultsRef} className="scroll-mt-24 text-lg font-semibold">
              Resultados
            </h2>
            <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
              <span className="shrink-0 text-muted">Ordenar por</span>
              <select
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as SortValue })}
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm sm:flex-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {vehicles.isError && !vehicles.data && (
            <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="font-medium">No pudimos cargar el catálogo</p>
              <p className="mt-1 text-sm text-muted">{errorMessage(vehicles.error)}</p>
              <Button className="mt-5" onClick={() => void vehicles.refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {isEmpty && (
            <div className="rounded-xl border border-border bg-surface p-10 text-center">
              <p className="font-medium">Ningún vehículo coincide con estos filtros</p>
              <p className="mt-1 text-sm text-muted">Prueba con otro rango de precio o quita algún filtro.</p>
              <Button variant="outline" className="mt-5" onClick={() => setSearchParams(new URLSearchParams())}>
                Ver todo el catálogo
              </Button>
            </div>
          )}

          {(showSkeletons || (vehicles.data && !isEmpty)) && (
            <ul
              aria-busy={vehicles.isFetching}
              className={`grid gap-6 sm:grid-cols-2 xl:grid-cols-3 ${vehicles.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}
            >
              {showSkeletons
                ? Array.from({ length: PAGE_SIZE }, (_, i) => <VehicleCardSkeleton key={i} />)
                : vehicles.data?.data.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}
            </ul>
          )}

          {vehicles.data && (
            <Pagination
              page={vehicles.data.meta.page}
              pages={vehicles.data.meta.pages}
              onChange={(page) => update({ page }, true)}
            />
          )}
        </section>
      </div>
    </div>
  )
}
