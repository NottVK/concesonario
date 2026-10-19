import { useQuery } from '@tanstack/react-query'
import { formatMonthKey } from '@/lib/bogota'
import { formatCOP } from '@/lib/utils'
import { salesByMonthQuery, stockByBrandQuery, summaryQuery } from './api'
import { ChartPanel } from './ChartPanel'
import { SalesChart, SalesTable, StockChart, StockTable } from './Charts'
import { MetricCard, StateBody, stateOf } from './Panel'

const figure = 'font-display text-3xl font-semibold tabular-nums tracking-tight'
/** Los montos en pesos son largos ("$ 9.638.700.000"): un tamaño menor evita que se salgan de la tarjeta. */
const money = 'font-display text-2xl font-semibold tabular-nums tracking-tight'

/** Panel de métricas. Solo se monta para admin (ver la ruta): un vendedor nunca dispara estas consultas. */
export function MetricasPage() {
  const summary = useQuery(summaryQuery())
  const sales = useQuery(salesByMonthQuery())
  const stock = useQuery(stockByBrandQuery())
  const s = summary.data
  const state = stateOf(summary, false)
  const retry = () => void summary.refetch()
  const monthName = s ? formatMonthKey(s.month) : 'este mes'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold">Métricas</h1>
        <p className="mt-1 text-muted">Inventario, citas y ventas del concesionario. Los meses se cuentan en hora de Bogotá.</p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard label="Vehículos en stock">
          <StateBody state={state} emptyText="" onRetry={retry}>
            <p className={figure}>{s?.vehiclesInStock}</p>
            <p className="mt-1 text-xs text-muted">{s?.vehiclesInStock === 0 ? 'No hay vehículos disponibles' : 'Disponibles hoy'}</p>
          </StateBody>
        </MetricCard>
        <MetricCard label="Valor del inventario">
          <StateBody state={state} emptyText="" onRetry={retry} skeletonClass="h-8 w-40">
            <p className={money}>{s && formatCOP(s.stockValue)}</p>
            <p className="mt-1 text-xs text-muted">Suma de precios disponibles</p>
          </StateBody>
        </MetricCard>
        <MetricCard label="Citas pendientes">
          <StateBody state={state} emptyText="" onRetry={retry}>
            <p className={figure}>{s?.pendingAppointments}</p>
            <p className="mt-1 text-xs text-muted">{s?.pendingAppointments === 0 ? 'Todo al día' : 'Por confirmar o cancelar'}</p>
          </StateBody>
        </MetricCard>
        <MetricCard label={`Ventas de ${monthName}`}>
          <StateBody state={state} emptyText="" onRetry={retry}>
            <p className={figure}>{s?.salesThisMonth}</p>
            <p className="mt-1 text-xs text-muted">{s?.salesThisMonth === 0 ? 'Aún no hay ventas este mes' : 'Ventas registradas'}</p>
          </StateBody>
        </MetricCard>
        <MetricCard label={`Ingresos de ${monthName}`}>
          <StateBody state={state} emptyText="" onRetry={retry} skeletonClass="h-8 w-40">
            <p className={money}>{s && formatCOP(s.revenueThisMonth)}</p>
            <p className="mt-1 text-xs text-muted">Suma del precio final</p>
          </StateBody>
        </MetricCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartPanel
          title="Ventas por mes"
          description="Últimos 12 meses."
          state={stateOf(sales, !!sales.data && sales.data.every((row) => row.count === 0))}
          emptyText="Aún no hay ventas en los últimos 12 meses. Cuando registres una venta aparecerá aquí."
          onRetry={() => void sales.refetch()}
          chart={sales.data && <SalesChart rows={sales.data} />}
          table={sales.data && <SalesTable rows={sales.data} />}
        />
        <ChartPanel
          title="Inventario por marca"
          description="Vehículos disponibles hoy."
          state={stateOf(stock, !!stock.data && stock.data.every((row) => row.count === 0))}
          emptyText="No hay vehículos disponibles. Cuando haya inventario, verás aquí cómo se reparte por marca."
          onRetry={() => void stock.refetch()}
          chart={stock.data && <StockChart rows={stock.data} />}
          table={stock.data && <StockTable rows={stock.data} />}
        />
      </div>
    </div>
  )
}
