import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/client'
import type { Customer, VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/features/catalog/Pagination'
import { formatKm } from '@/lib/labels'
import { formatCOP } from '@/lib/utils'
import { SearchBox, useSearchTerm } from '../search'
import { clientesQuery } from '../clientes/api'
import { PICKER_PAGE_SIZE, sellableVehiclesQuery } from './api'
import { vehicleName } from './ConfirmSaleDialog'

const listClass = 'divide-y divide-border rounded-xl border border-border bg-surface'

function PickerSkeleton({ label }: { label: string }) {
  return (
    <ul aria-busy="true" aria-label={label} className={listClass}>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="px-4 py-3">
          <Skeleton className="h-10 w-full" />
        </li>
      ))}
    </ul>
  )
}

function PickerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-border bg-surface p-5 text-center text-sm">
      <p>{message}</p>
      <Button className="mt-3" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

/** Vehículos que se pueden vender (nunca vendidos), con búsqueda por modelo. */
export function VehiclePicker({ onChoose }: { onChoose: (vehicle: VehicleWithBrand) => void }) {
  const { text, setText, term, tooShort } = useSearchTerm()
  const [page, setPage] = useState(1)
  const list = useQuery({ ...sellableVehiclesQuery(term, page), placeholderData: keepPreviousData })
  const rows = list.data?.data ?? []

  return (
    <div>
      <SearchBox
        id="venta-vehiculo"
        label="Buscar vehículo"
        placeholder="Modelo, por ejemplo Mazda 3"
        value={text}
        tooShort={tooShort}
        onChange={(value) => {
          setText(value)
          setPage(1)
        }}
      />
      {list.isPending && <PickerSkeleton label="Cargando vehículos" />}
      {list.isError && !list.data && <PickerError message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.isSuccess && rows.length === 0 && (
        <p className="rounded-xl border border-border bg-surface p-5 text-center text-sm">
          {term ? 'No hay vehículos disponibles con ese modelo.' : 'No hay vehículos disponibles para vender.'}
        </p>
      )}
      {list.isSuccess && rows.length > 0 && (
        <>
          <ul aria-label="Vehículos disponibles" aria-busy={list.isFetching} className={listClass}>
            {rows.map((vehicle) => (
              <li key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{vehicleName(vehicle)}</p>
                  <p className="text-muted">
                    {vehicle.version} · {formatKm(vehicle.mileage)} · {formatCOP(vehicle.price)}
                  </p>
                </div>
                <Button size="sm" variant="outline" aria-label={`Elegir ${vehicle.model} ${vehicle.year} ${vehicle.version}`} onClick={() => onChoose(vehicle)}>
                  Elegir
                </Button>
              </li>
            ))}
          </ul>
          {list.data.meta.pages > 1 && (
            <div className="-mt-6">
              <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Cliente que compra: se busca por nombre o correo en el servidor. El texto solo vive en el estado de la página. */
export function CustomerPicker({ enabled, onChoose }: { enabled: boolean; onChoose: (customer: Customer) => void }) {
  const { text, setText, term, tooShort } = useSearchTerm()
  const list = useQuery({
    ...clientesQuery({ q: term, page: 1, limit: PICKER_PAGE_SIZE }),
    enabled: enabled && term !== '',
    placeholderData: keepPreviousData,
  })
  const rows = term ? (list.data?.data ?? []) : []

  return (
    <div>
      <SearchBox id="venta-cliente" label="Buscar cliente" value={text} tooShort={tooShort} onChange={setText} />
      {term === '' && <p className="text-sm text-muted">Escribe el nombre o el correo del cliente para buscarlo.</p>}
      {term !== '' && list.isPending && <PickerSkeleton label="Buscando clientes" />}
      {term !== '' && list.isError && !list.data && <PickerError message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {term !== '' && list.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-5 text-center text-sm">
          <p className="font-medium">No hay clientes que coincidan</p>
          <p className="mt-1 text-muted">El cliente debe estar registrado antes: se registra al agendar una cita.</p>
        </div>
      )}
      {rows.length > 0 && (
        <ul aria-label="Clientes encontrados" aria-busy={list.isFetching} className={listClass}>
          {rows.map((customer) => (
            <li key={customer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{customer.name}</p>
                <p className="break-all text-muted">{customer.email}</p>
              </div>
              <Button size="sm" variant="outline" aria-label={`Elegir a ${customer.name}`} onClick={() => onChoose(customer)}>
                Elegir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
