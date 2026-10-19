import { Check, GitCompareArrows } from 'lucide-react'
import type { VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_COMPARE } from './compare'
import { useCompare } from './CompareContext'

const FULL_MESSAGE = `Ya elegiste ${MAX_COMPARE} vehículos. Quita uno para agregar otro.`

/** Interruptor "comparar" de una tarjeta del catálogo (esquina superior derecha de la foto). */
export function CompareCardToggle({ vehicle }: { vehicle: VehicleWithBrand }) {
  const compare = useCompare()
  const selected = compare.has(vehicle.id)
  const blocked = compare.isFull && !selected
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Comparar ${vehicle.brand.name} ${vehicle.model}`}
      disabled={blocked}
      title={blocked ? FULL_MESSAGE : undefined}
      onClick={() => compare.toggle(vehicle.id)}
      className={cn(
        'absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-200 disabled:opacity-50',
        selected
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border bg-background/85 text-foreground hover:border-muted',
      )}
    >
      {selected ? <Check size={14} aria-hidden="true" /> : <GitCompareArrows size={14} aria-hidden="true" />}
      {selected ? 'En comparación' : 'Comparar'}
    </button>
  )
}

/** Botón de la página de detalle. */
export function CompareDetailButton({ vehicle }: { vehicle: VehicleWithBrand }) {
  const compare = useCompare()
  const selected = compare.has(vehicle.id)
  const blocked = compare.isFull && !selected
  return (
    <div>
      <Button
        variant="outline"
        className="w-full"
        aria-pressed={selected}
        disabled={blocked}
        onClick={() => compare.toggle(vehicle.id)}
      >
        {selected ? <Check size={16} aria-hidden="true" /> : <GitCompareArrows size={16} aria-hidden="true" />}
        {selected ? 'Quitar del comparador' : 'Agregar al comparador'}
      </Button>
      {blocked && <p className="mt-2 text-xs text-muted">{FULL_MESSAGE}</p>}
    </div>
  )
}
