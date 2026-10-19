import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setToken } from '@/api/session'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import type { SalesByMonth, StockByBrand, Summary } from './api'
import { MetricasPage } from './MetricasPage'

const SUMMARY: Summary = {
  month: '2026-10',
  vehiclesInStock: 52,
  stockValue: '9850000000.00',
  pendingAppointments: 4,
  salesThisMonth: 3,
  revenueThisMonth: '540000000.00',
}
const monthKeys = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const salesRows = (counts: Record<string, number>): SalesByMonth[] =>
  monthKeys.map((month) => ({ month, count: counts[month] ?? 0, total: counts[month] ? `${counts[month] * 100000000}.00` : '0.00' }))
const STOCK: StockByBrand[] = [
  { brandId: 1, brand: 'Toyota', count: 6, value: '1100000000.00' },
  { brandId: 2, brand: 'Mazda', count: 0, value: '0.00' },
]

const tokens = new Map<string, number>()
const calls: string[] = []
let summaryOverride: (() => Response) | null = null
let salesData: SalesByMonth[]
let stockData: StockByBrand[]

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const id = tokens.get(request.headers.get('authorization')?.replace('Bearer ', '') ?? '')
    const user = Object.values(USERS).find((u) => u.id === id)
    return user ? HttpResponse.json(user) : HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
  }),
  http.get('*/api/admin/metricas/resumen', () => {
    calls.push('resumen')
    return summaryOverride ? summaryOverride() : HttpResponse.json(SUMMARY)
  }),
  http.get('*/api/admin/metricas/ventas-por-mes', () => {
    calls.push('ventas-por-mes')
    return HttpResponse.json(salesData)
  }),
  http.get('*/api/admin/metricas/stock-por-marca', () => {
    calls.push('stock-por-marca')
    return HttpResponse.json(stockData)
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  summaryOverride = null
  salesData = salesRows({ '2026-10': 3, '2026-08': 2 })
  stockData = STOCK
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  calls.length = 0
})
afterAll(() => server.close())

function renderMetricas(as: keyof typeof USERS) {
  const user = USERS[as]
  const token = makeToken({ sub: user.id, role: user.role })
  tokens.set(token, user.id)
  setToken(token)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/metricas']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route path="metricas" element={<RequireRole roles={['admin']}><MetricasPage /></RequireRole>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const card = (name: RegExp) => screen.getByRole('region', { name })

describe('Métricas (solo admin)', () => {
  it('muestra las tarjetas con pesos colombianos y el mes en español', async () => {
    renderMetricas('admin@automax.co')
    expect(await screen.findByRole('heading', { name: 'Métricas', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(within(card(/^Valor del inventario/)).getByText(/9\.850\.000\.000/)).toBeInTheDocument())
    expect(within(card(/^Vehículos en stock/)).getByText('52')).toBeInTheDocument()
    expect(within(card(/^Citas pendientes/)).getByText('4')).toBeInTheDocument()
    expect(within(card(/^Ventas de octubre de 2026/)).getByText('3')).toBeInTheDocument()
    expect(within(card(/^Ingresos de octubre de 2026/)).getByText(/540\.000\.000/)).toBeInTheDocument()
  })

  it('el vendedor ve "sin permiso" y no se pide ningún monto', async () => {
    renderMetricas('vendedor@automax.co')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para esta sección' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls).toEqual([])
  })

  it('el menú muestra Métricas solo al admin', async () => {
    renderMetricas('admin@automax.co')
    expect(await screen.findByRole('link', { name: 'Métricas' })).toBeInTheDocument()
  })

  it('cada tarjeta tiene su carga: antes de responder hay indicadores de carga', async () => {
    renderMetricas('admin@automax.co')
    expect((await screen.findAllByRole('status', { name: 'Cargando' })).length).toBeGreaterThanOrEqual(5)
    await screen.findByText('52')
  })

  it('si el resumen falla, solo fallan las tarjetas y se puede reintentar; las gráficas siguen', async () => {
    summaryOverride = () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
    const user = userEvent.setup()
    renderMetricas('admin@automax.co')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(5)
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: 'Ver como tabla' })).toHaveLength(2)

    summaryOverride = null
    await user.click(within(card(/^Vehículos en stock/)).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('52')).toBeInTheDocument()
  })

  it('la tabla de ventas lista cada mes en hora de Bogotá, con ceros en los meses vacíos', async () => {
    const user = userEvent.setup()
    renderMetricas('admin@automax.co')
    await user.click(await screen.findAllByRole('button', { name: 'Ver como tabla' }).then((b) => b[0]))
    const table = screen.getByRole('table', { name: 'Ventas por mes' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(12)
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('octubre de 2026')
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('3')
    const empty = rows.find((row) => within(row).queryByRole('rowheader')?.textContent === 'septiembre de 2026') as HTMLElement
    expect(within(empty).getAllByRole('cell')[0]).toHaveTextContent('0')
    expect(within(empty).getAllByRole('cell')[1]).toHaveTextContent(/\$\s?0$/)
    await user.click(screen.getAllByRole('button', { name: 'Ver gráfica' })[0])
    expect(screen.queryByRole('table', { name: 'Ventas por mes' })).not.toBeInTheDocument()
  })

  it('la tabla de inventario incluye las marcas sin vehículos', async () => {
    const user = userEvent.setup()
    renderMetricas('admin@automax.co')
    await user.click((await screen.findAllByRole('button', { name: 'Ver como tabla' }))[1])
    const table = screen.getByRole('table', { name: 'Inventario disponible por marca' })
    const mazda = within(table).getByRole('rowheader', { name: 'Mazda' }).closest('tr') as HTMLElement
    expect(within(mazda).getAllByRole('cell')[0]).toHaveTextContent('0')
  })

  it('gráficas sin datos muestran un mensaje de vacío, no una gráfica en blanco', async () => {
    salesData = salesRows({})
    stockData = STOCK.map((row) => ({ ...row, count: 0, value: '0.00' }))
    renderMetricas('admin@automax.co')
    expect(await screen.findByText(/Aún no hay ventas en los últimos 12 meses/)).toBeInTheDocument()
    expect(await screen.findByText(/No hay vehículos disponibles\. Cuando haya inventario/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver como tabla' })).not.toBeInTheDocument()
  })

  it('solo pide métricas agregadas: ninguna petición de clientes ni de citas', async () => {
    renderMetricas('admin@automax.co')
    await screen.findByText('52')
    await waitFor(() => expect(calls.sort()).toEqual(['resumen', 'stock-por-marca', 'ventas-por-mes']))
  })
})
