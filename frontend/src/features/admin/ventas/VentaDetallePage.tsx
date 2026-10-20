import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { errorMessage } from '@/api/client'
import type { SaleDetail } from '@/api/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { parsePage } from '@/features/catalog/filters'
import { formatLongDate, formatTime } from '@/lib/bogota'
import { parseDbId } from '@/lib/ids'
import { formatKm } from '@/lib/labels'
import { formatCOPExact } from '@/lib/utils'
import { saleDetailQuery } from './api'
import { PAYMENT_LABELS } from './payment'
import { priceGap } from './price-gap'

function Section({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-3 divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Problem({ title, text, back, retry }: { title: string; text: string; back: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {retry && <Button onClick={retry}>Reintentar</Button>}
        <Link to={back} className={buttonVariants({ variant: 'outline' })}>
          Volver al historial
        </Link>
      </div>
    </div>
  )
}

/** Detalle de una venta, solo admin. Aquí (y solo aquí) aparece el correo del cliente; el teléfono nunca se pide. */
export function VentaDetallePage() {
  const { id: rawId } = useParams()
  const [params] = useSearchParams()
  const id = parseDbId(rawId)
  const page = parsePage(params.get('page'))
  const back = page > 1 ? `/admin/ventas?page=${page}` : '/admin/ventas'
  // Con un id imposible ni se consulta la API.
  const sale = useQuery({ ...saleDetailQuery(id ?? 0), enabled: id !== null })

  useEffect(() => {
    document.title = 'Detalle de venta | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  const notFound = id === null || (sale.isError && isAxiosError(sale.error) && sale.error.response?.status === 404)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" />
        Volver al historial
      </Link>

      {notFound && <Problem title="No encontramos esta venta" text="Puede que el enlace esté mal escrito. Vuelve al historial y elige una venta de la lista." back={back} />}

      {id !== null && sale.isPending && (
        <div role="status" aria-label="Cargando la venta" className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!notFound && sale.isError && <Problem title="No pudimos cargar la venta" text={errorMessage(sale.error)} back={back} retry={() => void sale.refetch()} />}

      {sale.isSuccess && <SaleView sale={sale.data} />}
    </div>
  )
}

function SaleView({ sale }: { sale: SaleDetail }) {
  const car = `${sale.vehicle.brand} ${sale.vehicle.model} ${sale.vehicle.year}`
  const gap = priceGap(sale.vehicle.listPrice, sale.finalPrice)
  const gapText =
    gap.kind === 'same' ? 'Igual al precio de lista' : gap.kind === 'discount' ? `${formatCOPExact(gap.amount)} por debajo del precio de lista` : `${formatCOPExact(gap.amount)} por encima del precio de lista`
  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Venta de {car}</h1>
        <p className="mt-1 text-muted">
          {formatLongDate(sale.soldAt)}, {formatTime(sale.soldAt)} (hora de Bogotá)
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Venta"
          rows={[
            ['Precio final', <span key="p" className="font-display text-base font-semibold tabular-nums">{formatCOPExact(sale.finalPrice)}</span>],
            ['Precio de lista', formatCOPExact(sale.vehicle.listPrice)],
            ['Diferencia', gapText],
            ['Forma de pago', PAYMENT_LABELS[sale.payment]],
            ['Registrada por', sale.seller.name],
          ]}
        />
        <Section
          title="Cliente"
          rows={[
            ['Nombre', sale.customer.name],
            ['Correo', sale.customer.email],
          ]}
        />
        <Section
          title="Vehículo"
          rows={[
            ['Vehículo', <Link key="v" to={`/catalogo/${sale.vehicle.id}`} className="hover:underline">{car}</Link>],
            ['Versión', sale.vehicle.version],
            ['Color', sale.vehicle.color],
            ['Kilometraje', formatKm(sale.vehicle.mileage)],
          ]}
        />
      </div>
    </>
  )
}
