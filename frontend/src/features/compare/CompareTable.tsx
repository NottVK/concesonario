import { isAxiosError } from 'axios'
import { Check, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { VehicleWithBrand } from '@/api/types'
import { CarImage } from '@/components/CarImage'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FUEL_LABELS, STATUS_LABELS, TRANSMISSION_LABELS, formatKm } from '@/lib/labels'
import { cn, formatCOP } from '@/lib/utils'
import { bestIds } from './compare'
import type { Metric } from './compare'

export type CompareColumn =
  | { id: number; kind: 'loading' }
  | { id: number; kind: 'missing' }
  | { id: number; kind: 'error'; error: unknown; retry: () => void }
  | { id: number; kind: 'vehicle'; vehicle: VehicleWithBrand }

interface Row {
  key: string
  label: string
  /** Para las filas con "mejor valor": qué se considera mejor, dicho con palabras. */
  hint?: string
  metric?: Metric
  value: (vehicle: VehicleWithBrand) => string
}

const ROWS: Row[] = [
  { key: 'version', label: 'Versión', value: (v) => v.version },
  { key: 'price', label: 'Precio', hint: 'Menor es mejor', metric: 'price', value: (v) => formatCOP(v.price) },
  { key: 'year', label: 'Año', hint: 'Más reciente es mejor', metric: 'year', value: (v) => String(v.year) },
  { key: 'mileage', label: 'Kilometraje', hint: 'Menor es mejor', metric: 'mileage', value: (v) => formatKm(v.mileage) },
  { key: 'fuel', label: 'Combustible', value: (v) => FUEL_LABELS[v.fuel] },
  { key: 'transmission', label: 'Transmisión', value: (v) => TRANSMISSION_LABELS[v.transmission] },
  { key: 'color', label: 'Color', value: (v) => v.color },
  { key: 'status', label: 'Estado', value: (v) => STATUS_LABELS[v.status] },
]

const cell = 'border-b border-border px-4 py-3 align-top text-sm'
/** La primera columna queda fija al desplazar; el fondo opaco evita que se transparente el contenido. */
const stickyCell = 'sticky left-0 z-10 border-r border-border bg-background'

/** Marca de "mejor valor": lleva icono y texto, así no depende solo del color. */
function BestBadge() {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
      <Check size={12} aria-hidden="true" />
      Mejor
      <span className="sr-only"> valor de esta fila</span>
    </span>
  )
}

function Header({ column, onRemove }: { column: CompareColumn; onRemove: (id: number) => void }) {
  const remove = (label: string) => (
    <Button
      variant="ghost"
      size="sm"
      className="-mr-2 shrink-0"
      aria-label={`Quitar ${label} de la comparación`}
      onClick={() => onRemove(column.id)}
    >
      <X size={14} aria-hidden="true" />
      Quitar
    </Button>
  )

  if (column.kind === 'loading') {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="aspect-[16/10] rounded-lg" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }
  if (column.kind === 'missing') {
    return (
      <div className="space-y-3">
        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-border text-muted">
          <TriangleAlert size={28} aria-hidden="true" />
        </div>
        <p className="font-semibold">Este vehículo ya no existe</p>
        <p className="text-sm text-muted">El enlace apuntaba al vehículo n.º {column.id}.</p>
        {remove(`el vehículo n.º ${column.id}`)}
      </div>
    )
  }
  if (column.kind === 'error') {
    const offline = isAxiosError(column.error) && !column.error.response
    return (
      <div className="space-y-3">
        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-border text-muted">
          <TriangleAlert size={28} aria-hidden="true" />
        </div>
        <p role="alert" className="font-semibold">
          No pudimos cargar el vehículo n.º {column.id}
        </p>
        <p className="text-sm text-muted">{offline ? 'Revisa tu conexión e inténtalo de nuevo.' : 'Inténtalo de nuevo en un momento.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={column.retry}>
            Reintentar
          </Button>
          {remove(`el vehículo n.º ${column.id}`)}
        </div>
      </div>
    )
  }

  const { vehicle } = column
  const title = `${vehicle.brand.name} ${vehicle.model}`
  const sold = vehicle.status === 'vendido'
  return (
    <div className="space-y-3">
      <Link to={`/catalogo/${vehicle.id}`} tabIndex={-1} aria-hidden="true" className={cn('block', sold && 'opacity-50')}>
        <CarImage src={vehicle.images[0]} alt="" className="rounded-lg border border-border" />
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/catalogo/${vehicle.id}`} className="font-display text-lg font-semibold leading-snug hover:underline">
            {title}
          </Link>
          <p className="text-sm text-muted">{vehicle.year}</p>
        </div>
        {remove(title)}
      </div>
      {sold && (
        <p className="rounded-md border border-border px-3 py-2 text-sm">
          <span className="font-semibold">Vendido.</span> Ya no está disponible y no cuenta para el mejor valor.
        </p>
      )}
    </div>
  )
}

function Cell({ column, row, best }: { column: CompareColumn; row: Row; best: Record<Metric, Set<number>> }) {
  if (column.kind !== 'vehicle') {
    return (
      <td className={cn(cell, 'text-muted')}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin datos</span>
      </td>
    )
  }
  const { vehicle } = column
  const isBest = row.metric ? best[row.metric].has(vehicle.id) : false
  return (
    <td className={cn(cell, vehicle.status === 'vendido' && 'text-muted')}>
      <span className={cn(isBest && 'font-semibold', row.key === 'price' && 'font-display text-base text-accent')}>
        {row.value(vehicle)}
      </span>
      {isBest && (
        <>
          <br />
          <BestBadge />
        </>
      )}
    </td>
  )
}

interface CompareTableProps {
  columns: CompareColumn[]
  onRemove: (id: number) => void
}

/**
 * Tabla con su propio desplazamiento horizontal (la página no se ensancha en móvil) y la primera
 * columna fija. La región es enfocable para poder desplazarla con el teclado.
 */
export function CompareTable({ columns, onRemove }: CompareTableProps): ReactNode {
  const best = bestIds(columns.flatMap((column) => (column.kind === 'vehicle' ? [column.vehicle] : [])))
  return (
    <div
      role="region"
      aria-label="Comparación de vehículos; desplázate horizontalmente para ver todos"
      tabIndex={0}
      // `relative` contiene a los textos sr-only (position:absolute): sin esto escapan del recorte y ensanchan la página.
      className="relative max-w-full overflow-x-auto rounded-xl border border-border"
    >
      <table className="w-full min-w-max border-separate border-spacing-0">
        <caption className="sr-only">Comparación de {columns.length} vehículos, fila por fila</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(cell, stickyCell, 'z-20 w-32 min-w-32 text-left font-normal text-muted sm:w-44 sm:min-w-44')}>
              <span className="sr-only">Característica</span>
            </th>
            {columns.map((column) => (
              <th key={column.id} scope="col" className={cn(cell, 'w-64 min-w-64 text-left font-normal')}>
                <Header column={column} onRemove={onRemove} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={cn(cell, stickyCell, 'text-left font-medium')}>
                {row.label}
                {row.hint && <span className="mt-0.5 block text-xs font-normal text-muted">{row.hint}</span>}
              </th>
              {columns.map((column) => (
                <Cell key={column.id} column={column} row={row} best={best} />
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className={cn(cell, stickyCell, 'border-b-0 text-left font-medium')}>
              Ver más
            </th>
            {columns.map((column) => (
              <td key={column.id} className={cn(cell, 'border-b-0')}>
                {column.kind === 'vehicle' && column.vehicle.status !== 'vendido' && (
                  <Link to={`/catalogo/${column.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                    Ver detalle
                  </Link>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
