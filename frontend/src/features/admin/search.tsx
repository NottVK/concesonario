import { Search } from 'lucide-react'
import { useState } from 'react'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { cn } from '@/lib/utils'

export const MIN_SEARCH = 3
export const SEARCH_MAX = 120
const SEARCH_PAUSE_MS = 400

/**
 * Búsqueda de personas (clientes) en el panel. El texto es un dato personal: vive solo en el estado de la
 * página, nunca en la URL ni en almacenamiento. Escribir espera una pausa y exige un mínimo de caracteres;
 * borrar o quedarse corto quita el filtro al instante. `term` es lo que se envía al servidor ('' = sin filtro).
 */
export function useSearchTerm() {
  const [text, setText] = useState('')
  const paused = useDebouncedValue(text, SEARCH_PAUSE_MS)
  const long = (value: string): string => (value.trim().length >= MIN_SEARCH ? value.trim() : '')
  const term = long(text) === '' ? '' : long(paused)
  const tooShort = text.trim().length > 0 && text.trim().length < MIN_SEARCH
  return { text, setText, term, tooShort }
}

interface SearchBoxProps {
  id: string
  label: string
  value: string
  tooShort: boolean
  placeholder?: string
  onChange: (value: string) => void
}

export function SearchBox({ id, label, value, tooShort, placeholder = 'Nombre o correo', onChange }: SearchBoxProps) {
  const hintId = `${id}-hint`
  return (
    <div className="mb-4 max-w-md">
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      <div className="relative">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="search"
          role="searchbox"
          autoComplete="off"
          maxLength={SEARCH_MAX}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={tooShort ? hintId : undefined}
          className={cn('h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm')}
        />
      </div>
      {tooShort && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          Escribe al menos {MIN_SEARCH} caracteres para buscar.
        </p>
      )}
    </div>
  )
}
