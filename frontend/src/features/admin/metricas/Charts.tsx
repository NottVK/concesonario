import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatMonthKey, formatMonthKeyShort } from '@/lib/bogota'
import { formatCOP } from '@/lib/utils'
import type { SalesByMonth, StockByBrand } from './api'

const AXIS = { fill: 'var(--muted)', fontSize: 12 }
const VALUE = { fill: 'var(--foreground)', fontSize: 12, fontWeight: 600 }

/** Etiquetas del eje: se agrega el año en el primer mes y en enero para no confundir años. */
function axisData(rows: readonly SalesByMonth[]): { label: string; count: number; month: string }[] {
  return rows.map((row, i) => ({
    month: row.month,
    count: row.count,
    label: formatMonthKeyShort(row.month, i === 0 || row.month.endsWith('-01')),
  }))
}

export function SalesChart({ rows }: { rows: readonly SalesByMonth[] }) {
  const data = axisData(rows)
  const summary = rows.map((r) => `${formatMonthKey(r.month)} ${r.count}`).join(', ')
  return (
    <figure>
      <div className="h-72 w-full" role="img" aria-label={`Ventas por mes: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={4} />
            <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />
            <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              <LabelList dataKey="count" position="top" style={VALUE} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-muted">Número de ventas por mes calendario, hora de Bogotá. Los meses sin ventas no tienen barra; la tabla los muestra con 0.</figcaption>
    </figure>
  )
}

export function SalesTable({ rows }: { rows: readonly SalesByMonth[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-80 text-sm">
        <caption className="sr-only">Ventas por mes</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Mes</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Ventas</th>
            <th scope="col" className="py-2 text-right font-medium">Total vendido</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => (
            <tr key={row.month} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal">{formatMonthKey(row.month)}</th>
              <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
              <td className="py-2 text-right tabular-nums">{formatCOP(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StockChart({ rows }: { rows: readonly StockByBrand[] }) {
  const summary = rows.map((r) => `${r.brand} ${r.count}`).join(', ')
  return (
    <figure>
      <div className="w-full" style={{ height: rows.length * 34 + 16 }} role="img" aria-label={`Vehículos disponibles por marca: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...rows]} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
            <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, 1)]} />
            <YAxis type="category" dataKey="brand" width={96} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
            <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
              <LabelList dataKey="count" position="right" style={VALUE} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-muted">
        Vehículos disponibles (nuevos y usados) por marca. Las marcas sin inventario aparecen en 0.
      </figcaption>
    </figure>
  )
}

export function StockTable({ rows }: { rows: readonly StockByBrand[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-80 text-sm">
        <caption className="sr-only">Inventario disponible por marca</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Marca</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Vehículos</th>
            <th scope="col" className="py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.brandId} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal">{row.brand}</th>
              <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
              <td className="py-2 text-right tabular-nums">{formatCOP(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
