import { Calendar, Cog, Fuel, Gauge } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { VehicleWithBrand } from '@/api/types'
import { CarImage } from '@/components/CarImage'
import { Skeleton } from '@/components/ui/skeleton'
import { FUEL_LABELS, STATUS_LABELS, TRANSMISSION_LABELS, formatKm } from '@/lib/labels'
import { cn, formatCOP } from '@/lib/utils'

function Spec({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="text-muted">
        {icon}
      </span>
      {children}
    </li>
  )
}

export function VehicleCard({ vehicle }: { vehicle: VehicleWithBrand }) {
  const title = `${vehicle.brand.name} ${vehicle.model}`
  return (
    <li>
      <Link
        to={`/catalogo/${vehicle.id}`}
        className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-200 hover:border-muted"
      >
        <div className="relative">
          <CarImage
            src={vehicle.images[0]}
            alt={`${title} ${vehicle.year}, color ${vehicle.color.toLowerCase()}`}
            className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
          <span
            className={cn(
              'absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-medium',
              vehicle.status === 'nuevo' ? 'bg-accent text-accent-foreground' : 'bg-background/85 text-foreground',
            )}
          >
            {STATUS_LABELS[vehicle.status]}
          </span>
        </div>
        <div className="p-5">
          <h3 className="text-lg font-semibold leading-snug">{title}</h3>
          <p className="mt-0.5 text-sm text-muted">{vehicle.version}</p>
          <p className="mt-4 font-display text-2xl font-semibold text-accent">{formatCOP(vehicle.price)}</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Spec icon={<Calendar size={15} />}>{vehicle.year}</Spec>
            <Spec icon={<Gauge size={15} />}>{formatKm(vehicle.mileage)}</Spec>
            <Spec icon={<Fuel size={15} />}>{FUEL_LABELS[vehicle.fuel]}</Spec>
            <Spec icon={<Cog size={15} />}>{TRANSMISSION_LABELS[vehicle.transmission]}</Spec>
          </ul>
        </div>
      </Link>
    </li>
  )
}

export function VehicleCardSkeleton() {
  return (
    <li aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-surface">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    </li>
  )
}
