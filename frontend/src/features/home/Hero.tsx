import { Calendar, Cog, Fuel, Gauge } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { VehicleWithBrand } from '@/api/types'
import { CarImage } from '@/components/CarImage'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FUEL_LABELS, STATUS_LABELS, TRANSMISSION_LABELS, formatKm } from '@/lib/labels'
import { cn, formatCOP } from '@/lib/utils'

/**
 * Misma rejilla y proporciones para el esqueleto y el hero real, así que al llegar los datos
 * nada se mueve: la foto reserva su 16/10 y el texto, su alto mínimo.
 */
const frame = 'mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:py-16'
const copy = 'min-h-[22rem] lg:min-h-[26rem]'

export function HeroSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando el auto destacado" className={frame}>
      <div className={cn(copy, 'space-y-5')}>
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-14 w-4/5" />
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-12 w-3/5" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-12 w-2/3" />
      </div>
      <Skeleton className="aspect-[16/10] rounded-2xl" />
    </div>
  )
}

function Spec({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="text-muted">
        {icon}
      </span>
      {children}
    </li>
  )
}

/** El auto más reciente del inventario: foto grande, precio y dos salidas claras. */
export function Hero({ vehicle }: { vehicle: VehicleWithBrand }) {
  const title = `${vehicle.brand.name} ${vehicle.model}`
  return (
    <div className={frame}>
      <div className={cn(copy, 'flex flex-col justify-center')}>
        <span
          className={cn(
            'w-fit rounded-full px-3 py-1 text-xs font-medium',
            vehicle.status === 'nuevo' ? 'bg-accent text-accent-foreground' : 'border border-border',
          )}
        >
          Recién llegado, {STATUS_LABELS[vehicle.status].toLowerCase()}
        </span>
        <h1 className="mt-5 text-5xl font-semibold leading-[1.05] sm:text-6xl">{title}</h1>
        <p className="mt-2 text-lg text-muted">
          {vehicle.version}, {vehicle.year}
        </p>
        <p className="mt-6 font-display text-4xl font-semibold text-accent sm:text-5xl">{formatCOP(vehicle.price)}</p>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Spec icon={<Calendar size={15} />}>{vehicle.year}</Spec>
          <Spec icon={<Gauge size={15} />}>{formatKm(vehicle.mileage)}</Spec>
          <Spec icon={<Fuel size={15} />}>{FUEL_LABELS[vehicle.fuel]}</Spec>
          <Spec icon={<Cog size={15} />}>{TRANSMISSION_LABELS[vehicle.transmission]}</Spec>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={`/catalogo/${vehicle.id}`} className={buttonVariants({ size: 'lg' })}>
            Ver este {vehicle.status === 'nuevo' ? 'auto' : 'carro'}
          </Link>
          <Link to="/catalogo" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Explorar el catálogo
          </Link>
        </div>
      </div>
      <Link to={`/catalogo/${vehicle.id}`} aria-label={`Ver ${title} ${vehicle.year}`} tabIndex={-1}>
        <CarImage
          priority
          src={vehicle.images[0]}
          alt={`${title} ${vehicle.year}, color ${vehicle.color.toLowerCase()}`}
          className="rounded-2xl border border-border"
        />
      </Link>
    </div>
  )
}

/** Hero de respaldo: la Home sigue siendo útil si no hay datos o la API falla. */
export function FallbackHero({ children }: { children?: React.ReactNode }) {
  return (
    <div className={cn(frame, 'lg:grid-cols-1')}>
      <div className="max-w-2xl">
        <h1 className="text-5xl font-semibold leading-[1.05] sm:text-6xl">Tu próximo carro está en AutoMax</h1>
        <p className="mt-4 text-lg text-muted">Nuevos y usados, con simulador de crédito y test-drive.</p>
        {children}
        <div className="mt-8">
          <Link to="/catalogo" className={buttonVariants({ size: 'lg' })}>
            Explorar el catálogo
          </Link>
        </div>
      </div>
    </div>
  )
}
