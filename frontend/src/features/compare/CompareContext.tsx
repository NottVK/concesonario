import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MAX_DB_INT } from '@/lib/ids'
import { MAX_COMPARE } from './compare'

/**
 * Vehículos elegidos para comparar. Solo guarda ids (nada personal) en sessionStorage, para que
 * la selección sobreviva a recargar la pestaña. En /comparar la URL manda y esta lista se sincroniza.
 */
const KEY = 'automax.compare'

function sanitize(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter((item): item is number => Number.isInteger(item) && item > 0 && item <= MAX_DB_INT)
  return [...new Set(ids)].slice(0, MAX_COMPARE)
}

function readStored(): number[] {
  try {
    return sanitize(JSON.parse(sessionStorage.getItem(KEY) ?? '[]'))
  } catch {
    return []
  }
}

interface CompareApi {
  ids: number[]
  isFull: boolean
  has: (id: number) => boolean
  toggle: (id: number) => void
  remove: (id: number) => void
  clear: () => void
  /** Reemplaza la selección completa (la usa /comparar para seguir a la URL). */
  replace: (ids: number[]) => void
}

const CompareContext = createContext<CompareApi | null>(null)

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>(readStored)

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(ids))
    } catch {
      // Sin storage: la selección vive solo mientras la página esté abierta.
    }
  }, [ids])

  const toggle = useCallback((id: number) => {
    setIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      return current.length >= MAX_COMPARE ? current : [...current, id]
    })
  }, [])
  const remove = useCallback((id: number) => setIds((current) => current.filter((item) => item !== id)), [])
  const clear = useCallback(() => setIds([]), [])
  const replace = useCallback((next: number[]) => {
    const clean = sanitize(next)
    setIds((current) => (current.length === clean.length && current.every((id, i) => id === clean[i]) ? current : clean))
  }, [])

  const api = useMemo<CompareApi>(
    () => ({ ids, isFull: ids.length >= MAX_COMPARE, has: (id) => ids.includes(id), toggle, remove, clear, replace }),
    [ids, toggle, remove, clear, replace],
  )
  return <CompareContext.Provider value={api}>{children}</CompareContext.Provider>
}

export function useCompare(): CompareApi {
  const context = useContext(CompareContext)
  if (!context) throw new Error('useCompare debe usarse dentro de <CompareProvider>')
  return context
}
