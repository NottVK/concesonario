import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Páginas visibles: primera, última y la vecindad de la actual, con "…" en los huecos. */
export function pageItems(current: number, total: number): (number | 'gap')[] {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const items: (number | 'gap')[] = []
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) items.push('gap')
    items.push(page)
  })
  return items
}

interface PaginationProps {
  page: number
  pages: number
  onChange: (page: number) => void
}

const base =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm transition-colors duration-200'

export function Pagination({ page, pages, onChange }: PaginationProps) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Paginación" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={cn(base, 'border-border hover:bg-surface disabled:opacity-40')}
      >
        <ChevronLeft size={16} />
      </button>
      {pageItems(page, pages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
            className={cn(
              base,
              item === page ? 'border-accent bg-accent text-accent-foreground' : 'border-border hover:bg-surface',
            )}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className={cn(base, 'border-border hover:bg-surface disabled:opacity-40')}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
