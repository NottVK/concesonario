import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { vehicleQuery } from '@/api/queries'
import type { VehicleWithBrand } from '@/api/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FUEL_LABELS, STATUS_LABELS, TRANSMISSION_LABELS, formatKm } from '@/lib/labels'
import { cn, formatCOP } from '@/lib/utils'
import { BookingDialog } from '@/features/booking/BookingDialog'
import { Gallery } from './Gallery'
import { LoanSimulator } from './LoanSimulator'

function Notice({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{children}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
    </section>
  )
}

const toCatalog = (to = '/catalogo') => (
  <Link to={to} className={buttonVariants()}>
    Ver el catálogo
  </Link>
)

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Skeleton className="aspect-[16/10] rounded-xl" />
        <Skeleton className="h-40" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

function Specs({ vehicle }: { vehicle: VehicleWithBrand }) {
  const rows: [string, string][] = [
    ['Marca', vehicle.brand.name],
    ['Modelo', vehicle.model],
    ['Versión', vehicle.version],
    ['Año', String(vehicle.year)],
    ['Kilometraje', formatKm(vehicle.mileage)],
    ['Combustible', FUEL_LABELS[vehicle.fuel]],
    ['Transmisión', TRANSMISSION_LABELS[vehicle.transmission]],
    ['Color', vehicle.color],
    ['Estado', STATUS_LABELS[vehicle.status]],
  ]
  return (
    <section aria-labelledby="ficha">
      <h2 id="ficha" className="text-lg font-semibold">
        Ficha técnica
      </h2>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-border py-3 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [title])
}

export function VehicleDetailPage() {
  const { id: rawId } = useParams()
  const location = useLocation()
  const backTo = `/catalogo${(location.state as { fromSearch?: string } | null)?.fromSearch ?? ''}`

  // El id viene de la URL: solo se consulta si es un entero positivo.
  const id = rawId && /^[1-9]\d{0,9}$/.test(rawId) ? Number(rawId) : null
  const [bookingOpen, setBookingOpen] = useState(false)
  const vehicle = useQuery({ ...vehicleQuery(id ?? 0), enabled: id !== null })
  useDocumentTitle(vehicle.data ? `${vehicle.data.brand.name} ${vehicle.data.model} | AutoMax` : 'AutoMax | Concesionario')

  const notFound = id === null || (isAxiosError(vehicle.error) && vehicle.error.response?.status === 404)
  if (notFound) {
    return (
      <Notice title="No encontramos este vehículo" actions={toCatalog()}>
        Puede que el enlace esté mal escrito o que el vehículo ya no esté publicado.
      </Notice>
    )
  }
  if (vehicle.isPending) return <DetailSkeleton />
  if (vehicle.isError) {
    return (
      <Notice
        title="No pudimos cargar el vehículo"
        actions={<Button onClick={() => void vehicle.refetch()}>Reintentar</Button>}
      >
        {errorMessage(vehicle.error)}
      </Notice>
    )
  }

  const data = vehicle.data
  const title = `${data.brand.name} ${data.model}`
  if (data.status === 'vendido') {
    return (
      <Notice
        title="Este vehículo ya fue vendido"
        actions={
          <>
            <Link to={`/catalogo?brandId=${data.brandId}`} className={buttonVariants()}>
              Ver más {data.brand.name}
            </Link>
            <Link to="/catalogo" className={buttonVariants({ variant: 'outline' })}>
              Ver todo el catálogo
            </Link>
          </>
        }
      >
        El {title} {data.year} ya tiene nuevo dueño. Mira otras opciones disponibles.
      </Notice>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to={backTo} className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al catálogo
      </Link>

      {/* El DOM sigue el orden de lectura móvil (título y precio, galería, simulador, detalles), que es
          también el del teclado. En escritorio las áreas de la rejilla lo reacomodan en dos columnas. */}
      <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:[grid-template-areas:'gallery_header'_'gallery_sim'_'info_sim']">
        <header className="lg:[grid-area:header]">
          <span
            className={cn(
              'inline-block rounded-full px-3 py-1 text-xs font-medium',
              data.status === 'nuevo' ? 'bg-accent text-accent-foreground' : 'border border-border',
            )}
          >
            {STATUS_LABELS[data.status]}
          </span>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">{title}</h1>
          <p className="mt-1 text-muted">
            {data.version}, {data.year}
          </p>
          <p className="mt-4 font-display text-4xl font-semibold text-accent">{formatCOP(data.price)}</p>
          <Button size="lg" className="mt-5 w-full" onClick={() => setBookingOpen(true)}>
            Agendar test-drive
          </Button>
        </header>

        <div className="lg:[grid-area:gallery]">
          <Gallery images={data.images} title={`${title} ${data.year}`} />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start lg:[grid-area:sim]">
          <LoanSimulator price={data.price} />
        </div>

        <div className="space-y-10 lg:[grid-area:info]">
          {data.description && (
            <section aria-labelledby="descripcion">
              <h2 id="descripcion" className="text-lg font-semibold">
                Descripción
              </h2>
              <p className="mt-3 max-w-prose leading-relaxed text-muted">{data.description}</p>
            </section>
          )}
          <Specs vehicle={data} />
        </div>
      </div>
      <BookingDialog vehicle={data} open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  )
}
