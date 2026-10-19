import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Brand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { FUEL_LABELS, TRANSMISSION_LABELS } from '@/lib/labels'
import type { CatalogFilters } from './filters'

const control =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

interface RangeProps {
  label: string
  minLabel: string
  maxLabel: string
  min: string
  max: string
  placeholders: [string, string]
  onCommit: (min: string, max: string) => void
}

/** Rango numérico: aplica al salir del campo o con Enter, para no consultar en cada tecla. */
function RangeField({ label, minLabel, maxLabel, min, max, placeholders, onCommit }: RangeProps) {
  const [draft, setDraft] = useState({ min, max })
  // Si la URL cambia desde fuera (limpiar filtros, atrás), el borrador se sincroniza.
  const [seen, setSeen] = useState({ min, max })
  if (seen.min !== min || seen.max !== max) {
    setSeen({ min, max })
    setDraft({ min, max })
  }
  const clean = (value: string) => value.replace(/\D/g, '').slice(0, 12)
  const commit = () => onCommit(draft.min, draft.max)
  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') commit()
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label={minLabel}
          inputMode="numeric"
          placeholder={placeholders[0]}
          value={draft.min}
          onChange={(e) => setDraft({ ...draft, min: clean(e.target.value) })}
          onBlur={commit}
          onKeyDown={onEnter}
          className={control}
        />
        <input
          aria-label={maxLabel}
          inputMode="numeric"
          placeholder={placeholders[1]}
          value={draft.max}
          onChange={(e) => setDraft({ ...draft, max: clean(e.target.value) })}
          onBlur={commit}
          onKeyDown={onEnter}
          className={control}
        />
      </div>
    </fieldset>
  )
}

interface FiltersPanelProps {
  filters: CatalogFilters
  brands: Brand[] | undefined
  activeCount: number
  onChange: (patch: Partial<CatalogFilters>) => void
  onClear: () => void
}

export function FiltersPanel({ filters, brands, activeCount, onChange, onClear }: FiltersPanelProps) {
  return (
    <form
      aria-label="Filtros del catálogo"
      onSubmit={(event) => event.preventDefault()}
      className="space-y-6 rounded-xl border border-border bg-surface p-5"
    >
      <Field label="Marca">
        <select
          value={filters.brandId}
          onChange={(e) => onChange({ brandId: e.target.value })}
          className={control}
        >
          <option value="">Todas las marcas</option>
          {brands?.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </Field>

      <RangeField
        label="Precio (COP)"
        minLabel="Precio mínimo"
        maxLabel="Precio máximo"
        min={filters.priceMin}
        max={filters.priceMax}
        placeholders={['Mínimo', 'Máximo']}
        onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
      />

      <RangeField
        label="Año"
        minLabel="Año desde"
        maxLabel="Año hasta"
        min={filters.yearMin}
        max={filters.yearMax}
        placeholders={['Desde', 'Hasta']}
        onCommit={(yearMin, yearMax) => onChange({ yearMin, yearMax })}
      />

      <Field label="Combustible">
        <select
          value={filters.fuel}
          onChange={(e) => onChange({ fuel: e.target.value as CatalogFilters['fuel'] })}
          className={control}
        >
          <option value="">Todos</option>
          {Object.entries(FUEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Transmisión">
        <select
          value={filters.transmission}
          onChange={(e) => onChange({ transmission: e.target.value as CatalogFilters['transmission'] })}
          className={control}
        >
          <option value="">Todas</option>
          {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Estado">
        <select
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value as CatalogFilters['status'] })}
          className={control}
        >
          <option value="">Nuevos y usados</option>
          <option value="nuevo">Nuevos</option>
          <option value="usado">Usados</option>
        </select>
      </Field>

      <Button variant="outline" className="w-full" disabled={activeCount === 0} onClick={onClear}>
        Limpiar filtros
      </Button>
    </form>
  )
}
