import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import type { Customer } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { parsePage } from '@/features/catalog/filters'
import { Pagination } from '@/features/catalog/Pagination'
import { cn } from '@/lib/utils'
import { SearchBox, useSearchTerm } from '../search'
import { CLIENTES_PAGE_SIZE, clientesQuery } from './api'
import { EditDialog } from './EditDialog'
import { NO_PHONE } from './validation'

const rowGrid = 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_8rem] md:items-center'

/** "12 clientes", "1 cliente". */
const countLabel = (total: number): string => `${total} ${total === 1 ? 'cliente' : 'clientes'}`

function ClienteRow({ customer, onEdit }: { customer: Customer; onEdit: (customer: Customer) => void }) {
  return (
    <li className={cn('grid gap-2 border-b border-border px-4 py-4 last:border-b-0 md:gap-4', rowGrid)}>
      <h2 className="min-w-0 break-words text-base font-medium">{customer.name}</h2>
      <p className="min-w-0 break-all text-sm text-muted">{customer.email}</p>
      <p className="text-sm text-muted">{customer.phone ?? NO_PHONE}</p>
      <div>
        <Button size="sm" variant="outline" aria-label={`Editar a ${customer.name}`} onClick={() => onEdit(customer)}>
          Editar
        </Button>
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando clientes" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0', rowGrid)}>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-8 w-20" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Clientes del concesionario: lista paginada con búsqueda y edición. No hay borrado (un cliente puede tener
 * citas y ventas). Los datos personales viven solo en memoria: la URL lleva únicamente la página.
 */
export function ClientesPage() {
  const [params, setParams] = useSearchParams()
  const page = useMemo(() => parsePage(params.get('page')), [params])
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { text: search, setText: setSearch, term, tooShort } = useSearchTerm()
  const [editing, setEditing] = useState<Customer | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Solo el personal con sesión pide datos de clientes (el backend lo exige igual).
  const allowed = auth.status === 'authenticated' && (auth.user?.role === 'admin' || auth.user?.role === 'vendedor')
  const apiParams: Record<string, string | number> = { page, limit: CLIENTES_PAGE_SIZE, ...(term ? { q: term } : {}) }
  const list = useQuery({ ...clientesQuery(apiParams), enabled: allowed, placeholderData: keepPreviousData })

  useEffect(() => {
    document.title = 'Clientes | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  // La URL manda: si traía basura (página inválida, parámetros ajenos) se deja en su forma limpia.
  useEffect(() => {
    const clean = page > 1 ? `page=${page}` : ''
    if (params.toString() !== clean) setParams(new URLSearchParams(clean), { replace: true })
  }, [params, page, setParams])

  // Si la página pedida quedó vacía (por ejemplo tras una búsqueda), se vuelve a una que exista.
  useEffect(() => {
    if (list.isSuccess && !list.isPlaceholderData && list.data.data.length === 0 && page > 1) {
      setParams(new URLSearchParams(list.data.meta.pages > 1 ? `page=${Math.min(page - 1, list.data.meta.pages)}` : ''))
    }
  }, [list.isSuccess, list.isPlaceholderData, list.data, page, setParams])

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['admin', 'clientes'] })
  const goToPage = (next: number): void => setParams(new URLSearchParams(next > 1 ? `page=${next}` : ''))

  const rows = list.data?.data ?? []
  // Con placeholderData, mientras llega el nuevo filtro `list.data` aún es el anterior: no se muestra su total.
  const total = list.isPlaceholderData ? undefined : list.data?.meta.total
  const searching = term !== ''

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Clientes</h1>
        <p className="mt-1 text-muted" aria-live="polite">
          {total === undefined ? (list.data ? 'Actualizando…' : 'Cargando clientes…') : countLabel(total)}
        </p>
      </header>

      <SearchBox
        id="clientes-search"
        label="Buscar cliente"
        value={search}
        tooShort={tooShort}
        onChange={(value) => {
          setDone(null)
          setSearch(value)
          // Buscar otra cosa vuelve a la primera página.
          if (page > 1) setParams(new URLSearchParams(), { replace: true })
        }}
      />

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
          <p className="font-medium">No pudimos cargar los clientes</p>
          <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
          <Button className="mt-5" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <Users size={32} aria-hidden="true" className="mx-auto text-muted" />
          <p className="mt-3 font-medium">{searching ? 'No hay clientes que coincidan' : 'Todavía no hay clientes registrados'}</p>
          <p className="mt-1 text-sm text-muted">
            {searching ? 'Prueba con otro nombre o con otro correo.' : 'Los clientes aparecen aquí cuando alguien agenda un test-drive.'}
          </p>
          {searching && (
            <Button variant="outline" className="mt-5" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </Button>
          )}
        </div>
      )}

      {list.isSuccess && rows.length > 0 && (
        <>
          <div aria-hidden="true" className={cn('hidden gap-4 px-4 pb-2 text-xs text-muted md:grid', rowGrid)}>
            <span>Nombre</span>
            <span>Correo</span>
            <span>Teléfono</span>
            <span>Acciones</span>
          </div>
          <ul
            aria-label="Clientes"
            aria-busy={list.isFetching}
            className={cn('rounded-xl border border-border bg-surface', list.isPlaceholderData && 'opacity-60 transition-opacity')}
          >
            {rows.map((customer) => (
              <ClienteRow key={customer.id} customer={customer} onEdit={setEditing} />
            ))}
          </ul>
          <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onChange={goToPage} />
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando {rows.length} de {list.data.meta.total}.
          </p>
        </>
      )}

      <EditDialog
        customer={editing}
        onClose={() => setEditing(null)}
        onStale={() => void refresh()}
        onSaved={(saved) => {
          setEditing(null)
          setDone(`Cambios de ${saved.name} guardados.`)
          void refresh()
        }}
      />
    </div>
  )
}
