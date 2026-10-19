import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { setToken } from '@/api/session'
import type { Customer } from '@/api/types'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import { ClientesPage } from './ClientesPage'

/* ---------------- Datos y servidor simulado ---------------- */
function cliente(id: number, name: string, over: Partial<Customer> = {}): Customer {
  return {
    id, name, email: `${name.split(' ')[0].toLowerCase()}${id}@correo.co`, phone: id % 2 ? `300 123 45${String(id).padStart(2, '0')}` : null,
    version: 1, createdAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

let db: Customer[]
const listCalls: URL[] = []
const putCalls: { id: number; body: Record<string, unknown> }[] = []
let putGate: Promise<void> = Promise.resolve()
const tokens = new Map<string, number>()

const userOf = (request: Request) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const id = token ? tokens.get(token) : undefined
  return id === undefined ? null : [...Object.values(USERS)].find((u) => u.id === id) ?? null
}
const unauthorized = () => HttpResponse.json({ message: 'No autorizado' }, { status: 401 })

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const user = userOf(request)
    return user ? HttpResponse.json(user) : unauthorized()
  }),
  http.get('*/api/clientes', ({ request }) => {
    const user = userOf(request)
    if (!user) return unauthorized()
    if (user.role === 'cliente') return HttpResponse.json({ message: 'No tienes permisos' }, { status: 403 })
    const url = new URL(request.url)
    listCalls.push(url)
    const q = url.searchParams.get('q')?.toLowerCase()
    if (q !== undefined && q.length < 3) return HttpResponse.json({ message: ['q debe tener al menos 3 caracteres'] }, { status: 400 })
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 12)
    const found = db.filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    return HttpResponse.json({
      data: found.slice((page - 1) * limit, page * limit),
      meta: { total: found.length, page, limit, pages: Math.ceil(found.length / limit) },
    })
  }),
  http.get('*/api/clientes/:id', ({ request, params }) => {
    if (!userOf(request)) return unauthorized()
    const found = db.find((c) => c.id === Number(params.id))
    return found ? HttpResponse.json(found) : HttpResponse.json({ message: 'No existe el cliente' }, { status: 404 })
  }),
  http.put('*/api/clientes/:id', async ({ request, params }) => {
    if (!userOf(request)) return unauthorized()
    const body = (await request.json()) as { name: string; email: string; phone?: string; version: number }
    putCalls.push({ id: Number(params.id), body })
    await putGate
    const found = db.find((c) => c.id === Number(params.id))
    if (!found) return HttpResponse.json({ message: 'No existe el cliente' }, { status: 404 })
    if (found.version !== body.version) {
      return HttpResponse.json({ message: 'Otra persona modificó este cliente mientras lo editabas. Recarga para ver los cambios.' }, { status: 409 })
    }
    if (db.some((c) => c.id !== found.id && c.email === body.email.toLowerCase())) {
      return HttpResponse.json({ message: 'Ya existe un cliente con ese correo' }, { status: 409 })
    }
    Object.assign(found, { name: body.name, email: body.email.toLowerCase(), phone: body.phone ?? null, version: found.version + 1 })
    return HttpResponse.json(found)
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  db = [
    cliente(1, 'Ana Pérez'),
    cliente(2, 'Luis Gómez'),
    cliente(3, 'Marta Ruiz'),
  ]
  putGate = Promise.resolve()
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  listCalls.length = 0
  putCalls.length = 0
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

function renderClientes(path = '/admin/clientes', as: keyof typeof USERS | null = 'vendedor@automax.co') {
  if (as) {
    const user = USERS[as]
    const token = makeToken({ sub: user.id, role: user.role })
    tokens.set(token, user.id)
    setToken(token)
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route index element={<Navigate to="clientes" replace />} />
              <Route path="clientes" element={<ClientesPage />} />
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
const list = () => screen.findByRole('list', { name: 'Clientes' })
const rows = () => within(screen.getByRole('list', { name: 'Clientes' })).getAllByRole('listitem')
const names = () => rows().map((row) => within(row).getByRole('heading', { level: 2 }).textContent)
const search = () => screen.getByRole('searchbox', { name: 'Buscar cliente' })
const dialog = () => screen.getByRole('dialog')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Editar a ${name}` }))
  return dialog()
}
const field = (label: string | RegExp) => within(dialog()).getByLabelText(label)
async function retype(user: ReturnType<typeof userEvent.setup>, label: string | RegExp, value: string) {
  const input = field(label)
  await user.clear(input)
  if (value) await user.type(input, value)
}

/* ---------------- Lista ---------------- */
describe('lista de clientes', () => {
  it('muestra los clientes paginados de a 12, con el total, y la URL limpia', async () => {
    renderClientes()
    expect(await screen.findByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument()
    await list()
    expect(lastCall().searchParams.get('page')).toBe('1')
    expect(lastCall().searchParams.get('limit')).toBe('12')
    expect(lastCall().searchParams.has('q')).toBe(false)
    expect(names()).toEqual(['Ana Pérez', 'Luis Gómez', 'Marta Ruiz'])
    expect(screen.getByText('3 clientes')).toBeInTheDocument()
    expect(within(rows()[0]).getByText('ana1@correo.co')).toBeInTheDocument()
    expect(within(rows()[1]).getByText('Sin teléfono')).toBeInTheDocument()
    expect(where()).toBe('/admin/clientes')
  })

  it('/admin/clientes está en el menú del panel', async () => {
    renderClientes()
    await list()
    expect(within(screen.getByRole('navigation', { name: 'Panel' })).getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/admin/clientes')
  })

  it('pagina y pide la página elegida', async () => {
    const user = userEvent.setup()
    for (let id = 10; id < 40; id++) db.push(cliente(id, `Nuevo ${id}`))
    renderClientes()
    await list()
    expect(rows()).toHaveLength(12)
    expect(screen.getByText('33 clientes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(lastCall().searchParams.get('page')).toBe('2'))
    expect(where()).toBe('/admin/clientes?page=2')
  })

  it('una página inválida en la URL se limpia', async () => {
    renderClientes('/admin/clientes?page=-4&q=ana')
    await list()
    await waitFor(() => expect(where()).toBe('/admin/clientes'))
  })

  it('no hay forma de borrar un cliente en la pantalla', async () => {
    renderClientes()
    await list()
    expect(screen.queryByRole('button', { name: /eliminar|borrar|quitar|suprimir/i })).not.toBeInTheDocument()
  })

  it('un error del servidor se muestra en español y permite reintentar', async () => {
    server.use(http.get('*/api/clientes', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderClientes()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos cargar los clientes')
    expect(alert).not.toHaveTextContent(/internal/i)
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    await list()
  })

  it('sin clientes lo dice', async () => {
    db = []
    renderClientes()
    expect(await screen.findByText('Todavía no hay clientes registrados')).toBeInTheDocument()
  })

  it('un usuario con rol cliente no ve datos ni los pide', async () => {
    renderClientes('/admin/clientes', 'cliente@correo.co')
    await screen.findByText(/no tiene acceso al panel/i)
    expect(listCalls).toHaveLength(0)
  })
})

/* ---------------- Búsqueda ---------------- */
describe('búsqueda de clientes', () => {
  it('espera a que se deje de escribir y pide el texto al servidor (nunca filtra en el navegador)', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await user.type(search(), 'marta')
    await waitFor(() => expect(lastCall().searchParams.get('q')).toBe('marta'))
    expect(listCalls.filter((c) => c.searchParams.has('q')).map((c) => c.searchParams.get('q'))).toEqual(['marta'])
    await waitFor(() => expect(names()).toEqual(['Marta Ruiz']))
    expect(screen.getByText('1 cliente')).toBeInTheDocument()
  })

  it('con menos de 3 caracteres no consulta y avisa; espacios solos no cuentan', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    const before = listCalls.length
    await user.type(search(), 'an')
    expect(await screen.findByText('Escribe al menos 3 caracteres para buscar.')).toBeInTheDocument()
    await sleep(700)
    expect(listCalls.length).toBe(before)
    await user.clear(search())
    await user.type(search(), '     ')
    await sleep(700)
    expect(listCalls.length).toBe(before)
  })

  it('el texto vive solo en el estado de la página: no está en la URL, el historial ni los storages', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await user.type(search(), 'perez')
    await waitFor(() => expect(lastCall().searchParams.get('q')).toBe('perez'))
    const leaked = JSON.stringify({ url: where(), state: screen.getByTestId('history-state').textContent, session: { ...sessionStorage }, local: { ...localStorage } })
    expect(leaked).not.toContain('perez')
    expect(where()).toBe('/admin/clientes')
  })

  it('al buscar vuelve a la página 1', async () => {
    for (let id = 10; id < 40; id++) db.push(cliente(id, `Nuevo ${id}`))
    const user = userEvent.setup()
    renderClientes('/admin/clientes?page=2')
    await list()
    await user.type(search(), 'nuevo')
    await waitFor(() => expect(lastCall().searchParams.get('q')).toBe('nuevo'))
    expect(lastCall().searchParams.get('page')).toBe('1')
    expect(where()).toBe('/admin/clientes')
  })

  it('sin resultados lo dice y "Limpiar búsqueda" la borra', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await user.type(search(), 'zzzz')
    expect(await screen.findByText('No hay clientes que coincidan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    await waitFor(() => expect(names()).toEqual(['Ana Pérez', 'Luis Gómez', 'Marta Ruiz']))
    expect(search()).toHaveValue('')
  })
})

/* ---------------- Edición ---------------- */
describe('editar un cliente', () => {
  it('abre con los datos actuales y no deja revisar mientras no haya cambios', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    expect(field('Nombre')).toHaveValue('Ana Pérez')
    expect(field('Correo')).toHaveValue('ana1@correo.co')
    expect(field(/^Teléfono/)).toHaveValue('300 123 4501')
    expect(within(dialog()).getByRole('button', { name: 'Revisar cambios' })).toBeDisabled()
    expect(within(dialog()).getByText('Aún no hay cambios que guardar.')).toBeInTheDocument()
  })

  it('valida formato de nombre, correo y teléfono antes de enviar nada', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', 'A')
    await retype(user, 'Correo', 'ana-sin-arroba')
    await retype(user, /^Teléfono/, '12 34')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    expect(await within(dialog()).findByText(/nombre debe tener al menos 2/i)).toBeInTheDocument()
    expect(within(dialog()).getByText(/correo válido/i)).toBeInTheDocument()
    expect(within(dialog()).getByText(/al menos 7 dígitos/i)).toBeInTheDocument()
    expect(field('Correo')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog()).queryByText('Revisar los cambios')).not.toBeInTheDocument()
    expect(putCalls).toHaveLength(0)
  })

  it('muestra solo lo que cambia (antes y después) y no envía nada hasta confirmar', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', 'Ana P. Pérez')
    await retype(user, 'Correo', 'ANA.NUEVA@Correo.co')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    const review = await within(dialog()).findByRole('table', { name: 'Cambios por guardar' })
    const cells = within(review).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
    expect(cells).toEqual([
      ['Nombre', 'Ana Pérez', 'Ana P. Pérez'],
      ['Correo', 'ana1@correo.co', 'ana.nueva@correo.co'],
    ])
    expect(putCalls).toHaveLength(0)
    // Volver conserva lo escrito.
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a editar' }))
    expect(field('Nombre')).toHaveValue('Ana P. Pérez')
  })

  it('guarda con la versión leída, avisa y refresca la lista', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', '  Ana P. Pérez ')
    await retype(user, /^Teléfono/, '')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Cambios de Ana P\. Pérez guardados/)).toBeInTheDocument()
    expect(putCalls).toEqual([{ id: 1, body: { name: 'Ana P. Pérez', email: 'ana1@correo.co', version: 1 } }])
    await waitFor(() => expect(names()[0]).toBe('Ana P. Pérez'))
    expect(db[0].version).toBe(2)
  })

  it('mientras envía bloquea los botones y un doble clic hace una sola petición', async () => {
    let release!: () => void
    putGate = new Promise<void>((resolve) => { release = resolve })
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Luis Gómez')
    await retype(user, 'Nombre', 'Luis G.')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    const save = await within(dialog()).findByRole('button', { name: 'Guardar cambios' })
    await user.dblClick(save)
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Guardando…' })).toBeDisabled())
    expect(putCalls).toHaveLength(1)
    release()
    await screen.findByText(/Cambios de Luis G\. guardados/)
    expect(putCalls).toHaveLength(1)
  })

  it('409 porque otra persona lo editó: lo dice, muestra los datos actuales y permite cargarlos para reintentar', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', 'Ana Editada')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    // Mientras tanto, otra persona la cambia.
    Object.assign(db[0], { name: 'Ana María Pérez', version: 2 })
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent('Otra persona modificó este cliente')
    expect(within(dialog()).getByText('Ana María Pérez')).toBeInTheDocument()
    expect(within(dialog()).getByText('Ana Editada')).toBeInTheDocument()
    expect(db[0].name).toBe('Ana María Pérez') // nada se pisó

    await user.click(within(dialog()).getByRole('button', { name: 'Cargar los datos actuales' }))
    expect(field('Nombre')).toHaveValue('Ana María Pérez')
    await retype(user, 'Nombre', 'Ana María P.')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText(/Cambios de Ana María P\. guardados/)
    expect(putCalls.map((c) => c.body.version)).toEqual([1, 2])
  })

  it('409 por correo repetido: vuelve al formulario con un mensaje que no dice de quién es', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Correo', 'luis2@correo.co')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    const message = await within(dialog()).findByText('Ese correo ya está registrado en otro cliente.')
    expect(message).toBeInTheDocument()
    expect(field('Correo')).toHaveAttribute('aria-invalid', 'true')
    expect(field('Correo')).toHaveValue('luis2@correo.co')
    expect(dialog()).not.toHaveTextContent(/Luis|Gómez/)
    expect(db[0].email).toBe('ana1@correo.co')
  })

  it('404: el cliente ya no existe', async () => {
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Marta Ruiz')
    await retype(user, 'Nombre', 'Marta R.')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    db.splice(2, 1)
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Este cliente ya no existe')
  })

  it('un error del servidor se muestra en español y se puede reintentar', async () => {
    server.use(http.put('*/api/clientes/:id', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', 'Ana Q')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).not.toHaveTextContent(/internal/i)
    await user.click(within(dialog()).getByRole('button', { name: 'Reintentar' }))
    await screen.findByText(/Cambios de Ana Q guardados/)
  })

  it('los datos personales no aparecen en la URL, el historial, los storages ni la consola', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const user = userEvent.setup()
    renderClientes()
    await list()
    await openEditor(user, 'Ana Pérez')
    await retype(user, 'Nombre', 'Ana Secreta')
    await user.click(within(dialog()).getByRole('button', { name: 'Revisar cambios' }))
    await user.click(await within(dialog()).findByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText(/Cambios de Ana Secreta guardados/)
    const leaked = JSON.stringify({ url: where(), state: screen.getByTestId('history-state').textContent, session: { ...sessionStorage }, local: { ...localStorage } })
    for (const word of ['Ana', 'Secreta', 'ana1@correo.co', '300 123', 'Luis', 'Gómez']) expect(leaked).not.toContain(word)
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toMatch(/ana1@correo|Secreta|Gómez/)
      spy.mockRestore()
    }
  })
})
