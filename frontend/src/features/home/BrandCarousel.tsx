import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Brand } from '@/api/types'
import { BrandLogo } from '@/components/BrandLogo'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const tile = 'flex h-28 w-36 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface'

export function BrandCarouselSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-3 overflow-hidden">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-28 w-36 shrink-0 rounded-xl" />
      ))}
    </div>
  )
}

/** Carrusel horizontal con desplazamiento por imán; cada marca lleva al catálogo filtrado por ella. */
export function BrandCarousel({ brands }: { brands: Brand[] }) {
  const track = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, brands.length])

  const scroll = (direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' })
  }

  const arrow = 'hidden h-10 w-10 items-center justify-center rounded-full border border-border bg-surface transition-colors hover:border-muted disabled:opacity-30 md:inline-flex'

  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Marcas anteriores" disabled={edges.start} onClick={() => scroll(-1)} className={arrow}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <ul
        ref={track}
        onScroll={measure}
        aria-label="Marcas disponibles"
        className="flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {brands.map((brand) => (
          <li key={brand.id} className="contents">
            <Link
              to={`/catalogo?brandId=${brand.id}`}
              aria-label={`Ver autos ${brand.name}`}
              className={cn(tile, 'transition-colors duration-200 hover:border-muted')}
            >
              <BrandLogo name={brand.name} logoUrl={brand.logoUrl} className="h-10 w-10 text-lg" />
              <span className="text-sm font-medium">{brand.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" aria-label="Más marcas" disabled={edges.end} onClick={() => scroll(1)} className={arrow}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
