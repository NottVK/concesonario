import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getToken, setToken } from '@/api/session'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { LoginPage } from '@/features/admin/LoginPage'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { formatShortDate, formatTime } from '@/lib/bogota'
import { GOOD_PASSWORD, USERS, makeToken } from '@/test/auth'
import type { AppointmentRow } from './api'
import { CitasPage } from './CitasPage'

/* ---------------- Datos y servidor simulado ---------------- */
const FUTURE = (day: number, hourUtc = 15): string => `2099-11-${String(day).padStart(2, '0')}T${String(hourUtc).padStart(2, '0')}:00:00.000Z`

function cita(id: number, name: string, over: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id, customerId: id, vehicleId: 100 + id, scheduledAt: FUTURE(id), durationMin: 60, status: 'pendiente',
    customer: { id, name, email: `${name.split(' ')[0].toLowerCase()}@correo.co`, phone: id % 2 ? `300 123 45${id}` : null, createdAt: '2026-01-01T00:00:00.000Z' },
    vehicle: {
      id: 100 + id, brandId: 1, brand: { id: 1, name: 'Mazda', country: 'Japón', logoUrl: null }, model: `Modelo ${id}`, year: 2024,
      version: 'Touring', price: '100000000.00', mileage: 0, fuel: 'gasolina', transmission: 'manual', color: 'Gris',
      status: 'nuevo', description: null, images: [],
    },
    ...over,
  }
}

let db: AppointmentRow[]
const listCalls: URL[] = []
/** Todos los intentos de pedir la lista, incluso los que el servidor rechaza (401 o 403). */
const listAttempts: string[] = []
const patchCalls: { id: number; status: string; token: string | null }[] = []
let patchGate: Promise<void> = Promise.resolve()
let patchOverride: (() => Response | Promise<Response>) | null = null
let detailOverride: (() => Response) | null = null
let listOverride: (() => Response | Promise<Response>) | null = null
const tokens = new Map<string, number>()
const expired = new Set<string>()

const bearer = (request: Request): string | null => request.headers.get('authorization')?.replace('Bearer ', '') ?? null
const userOf = (request: Request) => {
  const token = bearer(request)
  const id = token ? tokens.get(token) : undefined
  if (!token || id === undefined || expired.has(token)) return null
  return [...Object.values(USERS)].find((u) => u.id === id) ?? null
}
const unauthorized = () => HttpResponse.json({ message: 'No autorizado' }, { status: 401 })

const server = setupServer(
  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    const user = USERS[body.email as keyof typeof USERS]
    if (!user || body.password !== GOOD_PASSWORD) return HttpResponse.json({ message: 'Credenciales inválidas' }, { status: 401 })
    const accessToken = makeToken({ sub: user.id, role: user.role })
    tokens.set(accessToken, user.id)
    return HttpResponse.json({ accessToken, user })
  }),
  http.get('*/api/auth/me', ({ request }) => {
    const user = userOf(request)
    return user ? HttpResponse.json(user) : unauthorized()
  }),
  http.get('*/api/citas', async ({ request }) => {
    listAttempts.push(request.url)
    const user = userOf(request)
    if (!user) return unauthorized()
    if (user.role === 'cliente') return HttpResponse.json({ message: 'No tienes permisos para esta acción' }, { status: 403 })
    const url = new URL(request.url)
    listCalls.push(url)
    if (listOverride) return await listOverride()
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 12)
    const customer = url.searchParams.get('customer')?.toLowerCase()
    if (customer !== undefined && customer.length < 3) return HttpResponse.json({ message: ['customer debe tener al menos 3 caracteres'] }, { status: 400 })
    const filtered = db
      .filter((row) => !customer || row.customer.name.toLowerCase().includes(customer) || row.customer.email.toLowerCase().includes(customer))
      .filter((row) => !status || row.status === status)
      .filter((row) => !from || new Date(row.scheduledAt) >= new Date(from))
      .filter((row) => !to || new Date(row.scheduledAt) <= new Date(to))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    return HttpResponse.json({
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: { total: filtered.length, page, limit, pages: Math.ceil(filtered.length / limit) },
    })
  }),
  http.get('*/api/citas/:id', ({ request, params }) => {
    if (!userOf(request)) return unauthorized()
    if (detailOverride) return detailOverride()
    const found = db.find((row) => row.id === Number(params.id))
    return found ? HttpResponse.json(found) : HttpResponse.json({ message: 'No existe la cita' }, { status: 404 })
  }),
  http.patch('*/api/citas/:id/estado', async ({ request, params }) => {
    if (!userOf(request)) return unauthorized()
    const { status } = (await request.json()) as { status: string }
    patchCalls.push({ id: Number(params.id), status, token: bearer(request) })
    await patchGate
    if (patchOverride) return patchOverride()
    const found = db.find((row) => row.id === Number(params.id))
    if (!found) return HttpResponse.json({ message: 'No existe la cita' }, { status: 404 })
    const allowed = { pendiente: ['confirmada', 'cancelada'], confirmada: ['cancelada'], cancelada: [] }[found.status]
    if (!allowed.includes(status as never)) {
      return HttpResponse.json({ message: `No se puede pasar una cita de ${found.status} a ${status}` }, { status: 409 })
    }
    found.status = status as AppointmentRow['status']
    return HttpResponse.json(found)
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  db = [
    cita(1, 'Ana Pérez'),
    cita(2, 'Luis Gómez'),
    cita(3, 'Marta Ruiz'),
    cita(4, 'Pablo Soto', { status: 'confirmada' }),
    cita(5, 'Elena Díaz', { status: 'cancelada' }),
  ]
  patchGate = Promise.resolve()
  patchOverride = null
  detailOverride = null
  listOverride = null
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  expired.clear()
  listCalls.length = 0
  listAttempts.length = 0
  patchCalls.length = 0
})
afterAll(() => server.close())

/* ---------------- Montaje ---------------- */
let client: QueryClient

function Where() {
  const location = useLocation()
  return (
    <>
      <span data-testid="where">{location.pathname + location.search}</span>
      <span data-testid="history-state">{JSON.stringify(window.history.state)}</span>
    </>
  )
}

function renderCitas(path = '/admin/citas', as: keyof typeof USERS | null = 'vendedor@automax.co') {
  if (as) {
    const user = USERS[as]
    const token = makeToken({ sub: user.id, role: user.role })
    tokens.set(token, user.id)
    setToken(token)
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route index element={<Navigate to="citas" replace />} />
              <Route path="citas" element={<CitasPage />} />
            </Route>
          </Routes>
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent
const lastCall = () => listCalls[listCalls.length - 1]
const rows = () => within(screen.getByRole('list', { name: 'Citas' })).getAllByRole('listitem')
const names = () => rows().map((row) => within(row).getByText(/^(Ana|Luis|Marta|Pablo|Elena|Nuevo)/).textContent)
const rowOf = (name: string) => rows().find((row) => within(row).queryByText(name)) as HTMLElement
const dialog = () => screen.getByRole('dialog')
const confirmName = (name: string) => new RegExp(`^Confirmar la cita de ${name}`)
const cancelName = (name: string) => new RegExp(`^Cancelar la cita de ${name}`)

/* ---------------- Lista ---------------- */
describe('lista de citas', () => {
  it('por defecto muestra las pendientes (pide status=pendiente, 12 por página) con la URL limpia', async () => {
    renderCitas()
    expect(await screen.findByRole('heading', { name: 'Citas' })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Citas' })
    expect(lastCall().searchParams.get('status')).toBe('pendiente')
    expect(lastCall().searchParams.get('limit')).toBe('12')
    expect(lastCall().searchParams.get('page')).toBe('1')
    expect(names()).toEqual(['Ana Pérez', 'Luis Gómez', 'Marta Ruiz'])
    expect(screen.getByText('3 citas pendientes')).toBeInTheDocument()
    expect(where()).toBe('/admin/citas')
    expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('al cambiar de filtro no muestra el total anterior con la etiqueta nueva mientras llega la respuesta', async () => {
    const user = userEvent.setup()
    renderCitas()
    expect(await screen.findByText('3 citas pendientes')).toBeInTheDocument()
    listOverride = () => new Promise<Response>(() => {}) // la siguiente consulta no responde
    await user.click(screen.getByRole('button', { name: 'Confirmadas' }))
    expect(await screen.findByText('Actualizando…')).toBeInTheDocument()
    expect(screen.queryByText('3 citas confirmadas')).not.toBeInTheDocument()
    expect(screen.queryByText('3 citas pendientes')).not.toBeInTheDocument()
  })

  it('/admin lleva a las citas', async () => {
    renderCitas('/admin')
    await screen.findByRole('list', { name: 'Citas' })
    expect(where()).toBe('/admin/citas')
  })

  it('cada fila muestra fecha y hora de Bogotá, cliente, contacto, vehículo con enlace y estado', async () => {
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    const first = rowOf('Ana Pérez')
    expect(within(first).getByText(formatShortDate(db[0].scheduledAt))).toBeInTheDocument()
    expect(within(first).getByText(`${formatTime(db[0].scheduledAt)} a ${formatTime('2099-11-01T16:00:00.000Z')}`)).toBeInTheDocument()
    expect(within(first).getByText('ana@correo.co')).toBeInTheDocument()
    expect(within(first).getByText('300 123 451')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'Mazda Modelo 1 2024' })).toHaveAttribute('href', '/catalogo/101')
    expect(within(first).getByText('Pendiente')).toBeInTheDocument()
    // Sin teléfono, no se inventa nada.
    expect(within(rowOf('Luis Gómez')).queryByText(/300/)).not.toBeInTheDocument()
  })

  it('los botones dependen del estado: pendiente confirma y cancela, confirmada solo cancela, cancelada ninguno', async () => {
    renderCitas('/admin/citas?status=all')
    await screen.findByRole('list', { name: 'Citas' })
    expect(within(rowOf('Ana Pérez')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Confirmar', 'Cancelar'])
    expect(within(rowOf('Pablo Soto')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar'])
    expect(within(rowOf('Elena Díaz')).queryAllByRole('button')).toHaveLength(0)
    expect(within(rowOf('Elena Díaz')).getByText('Sin acciones')).toBeInTheDocument()
  })

  it('marca "Ya pasó" las citas vencidas que no están canceladas', async () => {
    db.push(cita(6, 'Nuevo Vencido', { scheduledAt: '2020-01-06T15:00:00.000Z' }))
    db.push(cita(7, 'Nuevo Cancelado Viejo', { scheduledAt: '2020-01-07T15:00:00.000Z', status: 'cancelada' }))
    renderCitas('/admin/citas?status=all')
    await screen.findByRole('list', { name: 'Citas' })
    expect(within(rowOf('Nuevo Vencido')).getByText('Ya pasó')).toBeInTheDocument()
    expect(within(rowOf('Nuevo Cancelado Viejo')).queryByText('Ya pasó')).not.toBeInTheDocument()
    expect(within(rowOf('Ana Pérez')).queryByText('Ya pasó')).not.toBeInTheDocument()
  })

  it('el estado no depende solo del color: lleva texto', async () => {
    renderCitas('/admin/citas?status=all')
    await screen.findByRole('list', { name: 'Citas' })
    for (const [name, label] of [['Ana Pérez', 'Pendiente'], ['Pablo Soto', 'Confirmada'], ['Elena Díaz', 'Cancelada']] as const) {
      expect(within(rowOf(name)).getByText(label)).toBeInTheDocument()
    }
  })

  it('los botones de estado filtran, cambian la URL y "Pendientes" la deja limpia', async () => {
    const user = userEvent.setup()
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    await user.click(screen.getByRole('button', { name: 'Confirmadas' }))
    await waitFor(() => expect(lastCall().searchParams.get('status')).toBe('confirmada'))
    expect(where()).toBe('/admin/citas?status=confirmada')
    expect(await screen.findByText('1 cita confirmada')).toBeInTheDocument()
    expect(names()).toEqual(['Pablo Soto'])

    await user.click(screen.getByRole('button', { name: 'Todas' }))
    await waitFor(() => expect(lastCall().searchParams.has('status')).toBe(false))
    expect(where()).toBe('/admin/citas?status=all')
    expect(await screen.findByText('5 citas')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pendientes' }))
    await waitFor(() => expect(lastCall().searchParams.get('status')).toBe('pendiente'))
    expect(where()).toBe('/admin/citas')
  })

  it('filtra por fechas (instantes de Bogotá, de principio a fin de día) y "Limpiar filtros" lo deshace', async () => {
    const user = userEvent.setup()
    renderCitas('/admin/citas?status=all')
    await screen.findByRole('list', { name: 'Citas' })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2099-11-02' } })
    await waitFor(() => expect(lastCall().searchParams.get('from')).toBe('2099-11-02T00:00:00-05:00'))
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2099-11-03' } })
    await waitFor(() => expect(lastCall().searchParams.get('to')).toBe('2099-11-03T23:59:59-05:00'))
    expect(where()).toBe('/admin/citas?status=all&from=2099-11-02&to=2099-11-03')
    await waitFor(() => expect(names()).toEqual(['Luis Gómez', 'Marta Ruiz']))

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(where()).toBe('/admin/citas'))
    expect(screen.getByLabelText('Desde')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Pendientes' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('una URL con basura se limpia: estado desconocido, fecha imposible, rango al revés y página inválida', async () => {
    renderCitas('/admin/citas?status=bogus&from=2099-02-30&to=abc&page=-3')
    await screen.findByRole('list', { name: 'Citas' })
    expect(lastCall().searchParams.get('status')).toBe('pendiente')
    expect(lastCall().searchParams.has('from')).toBe(false)
    expect(lastCall().searchParams.get('page')).toBe('1')
    await waitFor(() => expect(where()).toBe('/admin/citas'))
  })

  it('un rango al revés en la URL se endereza', async () => {
    renderCitas('/admin/citas?status=all&from=2099-11-10&to=2099-11-01')
    await screen.findByRole('list', { name: 'Citas' })
    expect(lastCall().searchParams.get('from')).toBe('2099-11-01T00:00:00-05:00')
    expect(lastCall().searchParams.get('to')).toBe('2099-11-10T23:59:59-05:00')
    await waitFor(() => expect(where()).toBe('/admin/citas?status=all&from=2099-11-01&to=2099-11-10'))
  })

  describe('búsqueda por cliente', () => {
    const search = () => screen.getByRole('searchbox', { name: 'Buscar por cliente' })
    const withCustomer = () => listCalls.filter((call) => call.searchParams.has('customer'))

    it('espera a que se deje de escribir y pide el texto al servidor (nunca filtra en el navegador)', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      await user.type(search(), 'marta')
      await waitFor(() => expect(lastCall().searchParams.get('customer')).toBe('marta'))
      // Con pausa: ni "mar" ni "mart" llegaron al servidor, solo el texto final.
      expect(withCustomer().map((call) => call.searchParams.get('customer'))).toEqual(['marta'])
      expect(await screen.findByText('1 cita pendiente')).toBeInTheDocument()
      expect(names()).toEqual(['Marta Ruiz'])
    })

    it('busca también por correo, sin importar espacios alrededor', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      await user.type(search(), '  luis@corr  ')
      await waitFor(() => expect(lastCall().searchParams.get('customer')).toBe('luis@corr'))
      await waitFor(() => expect(names()).toEqual(['Luis Gómez']))
    })

    it('con menos de 3 caracteres no consulta y avisa; con 3 sí', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      const before = listCalls.length
      await user.type(search(), 'an')
      expect(await screen.findByText('Escribe al menos 3 caracteres para buscar.')).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(listCalls.length).toBe(before)
      await user.type(search(), 'a')
      await waitFor(() => expect(lastCall().searchParams.get('customer')).toBe('ana'))
      expect(screen.queryByText('Escribe al menos 3 caracteres para buscar.')).not.toBeInTheDocument()
    })

    it('solo espacios no cuenta como búsqueda', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      await user.type(search(), '     ')
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(withCustomer()).toHaveLength(0)
    })

    it('el texto vive solo en el estado de la página: no está en la URL, el historial ni los storages', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      await user.type(search(), 'perez')
      await waitFor(() => expect(lastCall().searchParams.get('customer')).toBe('perez'))
      const leaked = JSON.stringify({ url: where(), state: screen.getByTestId('history-state').textContent, session: { ...sessionStorage }, local: { ...localStorage } })
      expect(leaked).not.toContain('perez')
      expect(where()).toBe('/admin/citas')
    })

    it('al cambiar el texto vuelve a la página 1 y se combina con los demás filtros', async () => {
      db = Array.from({ length: 13 }, (_, i) => cita(i + 1, `Ana Prueba${i + 1}`))
      const user = userEvent.setup()
      renderCitas('/admin/citas?page=2')
      await screen.findByRole('list', { name: 'Citas' })
      expect(lastCall().searchParams.get('page')).toBe('2')
      await user.type(search(), 'ana')
      await waitFor(() => expect(lastCall().searchParams.get('customer')).toBe('ana'))
      expect(lastCall().searchParams.get('page')).toBe('1')
      expect(lastCall().searchParams.get('status')).toBe('pendiente')
      expect(where()).toBe('/admin/citas')
    })

    it('sin resultados lo dice y "Limpiar filtros" también borra el texto', async () => {
      const user = userEvent.setup()
      renderCitas()
      await screen.findByRole('list', { name: 'Citas' })
      await user.type(search(), 'zzzz')
      expect(await screen.findByText('No hay citas con estos filtros')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
      await waitFor(() => expect(names()).toEqual(['Ana Pérez', 'Luis Gómez', 'Marta Ruiz']))
      expect(search()).toHaveValue('')
      expect(lastCall().searchParams.has('customer')).toBe(false)
    })
  })

  it('pagina de a 12 y pide la página elegida', async () => {
    const user = userEvent.setup()
    for (let id = 10; id < 40; id++) db.push(cita(id, `Nuevo ${id}`))
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    expect(rows()).toHaveLength(12)
    expect(screen.getByText('33 citas pendientes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(lastCall().searchParams.get('page')).toBe('2'))
    expect(where()).toBe('/admin/citas?page=2')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page'))
  })

  it('cambiar un filtro vuelve a la página 1', async () => {
    const user = userEvent.setup()
    for (let id = 10; id < 40; id++) db.push(cita(id, `Nuevo ${id}`))
    renderCitas('/admin/citas?page=2')
    await screen.findByRole('list', { name: 'Citas' })
    await user.click(screen.getByRole('button', { name: 'Confirmadas' }))
    await waitFor(() => expect(where()).toBe('/admin/citas?status=confirmada'))
  })

  it('muestra esqueletos mientras carga', async () => {
    listOverride = () => new Promise<Response>(() => {}) // la lista nunca responde
    renderCitas()
    expect(await screen.findByRole('list', { name: 'Cargando citas' })).toHaveAttribute('aria-busy', 'true')
  })

  it('sin pendientes: mensaje de "todo al día" con salida a ver todas', async () => {
    db = db.filter((row) => row.status !== 'pendiente')
    const user = userEvent.setup()
    renderCitas()
    expect(await screen.findByText('No hay citas pendientes: todo está al día')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver todas las citas' }))
    await waitFor(() => expect(where()).toBe('/admin/citas?status=all'))
  })

  it('sin resultados con filtros: lo dice y permite limpiarlos', async () => {
    renderCitas('/admin/citas?status=cancelada&from=2099-12-01')
    expect(await screen.findByText('No hay citas con estos filtros')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a las pendientes' }))
    await screen.findByRole('list', { name: 'Citas' })
  })

  it('un error del servidor se muestra en español, sin textos técnicos, y permite reintentar', async () => {
    listOverride = () => HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 })
    const user = userEvent.setup()
    renderCitas()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos cargar las citas')
    expect(alert).toHaveTextContent('El servidor tuvo un problema')
    expect(alert).not.toHaveTextContent('Internal')
    listOverride = null
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('list', { name: 'Citas' })
  })

  it('la lista siempre llega de la API ordenada: la más próxima primero', async () => {
    db[0].scheduledAt = FUTURE(9)
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    expect(names()).toEqual(['Luis Gómez', 'Marta Ruiz', 'Ana Pérez'])
  })
})

/* ---------------- Acceso ---------------- */
describe('acceso a las citas', () => {
  it('el admin y el vendedor ven la lista y el menú tiene "Citas"', async () => {
    for (const email of ['admin@automax.co', 'vendedor@automax.co'] as const) {
      const view = renderCitas('/admin/citas', email)
      await screen.findByRole('list', { name: 'Citas' })
      expect(screen.getByRole('link', { name: 'Citas' })).toHaveAttribute('href', '/admin/citas')
      view.unmount()
      tokens.clear()
    }
  })

  it('un usuario con rol cliente no ve datos ni los pide al servidor', async () => {
    renderCitas('/admin/citas', 'cliente@correo.co')
    expect(await screen.findByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeInTheDocument()
    expect(listAttempts).toEqual([])
    expect(screen.queryByText(/@correo\.co/)).not.toBeInTheDocument()
  })

  it('defensa en profundidad: aunque se monte la página sin la guarda, con rol cliente o sin sesión no pide datos de clientes', async () => {
    for (const email of ['cliente@correo.co', null] as const) {
      if (email) {
        const token = makeToken({ sub: USERS[email].id, role: USERS[email].role })
        tokens.set(token, USERS[email].id)
        setToken(token)
      }
      const view = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/admin/citas']}>
            <AuthProvider>
              <CitasPage />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await new Promise((resolve) => setTimeout(resolve, 150))
      view.unmount()
    }
    expect(listAttempts).toEqual([]) // ni siquiera lo intenta
  })

  it('sin sesión lleva al login y no pide datos', async () => {
    renderCitas('/admin/citas', null)
    expect(await screen.findByRole('heading', { name: 'Entrar al panel' })).toBeInTheDocument()
    expect(listCalls).toHaveLength(0)
  })

  it('cerrar sesión borra de la memoria los datos de los clientes', async () => {
    const user = userEvent.setup()
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    expect(client.getQueryCache().getAll().length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(document.body.innerHTML).not.toContain('ana@correo.co')
  })

  it('los datos de clientes están solo en memoria: no aparecen en la URL, el historial, los storages ni la consola', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const user = userEvent.setup()
    renderCitas()
    await screen.findByRole('list', { name: 'Citas' })
    await user.click(screen.getByRole('button', { name: 'Todas' }))
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    await screen.findByText(/Cita de Ana Pérez confirmada/)
    const personal = ['Ana', 'Pérez', 'ana@correo.co', '300 123', 'Luis', 'Marta', 'Gómez']
    const leaked = JSON.stringify({ url: where(), state: screen.getByTestId('history-state').textContent, session: { ...sessionStorage }, local: { ...localStorage } })
    for (const word of personal) expect(leaked).not.toContain(word)
    expect(sessionStorage.getItem('automax.token')).toBe(getToken()) // lo único guardado es el token
    expect(Object.keys(sessionStorage).filter((key) => !['automax.token', 'automax.compare'].includes(key))).toEqual([])
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/ana@correo|Pérez|Gómez/)
      spy.mockRestore()
    }
  })
})

/* ---------------- Confirmar y cancelar ---------------- */
describe('confirmar y cancelar citas', () => {
  it('pide confirmación con el resumen y el cambio de estado antes de enviar nada', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    const modal = dialog()
    expect(within(modal).getByRole('heading', { name: 'Confirmar esta cita' })).toBeInTheDocument()
    expect(within(modal).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(modal).getByText(/ana@correo\.co/)).toBeInTheDocument()
    expect(within(modal).getByText('Mazda Modelo 1 2024')).toBeInTheDocument()
    expect(within(modal).getByText('Pendiente')).toBeInTheDocument()
    expect(within(modal).getByText('Confirmada')).toBeInTheDocument()
    expect(patchCalls).toHaveLength(0)
    await user.click(within(modal).getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchCalls).toHaveLength(0)
  })

  it('confirmar: envía el estado, avisa con un mensaje y la cita pasa a Confirmadas', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    expect(await screen.findByText('Cita de Ana Pérez confirmada. Ahora aparece en Confirmadas.')).toBeInTheDocument()
    expect(patchCalls).toEqual([{ id: 1, status: 'confirmada', token: getToken() }])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(names()).toEqual(['Luis Gómez', 'Marta Ruiz'])) // la lista se refrescó
    expect(screen.getByText('2 citas pendientes')).toBeInTheDocument()
  })

  it('cancelar una pendiente o una confirmada, con su propio texto y botón explícito', async () => {
    const user = userEvent.setup()
    renderCitas('/admin/citas?status=all')
    await user.click(await screen.findByRole('button', { name: cancelName('Pablo Soto') }))
    expect(within(dialog()).getByRole('heading', { name: 'Cancelar esta cita' })).toBeInTheDocument()
    expect(within(dialog()).getByText(/no se puede reactivar/)).toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Sí, cancelar la cita' }))
    expect(await screen.findByText('Cita de Pablo Soto cancelada. La hora quedó libre.')).toBeInTheDocument()
    expect(patchCalls).toEqual([{ id: 4, status: 'cancelada', token: getToken() }])
    await waitFor(() => expect(within(rowOf('Pablo Soto')).getByText('Cancelada')).toBeInTheDocument())
  })

  it('mientras envía bloquea los botones y Esc, y un doble clic hace una sola petición', async () => {
    let release: () => void = () => {}
    patchGate = new Promise<void>((resolve) => (release = resolve))
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    const confirm = within(dialog()).getByRole('button', { name: 'Confirmar cita' })
    // Tres clics en el mismo instante, antes de que React repinte el botón como deshabilitado.
    act(() => {
      confirm.click()
      confirm.click()
      confirm.click()
    })
    const sending = await within(dialog()).findByRole('button', { name: 'Confirmando…' })
    expect(sending).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Volver' })).toBeDisabled()
    const esc = new Event('cancel', { cancelable: true })
    dialog().dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(true)
    release()
    await screen.findByText(/Cita de Ana Pérez confirmada/)
    expect(patchCalls).toHaveLength(1)
  })

  it('409: muestra el estado ACTUAL de la cita (cancelada por otra persona), no un error genérico, y refresca la lista', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    db[0].status = 'cancelada' // otra persona la canceló mientras tanto
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    const modal = await screen.findByRole('heading', { name: 'No se pudo confirmar la cita' })
    expect(modal).toBeInTheDocument()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Esta cita ya está cancelada y una cita cancelada no se puede reactivar.')
    expect(within(dialog()).getByText('Estado actual:').parentElement).toHaveTextContent('Cancelada')
    expect(within(dialog()).getByText(/La lista de citas ya se actualizó/)).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Confirmar cita' })).not.toBeInTheDocument() // ya no se puede reintentar
    await user.click(within(dialog()).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(names()).toEqual(['Luis Gómez', 'Marta Ruiz'])) // Ana ya no está pendiente
  })

  it('409 porque otra persona ya la confirmó: lo dice con el estado actual', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    db[0].status = 'confirmada'
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Esta cita ya estaba confirmada: otra persona se te adelantó.')
    expect(within(dialog()).getByText('Estado actual:').parentElement).toHaveTextContent('Confirmada')
  })

  it('409 al cancelar una que ya estaba cancelada', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: cancelName('Luis Gómez') }))
    db[1].status = 'cancelada'
    await user.click(within(dialog()).getByRole('button', { name: 'Sí, cancelar la cita' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Esta cita ya estaba cancelada: otra persona se te adelantó.')
  })

  it('409 si no se puede consultar el estado actual: mensaje honesto y la lista se refresca igual', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    db[0].status = 'cancelada'
    detailOverride = () => HttpResponse.json({ message: 'fallo' }, { status: 500 })
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('La cita cambió de estado mientras la procesábamos')
    expect(within(dialog()).queryByText('Estado actual:')).not.toBeInTheDocument()
  })

  it('404: la cita ya no existe', async () => {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    db = db.filter((row) => row.id !== 1)
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Esta cita ya no existe')
  })

  it.each([
    ['403', () => HttpResponse.json({ message: 'No tienes permisos para esta acción' }, { status: 403 }), /no tiene permiso para cambiar citas/],
    ['429', () => HttpResponse.json({ message: 'ThrottlerException' }, { status: 429 }), /Demasiados intentos/],
    ['500', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 }), /El servidor tuvo un problema/],
    ['corte de red', () => HttpResponse.error(), /No hay conexión/],
  ])('error %s: mensaje claro en español, el diálogo sigue abierto y se puede reintentar', async (_name, response, expected) => {
    patchOverride = response
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent(expected)
    expect(alert).not.toHaveTextContent(/Throttler|Internal/)
    // Se puede reintentar y esta vez funciona.
    patchOverride = null
    await user.click(within(dialog()).getByRole('button', { name: 'Reintentar' }))
    await screen.findByText(/Cita de Ana Pérez confirmada/)
  })

  it('al atender la última cita de una página, vuelve a la anterior', async () => {
    for (let id = 10; id < 22; id++) db.push(cita(id, `Nuevo ${id}`)) // 3 + 12 = 15 pendientes: la página 2 tiene 3
    db = db.filter((row) => row.id !== 2 && row.id !== 3) // quedan 13: la página 2 tiene 1
    const user = userEvent.setup()
    renderCitas('/admin/citas?page=2')
    await screen.findByRole('list', { name: 'Citas' })
    expect(rows()).toHaveLength(1)
    await user.click(within(rows()[0]).getByRole('button', { name: /^Confirmar la cita/ }))
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    await screen.findByText(/confirmada\. Ahora aparece/)
    await waitFor(() => expect(where()).toBe('/admin/citas'))
    await waitFor(() => expect(rows()).toHaveLength(12))
  })
})

/* ---------------- Sesión vencida mientras se confirma ---------------- */
describe('sesión vencida mientras se confirma una cita', () => {
  async function startConfirm() {
    const user = userEvent.setup()
    renderCitas()
    await user.click(await screen.findByRole('button', { name: confirmName('Ana Pérez') }))
    expired.add(getToken() as string) // el servidor ya no acepta este token
    await user.click(within(dialog()).getByRole('button', { name: 'Confirmar cita' }))
    await screen.findByRole('heading', { name: 'Tu sesión venció' })
    return user
  }
  const reloginDialog = () => screen.getAllByRole('dialog').find((d) => within(d).queryByText('Tu sesión venció')) as HTMLElement

  it('si vuelve a entrar el mismo usuario, la confirmación se reintenta sola y queda hecha', async () => {
    const user = await startConfirm()
    expect(patchCalls).toHaveLength(0) // el 401 llegó antes de ejecutar nada
    await user.type(within(reloginDialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(reloginDialog()).getByRole('button', { name: 'Volver a entrar' }))
    expect(await screen.findByText(/Cita de Ana Pérez confirmada/)).toBeInTheDocument()
    // El 401 lo da la puerta de autenticación, antes de ejecutar nada: solo queda registrado el reintento, con el token nuevo.
    expect(patchCalls).toHaveLength(1)
    expect(patchCalls[0].token).toBe(getToken())
    expect(db[0].status).toBe('confirmada')
  })

  it('si entra OTRA persona, la confirmación NO se hace con su cuenta', async () => {
    const user = await startConfirm()
    await user.clear(within(reloginDialog()).getByLabelText('Correo'))
    await user.type(within(reloginDialog()).getByLabelText('Correo'), 'otro@automax.co')
    await user.type(within(reloginDialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(reloginDialog()).getByRole('button', { name: 'Volver a entrar' }))
    expect(await screen.findByText(/una cuenta distinta a la anterior/)).toBeInTheDocument()
    expect(db[0].status).toBe('pendiente')
    expect(patchCalls.every((call) => call.token !== getToken())).toBe(true)
    expect(screen.queryByText(/Cita de Ana Pérez confirmada/)).not.toBeInTheDocument()
  })
})
