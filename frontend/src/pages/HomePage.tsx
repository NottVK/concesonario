import { useQuery } from '@tanstack/react-query'
import { brandsQuery } from '@/api/queries'
import { errorMessage } from '@/api/client'
import { BrandLogo } from '@/components/BrandLogo'
import { Skeleton } from '@/components/ui/skeleton'

/** Provisional: la Home real (hero, carrusel, destacados) llega en el paso 4. */
export function HomePage() {
  const brands = useQuery(brandsQuery())

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <h1 className="max-w-2xl text-4xl font-semibold sm:text-5xl">Tu próximo carro está en AutoMax</h1>
      <p className="mt-4 max-w-xl text-muted">Estamos terminando el catálogo. Mientras tanto, estas son nuestras marcas.</p>
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {brands.isPending && Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        {brands.isError && (
          <p role="alert" className="col-span-full text-accent">
            {errorMessage(brands.error)}
          </p>
        )}
        {brands.data?.map((brand) => (
          <div key={brand.id} className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface">
            <BrandLogo name={brand.name} logoUrl={brand.logoUrl} className="h-8 w-8" />
            <span className="text-sm text-muted">{brand.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
