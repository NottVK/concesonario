import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { setToken } from '@/api/session'
import type { SaleDetail, SaleListItem } from '@/api/types'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import { HistorialPage } from './HistorialPage'
import { VentaDetallePage } from './VentaDetallePage'

/* ---------------- Datos y servidor simulado ---------------- */
const EMAIL = 'marta.compradora@correo.co'
const PHONE = '3109876543'

function sale(id: number, over: Partial<SaleListItem> = {}): SaleListItem {
  return {
    id,
    soldAt: '2026-10-05T15:30:00.000Z',
    finalPrice: '115000000.50',
    payment: 'credito',
    vehicle: { id: 10 + id, brand: 'Mazda', model: `Mazda ${id}`, year: 2024, version: 'Touring' },
    customer: { id: 1, name: 'Marta Compradora' },
    seller: { id: 2, name: 'Víctor Vendedor' },
    ...over,
  }
}

const detailOf = (item: SaleListItem, over: Partial<SaleDetail> = {}): SaleDetail => ({
  ...item,
  vehicle: { ...item.vehicle, color: 'Rojo', mileage: 1200, listPrice: '120000000.00' },
  customer: { ...item.customer, email: EMAIL },
  ...over,
})

let rows: SaleListItem[]
const tokens = new Map<string, number>()
const listCalls: URL[] = []
const detailCalls: string[] = []
let listOverride: (() => Response) | null = null
let detailOverride: ((id: number) => Response) | null = null

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const id = tokens.get(request.headers.get('authorization')?.replace('Bearer ', '') ?? '')
    const user = Object.values(USERS).find((u) => u.id === id)
    return user ? HttpResponse.json(user) : HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
  }),
  http.get('*/api/ventas', ({ request }) => {
    listCalls.push(new URL(request.url))
    if (listOverride) return listOverride()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 10)
    const slice = rows.slice((page - 1) * limit, page * limit)
    return HttpResponse.json({ data: slice, meta: { total: rows.length, page, limit, pages: Math.max(1, Math.ceil(rows.length / limit)) } })
  }),
  http.get('*/api/ventas/:id', ({ params }) => {
    detailCalls.push(String(params.id))
    if (detailOverride) return detailOverride(Number(params.id))
    const found = rows.find((s) => s.id === Number(params.id))
    return found ? HttpResponse.json(detailOf(found)) : HttpResponse.json({ message: 'No existe la venta' }, { status: 404 })
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  rows = [sale(1), sale(2, { payment: 'contado', finalPrice: '90000000.00', customer: { id: 5, name: 'Luis Gómez' } }), sale(3)]
  listOverride = null
  detailOverride = null
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  listCalls.length = 0
  detailCalls.length = 0
})
afterAll(() => server.close())

function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname + location.search}</span>
}

function renderAt(path: string, as: keyof typeof USERS = 'admin@automax.co') {
  const user = USERS[as]
  const token = makeToken({ sub: user.id, role: user.role })
  tokens.set(token, user.id)
  setToken(token)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route path="ventas" element={<RequireRole roles={['admin']}><HistorialPage /></RequireRole>} />
              <Route path="ventas/:id" element={<RequireRole roles={['admin']}><VentaDetallePage /></RequireRole>} />
            </Route>
          </Routes>
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent
const items = () => within(screen.getByRole('list', { name: 'Ventas' })).getAllByRole('listitem')

/* ---------------- Lista ---------------- */
describe('Historial de ventas: lista (solo admin)', () => {
  it('muestra fecha de Bogotá, vehículo, cliente por nombre, pago y precio en pesos', async () => {
    renderAt('/admin/ventas')
    expect(await screen.findByRole('heading', { name: 'Historial de ventas', level: 1 })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Ventas' })
    expect(items()).toHaveLength(3)
    const first = items()[0]
    expect(within(first).getByText('Mazda Mazda 1 2024')).toBeInTheDocument()
    expect(within(first).getByText('Marta Compradora')).toBeInTheDocument()
    expect(within(first).getByText('Crédito')).toBeInTheDocument()
    expect(within(first).getByText(/115\.000\.000,50/)).toBeInTheDocument()
    expect(within(first).getByText(/10:30\s?a\. m\./)).toBeInTheDocument()
    expect(screen.getByText(/^3 ventas/)).toBeInTheDocument()
  })

  it('la lista nunca muestra correo ni teléfono, aunque el servidor los enviara por error', async () => {
    rows = rows.map((item) => ({ ...item, customer: { ...item.customer, email: EMAIL, phone: PHONE } as SaleListItem['customer'] }))
    renderAt('/admin/ventas')
    await screen.findByRole('list', { name: 'Ventas' })
    expect(document.body.textContent).not.toContain(EMAIL)
    expect(document.body.textContent).not.toContain(PHONE)
    expect(document.body.textContent).not.toMatch(/@correo\.co/)
  })

  it('la hora se muestra en Bogotá: 03:30 UTC del 1 de octubre es 22:30 del 30 de septiembre', async () => {
    rows = [sale(1, { soldAt: '2026-10-01T03:30:00.000Z' })]
    renderAt('/admin/ventas')
    await screen.findByRole('list', { name: 'Ventas' })
    expect(within(items()[0]).getByText(/30 de sept/)).toBeInTheDocument()
    expect(within(items()[0]).getByText(/10:30\s?p\. m\./)).toBeInTheDocument()
  })

  it('el vendedor ve "sin permiso", sin enlace en el menú y sin pedir ninguna venta', async () => {
    renderAt('/admin/ventas', 'vendedor@automax.co')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para esta sección' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ventas' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(listCalls).toEqual([])
  })

  it('el menú muestra Ventas al admin', async () => {
    renderAt('/admin/ventas')
    expect(await screen.findByRole('link', { name: 'Ventas' })).toBeInTheDocument()
  })

  it('pagina: pide la página de la URL y limpia valores basura', async () => {
    rows = Array.from({ length: 23 }, (_, i) => sale(i + 1))
    renderAt('/admin/ventas?page=2')
    await screen.findByRole('list', { name: 'Ventas' })
    expect(listCalls.at(-1)?.searchParams.get('page')).toBe('2')
    expect(items()).toHaveLength(10)
    expect(within(items()[0]).getByRole('link')).toHaveAttribute('href', '/admin/ventas/11?page=2')
  })

  it.each(['page=0', 'page=1e3', 'page=-4', 'page=abc', 'page=1&otro=x'])('la URL %s se deja limpia en la página 1', async (query) => {
    renderAt(`/admin/ventas?${query}`)
    await screen.findByRole('list', { name: 'Ventas' })
    await waitFor(() => expect(where()).toBe('/admin/ventas'))
    expect(listCalls.at(-1)?.searchParams.get('page')).toBe('1')
  })

  it('sin ventas: mensaje vacío con enlace para registrar la primera', async () => {
    rows = []
    renderAt('/admin/ventas')
    expect(await screen.findByText('Todavía no hay ventas registradas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar una venta' })).toHaveAttribute('href', '/admin/ventas/nueva')
  })

  it('un error muestra un mensaje fijo (no el del servidor) y permite reintentar', async () => {
    listOverride = () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
    const user = userEvent.setup()
    renderAt('/admin/ventas')
    expect(await screen.findByText('No pudimos cargar el historial')).toBeInTheDocument()
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument()
    listOverride = null
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('list', { name: 'Ventas' })).toBeInTheDocument()
  })

  it('mientras carga hay un esqueleto accesible', async () => {
    renderAt('/admin/ventas')
    expect(await screen.findByRole('list', { name: 'Cargando ventas' })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Ventas' })
  })
})

/* ---------------- Detalle ---------------- */
describe('Historial de ventas: detalle (solo admin)', () => {
  it('muestra el correo del cliente, el precio de lista y la diferencia; el teléfono nunca', async () => {
    detailOverride = (id) =>
      HttpResponse.json({ ...detailOf(sale(id)), customer: { id: 1, name: 'Marta Compradora', email: EMAIL, phone: PHONE } })
    renderAt('/admin/ventas/1')
    expect(await screen.findByRole('heading', { name: /Venta de Mazda Mazda 1 2024/ })).toBeInTheDocument()
    const customer = screen.getByRole('region', { name: 'Cliente' })
    expect(within(customer).getByText('Marta Compradora')).toBeInTheDocument()
    expect(within(customer).getByText(EMAIL)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(PHONE)
    const sold = screen.getByRole('region', { name: 'Venta' })
    expect(within(sold).getByText(/115\.000\.000,50/)).toBeInTheDocument()
    expect(within(sold).getByText(/120\.000\.000/)).toBeInTheDocument()
    expect(within(sold).getByText(/por debajo del precio de lista/)).toBeInTheDocument()
    expect(within(sold).getByText('Víctor Vendedor')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Vehículo' })).getByText(/1\.200 km/)).toBeInTheDocument()
    expect(screen.getByText(/5 de octubre de 2026/)).toBeInTheDocument()
  })

  it('dice cuando el precio final supera al de lista o es igual', async () => {
    detailOverride = (id) => HttpResponse.json(detailOf(sale(id), { finalPrice: '125000000.00' }))
    const first = renderAt('/admin/ventas/1')
    expect(await within(await screen.findByRole('region', { name: 'Venta' })).findByText(/por encima del precio de lista/)).toBeInTheDocument()
    first.unmount()
    detailOverride = (id) => HttpResponse.json(detailOf(sale(id), { finalPrice: '120000000.00' }))
    renderAt('/admin/ventas/1')
    expect(await within(await screen.findByRole('region', { name: 'Venta' })).findByText('Igual al precio de lista')).toBeInTheDocument()
  })

  it('"Volver" conserva la página del historial', async () => {
    renderAt('/admin/ventas/3?page=4')
    await screen.findByRole('heading', { name: /Venta de Mazda Mazda 3/ })
    const back = await screen.findAllByRole('link', { name: 'Volver al historial' })
    expect(back[0]).toHaveAttribute('href', '/admin/ventas?page=4')
  })

  it.each(['abc', '0', '-1', '1.5', '1e3', '99999999999999999999', '2147483648'])('el id %s no consulta la API y dice que no existe', async (id) => {
    renderAt(`/admin/ventas/${id}`)
    expect(await screen.findByText('No encontramos esta venta')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(detailCalls).toEqual([])
  })

  it('una venta que no existe (404) lo dice sin reintentar', async () => {
    renderAt('/admin/ventas/999')
    expect(await screen.findByText('No encontramos esta venta')).toBeInTheDocument()
    expect(detailCalls).toEqual(['999'])
  })

  it('un error del servidor muestra un mensaje fijo y permite reintentar', async () => {
    detailOverride = () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
    const user = userEvent.setup()
    renderAt('/admin/ventas/1')
    expect(await screen.findByText('No pudimos cargar la venta')).toBeInTheDocument()
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument()
    detailOverride = null
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: /Venta de Mazda/ })).toBeInTheDocument()
  })

  it('el vendedor no ve el detalle ni se pide nada', async () => {
    renderAt('/admin/ventas/1', 'vendedor@automax.co')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para esta sección' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(EMAIL)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(detailCalls).toEqual([])
  })
})
