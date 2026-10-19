import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { setToken } from '@/api/session'
import type { Customer, VehicleWithBrand } from '@/api/types'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import { RegistrarVentaPage } from './RegistrarVentaPage'

/* ---------------- Datos y servidor simulado ---------------- */
function car(id: number, model: string, price: string, over: Partial<VehicleWithBrand> = {}): VehicleWithBrand {
  return {
    id, brandId: 1, brand: { id: 1, name: 'Mazda', country: 'Japón', logoUrl: null }, model, year: 2024, version: 'Touring', price,
    mileage: 0, fuel: 'gasolina', transmission: 'manual', color: 'Gris', status: 'nuevo', description: null, images: [], ...over,
  }
}
const customer = (id: number, name: string): Customer => ({
  id, name, email: `${name.split(' ')[0].toLowerCase()}@correo.co`, phone: '300 123 4567', version: 1, createdAt: '2026-01-01T00:00:00.000Z',
})

let vehicles: VehicleWithBrand[]
let customers: Customer[]
let openAppointments: { pendiente: number; confirmada: number }
const vehicleCalls: URL[] = []
const customerCalls: URL[] = []
const saleCalls: { body: Record<string, unknown>; token: string | null }[] = []
const forbiddenCalls: string[] = []
let saleGate: Promise<void> = Promise.resolve()
let saleOverride: (() => Response) | null = null
const tokens = new Map<string, number>()

const bearer = (request: Request): string | null => request.headers.get('authorization')?.replace('Bearer ', '') ?? null
const userOf = (request: Request) => {
  const token = bearer(request)
  const id = token ? tokens.get(token) : undefined
  return id === undefined ? null : [...Object.values(USERS)].find((u) => u.id === id) ?? null
}
const unauthorized = () => HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
const page = <T,>(data: T[], url: URL) => {
  const p = Number(url.searchParams.get('page') ?? 1)
  const limit = Number(url.searchParams.get('limit') ?? 12)
  return { data: data.slice((p - 1) * limit, p * limit), meta: { total: data.length, page: p, limit, pages: Math.ceil(data.length / limit) } }
}

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const user = userOf(request)
    return user ? HttpResponse.json(user) : unauthorized()
  }),
  http.get('*/api/vehiculos', ({ request }) => {
    const url = new URL(request.url)
    vehicleCalls.push(url)
    const model = url.searchParams.get('model')?.toLowerCase()
    const found = vehicles.filter((v) => v.status !== 'vendido' && (!model || v.model.toLowerCase().includes(model)))
    return HttpResponse.json(page(found, url))
  }),
  http.get('*/api/clientes', ({ request }) => {
    const user = userOf(request)
    if (!user) return unauthorized()
    const url = new URL(request.url)
    customerCalls.push(url)
    const q = url.searchParams.get('q')?.toLowerCase()
    if (q !== undefined && q.length < 3) return HttpResponse.json({ message: ['q debe tener al menos 3 caracteres'] }, { status: 400 })
    return HttpResponse.json(page(customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.includes(q)), url))
  }),
  http.get('*/api/citas', ({ request }) => {
    if (!userOf(request)) return unauthorized()
    const url = new URL(request.url)
    const status = url.searchParams.get('status') as 'pendiente' | 'confirmada'
    return HttpResponse.json({ data: [], meta: { total: openAppointments[status], page: 1, limit: 1, pages: 1 } })
  }),
  // El historial de ventas es solo del admin: la pantalla de registrar NUNCA debe pedirlo.
  http.get('*/api/ventas', ({ request }) => {
    forbiddenCalls.push(request.url)
    return HttpResponse.json({ message: 'No tienes permisos para esta acción' }, { status: 403 })
  }),
  http.post('*/api/ventas', async ({ request }) => {
    if (!userOf(request)) return unauthorized()
    const body = (await request.json()) as { vehicleId: number; customerId: number; finalPrice: string; payment: 'contado' | 'credito' | 'leasing' }
    saleCalls.push({ body, token: bearer(request) })
    await saleGate
    if (saleOverride) return saleOverride()
    const vehicle = vehicles.find((v) => v.id === body.vehicleId)
    if (!vehicle) return HttpResponse.json({ message: `No existe el vehículo ${body.vehicleId}` }, { status: 404 })
    if (vehicle.status === 'vendido') return HttpResponse.json({ message: 'Ese vehículo ya fue vendido' }, { status: 409 })
    vehicle.status = 'vendido'
    return HttpResponse.json(
      { id: 77, vehicleId: vehicle.id, vehicle, customerId: body.customerId, customer: customers.find((c) => c.id === body.customerId), sellerId: 2, finalPrice: `${body.finalPrice}.00`, payment: body.payment, soldAt: '2026-10-19T15:00:00.000Z' },
      { status: 201 },
    )
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  vehicles = [car(1, 'Mazda 3', '95000000.00'), car(2, 'CX-30', '130000000.00'), car(3, 'CX-5', '160000000.00', { status: 'usado' })]
  customers = [customer(1, 'Ana Pérez'), customer(2, 'Luis Gómez')]
  openAppointments = { pendiente: 0, confirmada: 0 }
  saleGate = Promise.resolve()
  saleOverride = null
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  vehicleCalls.length = 0
  customerCalls.length = 0
  saleCalls.length = 0
  forbiddenCalls.length = 0
})
afterAll(() => server.close())

/* ---------------- Montaje ---------------- */
function Where() {
  const location = useLocation()
  return (
    <>
      <span data-testid="where">{location.pathname + location.search}</span>
      <span data-testid="history-state">{JSON.stringify(window.history.state)}</span>
    </>
  )
}

function renderPage(as: keyof typeof USERS | null = 'vendedor@automax.co') {
  if (as) {
    const user = USERS[as]
    const token = makeToken({ sub: user.id, role: user.role })
    tokens.set(token, user.id)
    setToken(token)
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/ventas/nueva']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route index element={<Navigate to="ventas/nueva" replace />} />
              <Route path="ventas/nueva" element={<RegistrarVentaPage />} />
            </Route>
          </Routes>
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const dialog = () => screen.getByRole('dialog')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
type User = ReturnType<typeof userEvent.setup>

async function chooseVehicle(user: User, name = 'Mazda 3') {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Elegir ${name}`) }))
}
async function chooseCustomer(user: User, search = 'ana', name = 'Ana Pérez') {
  await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), search)
  await user.click(await screen.findByRole('button', { name: `Elegir a ${name}` }))
}
const priceField = () => screen.getByLabelText('Precio final (COP)')
async function fillSale(user: User, payment = 'Contado') {
  await chooseVehicle(user)
  await chooseCustomer(user)
  await user.click(screen.getByRole('radio', { name: payment }))
}
async function review(user: User) {
  await user.click(screen.getByRole('button', { name: 'Revisar venta' }))
  return within(await screen.findByRole('dialog'))
}

/* ---------------- Formulario ---------------- */
describe('registrar venta: formulario', () => {
  it('muestra los tres pasos y ofrece los vehículos disponibles (nunca los vendidos)', async () => {
    vehicles.push(car(9, 'Vendido X', '1000000.00', { status: 'vendido' }))
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Registrar venta' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Vehículos disponibles' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).queryByText(/Vendido X/)).not.toBeInTheDocument()
    expect(vehicleCalls[0].searchParams.get('limit')).toBe('6')
    for (const title of ['Vehículo', 'Cliente', 'Precio y forma de pago']) expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
  })

  it('está en el menú del panel para el vendedor, que no tiene sección de historial', async () => {
    renderPage('vendedor@automax.co')
    await screen.findByRole('heading', { level: 1, name: 'Registrar venta' })
    const nav = within(screen.getByRole('navigation', { name: 'Panel' }))
    expect(nav.getByRole('link', { name: 'Registrar venta' })).toHaveAttribute('href', '/admin/ventas/nueva')
    expect(nav.queryByRole('link', { name: /^ventas$/i })).not.toBeInTheDocument()
    expect(forbiddenCalls).toEqual([])
  })

  it('busca vehículos por modelo con pausa y mínimo de 3 caracteres', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: 'Vehículos disponibles' })
    const box = screen.getByRole('searchbox', { name: 'Buscar vehículo' })
    const before = vehicleCalls.length
    await user.type(box, 'cx')
    expect(await screen.findByText('Escribe al menos 3 caracteres para buscar.')).toBeInTheDocument()
    await sleep(700)
    expect(vehicleCalls.length).toBe(before)
    await user.type(box, '-5')
    await waitFor(() => expect(vehicleCalls[vehicleCalls.length - 1].searchParams.get('model')).toBe('cx-5'))
    const list = await screen.findByRole('list', { name: 'Vehículos disponibles' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1))
  })

  it('elegir un vehículo lo resume, propone su precio de lista y permite cambiarlo', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseVehicle(user, 'CX-30')
    const chosen = screen.getByRole('group', { name: 'Vehículo elegido' })
    expect(within(chosen).getByText(/Mazda CX-30 2024/)).toBeInTheDocument()
    expect(priceField()).toHaveValue('130.000.000')
    await user.click(within(chosen).getByRole('button', { name: 'Cambiar vehículo' }))
    expect(await screen.findByRole('list', { name: 'Vehículos disponibles' })).toBeInTheDocument()
  })

  it('busca clientes en el servidor, con pausa y mínimo, y el texto no sale del estado de la página', async () => {
    const user = userEvent.setup()
    renderPage()
    const box = await screen.findByRole('searchbox', { name: 'Buscar cliente' })
    expect(screen.getByText('Escribe el nombre o el correo del cliente para buscarlo.')).toBeInTheDocument()
    await user.type(box, 'an')
    expect(customerCalls).toHaveLength(0)
    await user.type(box, 'a')
    await waitFor(() => expect(customerCalls[customerCalls.length - 1]?.searchParams.get('q')).toBe('ana'))
    expect(customerCalls.map((c) => c.searchParams.get('q'))).toEqual(['ana'])
    await user.click(await screen.findByRole('button', { name: 'Elegir a Ana Pérez' }))
    const chosen = screen.getByRole('group', { name: 'Cliente elegido' })
    expect(within(chosen).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(chosen).getByText('ana@correo.co')).toBeInTheDocument()
    const leaked = JSON.stringify({ url: screen.getByTestId('where').textContent, state: screen.getByTestId('history-state').textContent, s: { ...sessionStorage }, l: { ...localStorage } })
    expect(leaked).not.toMatch(/ana|Pérez/i)
  })

  it('sin coincidencias explica cómo se registra un cliente', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByRole('searchbox', { name: 'Buscar cliente' }), 'zzzz')
    expect(await screen.findByText('No hay clientes que coincidan')).toBeInTheDocument()
    expect(screen.getByText(/se registra al agendar una cita/i)).toBeInTheDocument()
  })

  it('al revisar sin completar nada marca lo que falta y no abre la confirmación', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: 'Vehículos disponibles' })
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByText('Elige el vehículo que se vendió.')).toBeInTheDocument()
    expect(screen.getByText('Elige el cliente que compra.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el precio final.')).toBeInTheDocument()
    expect(screen.getByText('Elige la forma de pago.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('valida el precio: mayor que cero y con tope de $ 5.000.000.000, con separador de miles', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    await user.clear(priceField())
    await user.type(priceField(), '5000000001')
    expect(priceField()).toHaveValue('5.000.000.001')
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByText('El precio final no puede superar $ 5.000.000.000.')).toBeInTheDocument()
    expect(priceField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.clear(priceField())
    await user.type(priceField(), '0')
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByText('El precio final debe ser mayor que cero.')).toBeInTheDocument()

    await user.clear(priceField())
    await user.type(priceField(), '5000000000')
    await user.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument() // justo el tope es válido
    expect(saleCalls).toHaveLength(0)
  })
})

/* ---------------- Confirmación y envío ---------------- */
describe('registrar venta: confirmación y envío', () => {
  it('muestra un resumen completo y no envía nada hasta confirmar', async () => {
    openAppointments = { pendiente: 2, confirmada: 1 }
    const user = userEvent.setup()
    renderPage()
    await fillSale(user, 'Crédito')
    await user.clear(priceField())
    await user.type(priceField(), '92500000')
    const d = await review(user)
    expect(d.getByRole('heading', { name: 'Confirmar la venta' })).toBeInTheDocument()
    const summary = d.getByRole('list', { name: 'Resumen de la venta' })
    for (const text of [/Mazda Mazda 3 2024|Mazda 3 2024/, /Ana Pérez/, /ana@correo\.co/, /\$\s?92\.500\.000/, /Crédito/, /\$\s?95\.000\.000/]) {
      expect(within(summary).getByText(text)).toBeInTheDocument()
    }
    expect(await d.findByText(/Se cancelarán las 3 citas abiertas de este vehículo/)).toBeInTheDocument()
    expect(d.getByText(/dejará de verse en el catálogo/)).toBeInTheDocument()
    expect(saleCalls).toHaveLength(0)
    await user.click(d.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saleCalls).toHaveLength(0)
  })

  it('sin citas abiertas lo dice, y si falla el conteo avisa sin bloquear', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    expect(await (await review(user)).findByText('Este vehículo no tiene citas abiertas.')).toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Volver' }))
    server.use(http.get('*/api/citas', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })))
    expect(await (await review(user)).findByText('Se cancelarán las citas abiertas de este vehículo.')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Confirmar venta' })).toBeEnabled()
  })

  it('confirma: envía vehículo, cliente, precio y pago (nunca el vendedor), muestra la venta y deja registrar otra', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillSale(user, 'Leasing')
    await user.clear(priceField())
    await user.type(priceField(), '90000000')
    const d = await review(user)
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    const done = await screen.findByRole('status', { name: 'Venta registrada' })
    expect(saleCalls).toEqual([{ body: { vehicleId: 1, customerId: 1, finalPrice: '90000000', payment: 'leasing' }, token: expect.any(String) }])
    expect(Object.keys(saleCalls[0].body)).not.toContain('sellerId')
    expect(within(done).getByText(/Mazda 3/)).toBeInTheDocument()
    expect(within(done).getByText(/Ana Pérez/)).toBeInTheDocument()
    expect(within(done).getByText(/Leasing/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(forbiddenCalls).toEqual([]) // el vendedor nunca pidió el historial

    await user.click(screen.getByRole('button', { name: 'Registrar otra venta' }))
    const list = await screen.findByRole('list', { name: 'Vehículos disponibles' })
    await waitFor(() => expect(within(list).queryByText(/Mazda 3/)).not.toBeInTheDocument()) // ya no se ofrece
    expect(screen.queryByRole('group', { name: 'Cliente elegido' })).not.toBeInTheDocument()
  })

  it('mientras envía bloquea los botones y Esc, y un doble clic hace una sola petición', async () => {
    let release!: () => void
    saleGate = new Promise<void>((resolve) => { release = resolve })
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    await user.dblClick(d.getByRole('button', { name: 'Confirmar venta' }))
    const busy = await d.findByRole('button', { name: 'Registrando…' })
    expect(busy).toBeDisabled()
    expect(d.getByRole('button', { name: 'Volver' })).toBeDisabled()
    expect(saleCalls).toHaveLength(1)
    const cancelled = !dialog().dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(cancelled).toBe(true) // Esc no cierra mientras envía
    release()
    await screen.findByRole('status', { name: 'Venta registrada' })
    expect(saleCalls).toHaveLength(1)
  })

  it('409 porque ya se vendió: lo dice claro, no pisa nada y ofrece elegir otro vehículo', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    vehicles[0].status = 'vendido' // otra persona se adelantó
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    const alert = await d.findByRole('alert')
    expect(alert).toHaveTextContent('Ese vehículo ya fue vendido por otra persona')
    expect(d.queryByRole('button', { name: 'Confirmar venta' })).not.toBeInTheDocument()
    await user.click(d.getByRole('button', { name: 'Elegir otro vehículo' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Vehículos disponibles' })
    expect(within(list).queryByText(/Mazda 3/)).not.toBeInTheDocument()
    // El cliente y el pago elegidos se conservan.
    expect(screen.getByRole('group', { name: 'Cliente elegido' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Contado' })).toBeChecked()
  })

  it('un error del servidor se muestra en español y se puede reintentar', async () => {
    saleOverride = () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    expect(await d.findByRole('alert')).not.toHaveTextContent(/internal/i)
    saleOverride = null
    await user.click(d.getByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('status', { name: 'Venta registrada' })
    expect(saleCalls).toHaveLength(2)
  })

  it('un 400 del servidor muestra su mensaje (por ejemplo el tope del precio)', async () => {
    saleOverride = () => HttpResponse.json({ message: 'El precio final no puede superar $ 5.000.000.000 COP' }, { status: 400 })
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    expect(await d.findByRole('alert')).toHaveTextContent('no puede superar $ 5.000.000.000')
  })

  it('si el cliente ya no existe lo dice y deja volver a elegirlo', async () => {
    saleOverride = () => HttpResponse.json({ message: 'No existe el cliente 1' }, { status: 404 })
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    expect(await d.findByRole('alert')).toHaveTextContent('Ese cliente ya no existe')
    await user.click(d.getByRole('button', { name: 'Elegir otro cliente' }))
    expect(screen.queryByRole('group', { name: 'Cliente elegido' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Vehículo elegido' })).toBeInTheDocument()
  })

  it('los datos del cliente no acaban en la URL, el historial, los storages ni la consola', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const user = userEvent.setup()
    renderPage()
    await fillSale(user)
    const d = await review(user)
    await user.click(d.getByRole('button', { name: 'Confirmar venta' }))
    await screen.findByRole('status', { name: 'Venta registrada' })
    const leaked = JSON.stringify({ url: screen.getByTestId('where').textContent, state: screen.getByTestId('history-state').textContent, s: { ...sessionStorage }, l: { ...localStorage } })
    for (const word of ['Ana', 'Pérez', 'ana@correo.co', '300 123']) expect(leaked).not.toContain(word)
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/ana@correo|Pérez/)
      spy.mockRestore()
    }
  })
})

describe('registrar venta: acceso', () => {
  it('el admin también puede registrar', async () => {
    renderPage('admin@automax.co')
    expect(await screen.findByRole('heading', { level: 1, name: 'Registrar venta' })).toBeInTheDocument()
  })

  it('un usuario con rol cliente no ve la pantalla ni pide datos de clientes', async () => {
    renderPage('cliente@correo.co')
    await screen.findByText(/no tiene acceso al panel/i)
    expect(customerCalls).toHaveLength(0)
    expect(saleCalls).toHaveLength(0)
  })
})
