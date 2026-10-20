import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { brandsQuery, vehiclesQuery } from '@/api/queries'
import { VehicleCard, VehicleCardSkeleton } from '@/features/catalog/VehicleCard'
import { BrandCarousel, BrandCarouselSkeleton } from './BrandCarousel'
import { FallbackHero, Hero, HeroSkeleton } from './Hero'

/** Una sola consulta: el más reciente es el hero y los siguientes, los destacados. */
const NEWEST = { sort: 'newest', page: 1, limit: 7 } as const
const FEATURED_COUNT = 6

function Section({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 id={id} className="text-2xl font-semibold sm:text-3xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function HomePage() {
  const newest = useQuery(vehiclesQuery(NEWEST))
  const brands = useQuery(brandsQuery())

  const [hero, ...rest] = newest.data?.data ?? []
  const featured = rest.slice(0, FEATURED_COUNT)

  return (
    <>
      {newest.isPending && <HeroSkeleton />}
      {newest.isError && (
        <FallbackHero>
          <p role="alert" className="mt-4 text-sm text-accent">
            {errorMessage(newest.error)}{' '}
            <button type="button" className="underline" onClick={() => void newest.refetch()}>
              Reintentar
            </button>
          </p>
        </FallbackHero>
      )}
      {newest.isSuccess && (hero ? <Hero vehicle={hero} /> : <FallbackHero />)}

      <Section id="marcas" title="Elige tu marca">
        {brands.isPending && <BrandCarouselSkeleton />}
        {brands.isError && (
          <p role="alert" className="text-sm text-muted">
            No pudimos cargar las marcas. {errorMessage(brands.error)}{' '}
            <button type="button" className="text-accent underline" onClick={() => void brands.refetch()}>
              Reintentar
            </button>
          </p>
        )}
        {brands.data && <BrandCarousel brands={brands.data} />}
      </Section>

      {(newest.isPending || featured.length > 0) && (
        <Section
          id="destacados"
          title="Destacados"
          action={
            <Link to="/catalogo" className="shrink-0 text-sm text-muted transition-colors hover:text-foreground">
              Ver todo el catálogo
            </Link>
          }
        >
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {newest.isPending
              ? Array.from({ length: FEATURED_COUNT }, (_, i) => <VehicleCardSkeleton key={i} />)
              : featured.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}
          </ul>
        </Section>
      )}
    </>
  )
}
