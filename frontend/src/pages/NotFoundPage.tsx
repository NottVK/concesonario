import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold">No encontramos esta página</h1>
      <p className="mt-3 text-muted">Puede que el enlace esté mal escrito o que el carro ya se haya vendido.</p>
      <Link to="/catalogo" className={buttonVariants({ className: 'mt-8' })}>
        Ver el catálogo
      </Link>
    </section>
  )
}
