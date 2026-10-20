import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { setToken } from '@/api/session'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import type { Bot, ConnectionTest, Exchange } from './api'
import { BotsPage } from './BotsPage'

/* ---------------- Datos y servidor simulado ---------------- */
const bot = (id: number, name: string, over: Partial<Bot> = {}): Bot => ({
  id,
  name,
  url: `https://bot${id}.example.com/a2a`,
  active: true,
  keyPrefix: `0000000${id}`,
  hasKey: true,
  hasOutboundKey: id % 2 === 1,
  lastUsedAt: null,
  keyRotatedAt: '2026-10-01T10:00:00.000Z',
  limitPerMinute: 30,
  limitPerDay: 2000,
  outboundAuth: 'bearer',
  outboundLimitPerMinute: 10,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

const exchange = (id: number, over: Partial<Exchange> = {}): Exchange => ({
  id,
  botId: 1,
  botName: 'SegurosYa',
  direction: 'saliente',
  channel: 'a2a',
  status: 'ok',
  question: '¿Cuánto cuesta el SOAT?',
  answer: 'Desde $250.000 al año',
  tool: null,
  argsSummary: null,
  requestId: '11111111-1111-4111-8111-111111111111',
  durationMs: 120,
  bytesIn: 300,
  bytesOut: 60,
  createdAt: '2026-10-20T15:00:00.000Z',
  ...over,
})

let db: Bot[]
let exchanges: Exchange[]
let connection: ConnectionTest
let createFails: { status: number; message: string } | null
let listFails: boolean
const created: Record<string, unknown>[] = []
const patches: { id: number; body: Record<string, unknown> }[] = []
const rotated: number[] = []
const tested: number[] = []
const exchangeCalls: URL[] = []
const tokens = new Map<string, number>()
const NEW_KEY = 'amx_0a0b0c0d_CLAVE-NUEVA-QUE-SE-MUESTRA-UNA-SOLA-VEZ-0123'

const userOf = (request: Request) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  const id = token ? tokens.get(token) : undefined
  return id === undefined ? null : [...Object.values(USERS)].find((u) => u.id === id) ?? null
}
const guard = (request: Request) => {
  const user = userOf(request)
  if (!user) return HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
  if (user.role !== 'admin') return HttpResponse.json({ message: 'No tienes permisos' }, { status: 403 })
  return null
}

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const user = userOf(request)
    return user ? HttpResponse.json(user) : HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
  }),
  http.get('*/api/admin/bots', ({ request }) => {
    const denied = guard(request)
    if (denied) return denied
    return listFails ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : HttpResponse.json(db)
  }),
  http.post('*/api/admin/bots', async ({ request }) => {
    const denied = guard(request)
    if (denied) return denied
    const body = (await request.json()) as Record<string, unknown>
    created.push(body)
    if (createFails) return HttpResponse.json({ message: createFails.message }, { status: createFails.status })
    const saved = bot(db.length + 1, String(body.name), { url: (body.url as string | undefined) ?? null, hasOutboundKey: !!body.outboundApiKey })
    db.push(saved)
    return HttpResponse.json({ bot: saved, apiKey: NEW_KEY }, { status: 201 })
  }),
  http.patch('*/api/admin/bots/:id', async ({ request, params }) => {
    const denied = guard(request)
    if (denied) return denied
    const body = (await request.json()) as Record<string, unknown>
    patches.push({ id: Number(params.id), body })
    const found = db.find((b) => b.id === Number(params.id))
    if (!found) return HttpResponse.json({ message: 'No existe el bot' }, { status: 404 })
    if (typeof body.url === 'string' && body.url.startsWith('http://')) {
      return HttpResponse.json({ message: 'url no permitida: Solo se acepta https (http solo vale para una IP:puerto exacta de A2A_DEV_ALLOWED_TARGETS, en desarrollo).' }, { status: 400 })
    }
    Object.assign(found, body, body.outboundApiKey === null ? { hasOutboundKey: false } : {}, typeof body.outboundApiKey === 'string' ? { hasOutboundKey: true } : {})
    delete (found as Record<string, unknown>).outboundApiKey
    return HttpResponse.json(found)
  }),
  http.post('*/api/admin/bots/:id/rotar-clave', ({ request, params }) => {
    const denied = guard(request)
    if (denied) return denied
    rotated.push(Number(params.id))
    return HttpResponse.json({ bot: db.find((b) => b.id === Number(params.id)), apiKey: NEW_KEY })
  }),
  http.post('*/api/admin/bots/:id/probar-conexion', ({ request, params }) => {
    const denied = guard(request)
    if (denied) return denied
    tested.push(Number(params.id))
    return HttpResponse.json(connection)
  }),
  http.get('*/api/admin/intercambios', ({ request }) => {
    const denied = guard(request)
    if (denied) return denied
    const url = new URL(request.url)
    exchangeCalls.push(url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 15)
    const channel = url.searchParams.get('channel')
    const found = exchanges.filter((e) => !channel || e.channel === channel)
    return HttpResponse.json({ data: found.slice((page - 1) * limit, page * limit), meta: { page, limit, total: found.length, pages: Math.max(1, Math.ceil(found.length / limit)) } })
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  db = [bot(1, 'SegurosYa'), bot(2, 'Taller Express', { active: false, hasOutboundKey: false })]
  exchanges = [exchange(2, { botId: 2, botName: 'Taller Express', channel: 'mcp', direction: 'entrante', question: null, answer: null, tool: 'consultar_stock', argsSummary: 'marca=Mazda' }), exchange(1)]
  connection = { ok: true, name: 'SegurosYa Bot', description: 'Seguros: SOAT y todo riesgo', skills: ['soat', 'seguros'], originMismatch: false, flags: [] }
  createFails = null
  listFails = false
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  created.length = 0
  patches.length = 0
  rotated.length = 0
  tested.length = 0
  exchangeCalls.length = 0
})
afterAll(() => server.close())

/* ---------------- Montaje ---------------- */
function renderBots(path = '/admin/bots', as: keyof typeof USERS = 'admin@automax.co') {
  const user = USERS[as]
  const token = makeToken({ sub: user.id, role: user.role })
  tokens.set(token, user.id)
  setToken(token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route index element={<Navigate to="bots" replace />} />
              <Route path="bots" element={<RequireRole roles={['admin']}><BotsPage /></RequireRole>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const rows = () => within(screen.getByRole('list', { name: 'Bots' })).getAllByRole('listitem')
const rowOf = async (name: string) => (await screen.findByRole('heading', { level: 2, name })).closest('li') as HTMLElement
const dialog = () => screen.getByRole('dialog')
const fillName = async (user: ReturnType<typeof userEvent.setup>, value: string) => user.type(within(dialog()).getByLabelText(/^Nombre/), value)

/* ---------------- Lista ---------------- */
describe('lista de bots', () => {
  it('muestra cada bot con su estado, dirección, keys y límites, sin ningún secreto', async () => {
    renderBots()
    expect(await screen.findByRole('heading', { level: 1, name: 'Bots externos' })).toBeInTheDocument()
    await screen.findByRole('list', { name: 'Bots' })
    expect(rows()).toHaveLength(2)
    const first = rows()[0]!
    expect(within(first).getByText('SegurosYa')).toBeInTheDocument()
    expect(within(first).getByText('Activo')).toBeInTheDocument()
    expect(within(first).getByText('https://bot1.example.com/a2a')).toBeInTheDocument()
    expect(within(first).getByText('amx_00000001…')).toBeInTheDocument()
    expect(within(first).getByText('Key guardada (cifrada)')).toBeInTheDocument()
    expect(within(first).getByText('Hasta 30/min y 2.000/día')).toBeInTheDocument()
    expect(within(first).getByText('Hasta 10/min')).toBeInTheDocument()
    const second = rows()[1]!
    expect(within(second).getByText('Desactivado')).toBeInTheDocument()
    expect(within(second).getByText('Sin key')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/clave_hash|keyHash|CLAVE-NUEVA/)
  })

  it('«Bots» está en el menú del admin', async () => {
    renderBots()
    await screen.findByRole('list', { name: 'Bots' })
    expect(within(screen.getByRole('navigation', { name: 'Panel' })).getByRole('link', { name: 'Bots' })).toBeInTheDocument()
  })

  it('un vendedor no ve la sección ni entra por la URL', async () => {
    renderBots('/admin/bots', 'vendedor@automax.co')
    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bots externos' })).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Panel' })).queryByRole('link', { name: 'Bots' })).toBeNull()
  })

  it('sin bots: invita a registrar el primero', async () => {
    db = []
    renderBots()
    expect(await screen.findByText('Todavía no hay bots registrados')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: 'Registrar un bot' })[1]!)
    expect(dialog()).toBeInTheDocument()
  })

  it('si la lista falla muestra el error y deja reintentar', async () => {
    listFails = true
    renderBots()
    expect(await screen.findByText('No pudimos cargar los bots')).toBeInTheDocument()
    listFails = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('list', { name: 'Bots' })).toBeInTheDocument()
  })
})

/* ---------------- Registrar ---------------- */
describe('registrar un bot', () => {
  it('envía el cuerpo esperado, muestra la key UNA vez y después ya no está en pantalla', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Registrar un bot' }))
    await fillName(user, 'Bot Nuevo')
    await user.type(within(dialog()).getByLabelText(/^Dirección del bot/), 'https://nuevo.example.com/a2a')
    await user.type(within(dialog()).getByLabelText(/^Key que AutoMax le envía/), 'clave-saliente-123')
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))

    const reveal = await screen.findByRole('dialog', { name: /Bot registrado: Bot Nuevo/ })
    expect(created).toEqual([
      {
        name: 'Bot Nuevo',
        url: 'https://nuevo.example.com/a2a',
        outboundApiKey: 'clave-saliente-123',
        outboundAuth: 'bearer',
        outboundLimitPerMinute: 10,
        limitPerMinute: 30,
        limitPerDay: 2000,
      },
    ])
    expect(within(reveal).getByLabelText('Key del bot')).toHaveValue(NEW_KEY)
    expect(within(reveal).getByText(/Se muestra una sola vez/)).toBeInTheDocument()
    // La lista se refrescó y no lleva la key.
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(within(screen.getByRole('list', { name: 'Bots' })).queryByText(NEW_KEY)).toBeNull()

    await user.click(within(reveal).getByRole('button', { name: 'Ya la guardé' }))
    expect(screen.queryByLabelText('Key del bot')).toBeNull()
    expect(document.body.innerHTML).not.toContain(NEW_KEY)
  })

  it('copia la key al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    renderBots()
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(await screen.findByRole('button', { name: 'Registrar un bot' }))
    await fillName(user, 'Bot Nuevo')
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))
    const reveal = await screen.findByRole('dialog', { name: /Bot registrado/ })
    await user.click(within(reveal).getByRole('button', { name: 'Copiar key' }))
    expect(writeText).toHaveBeenCalledWith(NEW_KEY)
    expect(await within(reveal).findByText('Copiada')).toBeInTheDocument()
  })

  it('valida antes de enviar: nombre vacío, key sin dirección, límites fuera de rango', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Registrar un bot' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))
    expect(within(dialog()).getByText(/De 2 a 80 caracteres/)).toBeInTheDocument()
    await fillName(user, 'Bot Nuevo')
    await user.type(within(dialog()).getByLabelText(/^Key que AutoMax le envía/), 'clave-saliente-123')
    const limit = within(dialog()).getByLabelText('Consultas por minuto', { selector: '#bot-out-limit' })
    await user.clear(limit)
    await user.type(limit, '99')
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))
    expect(within(dialog()).getByText(/La key saliente se guarda atada a la dirección del bot: escribe también/)).toBeInTheDocument()
    expect(within(dialog()).getByText('Un número de 1 a 60.')).toBeInTheDocument()
    expect(created).toEqual([])
  })

  it('muestra tal cual el motivo que da el servidor (por ejemplo una URL no permitida) y no cierra el diálogo', async () => {
    createFails = { status: 400, message: 'url no permitida: Esa dirección apunta a una red interna o reservada.' }
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Registrar un bot' }))
    await fillName(user, 'Bot Interno')
    await user.type(within(dialog()).getByLabelText(/^Dirección del bot/), 'https://192.168.1.10/a2a')
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Esa dirección apunta a una red interna o reservada.')
    expect(screen.queryByLabelText('Key del bot')).toBeNull()
  })

  it('un nombre repetido (409) se explica con el mensaje del servidor', async () => {
    createFails = { status: 409, message: 'Ya existe un bot con ese nombre' }
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Registrar un bot' }))
    await fillName(user, 'SegurosYa')
    await user.click(within(dialog()).getByRole('button', { name: 'Registrar bot' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Ya existe un bot con ese nombre')
  })
})

/* ---------------- Editar ---------------- */
describe('editar un bot', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>, name = 'SegurosYa') => {
    await user.click(await screen.findByRole('button', { name: `Editar a ${name}` }))
    return dialog()
  }

  it('empieza con los valores actuales, sin cambios que guardar, y la key guardada no se muestra', async () => {
    renderBots()
    const user = userEvent.setup()
    await open(user)
    expect(within(dialog()).getByLabelText(/^Nombre/)).toBeDisabled()
    expect(within(dialog()).getByLabelText(/^Dirección del bot/)).toHaveValue('https://bot1.example.com/a2a')
    expect(within(dialog()).getByLabelText(/^Key nueva/)).toHaveValue('')
    expect(within(dialog()).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(within(dialog()).getByText('Aún no hay cambios que guardar.')).toBeInTheDocument()
  })

  it('envía SOLO lo que cambió', async () => {
    renderBots()
    const user = userEvent.setup()
    await open(user)
    const day = within(dialog()).getByLabelText('Consultas por día')
    await user.clear(day)
    await user.type(day, '500')
    await user.selectOptions(within(dialog()).getByLabelText('Cómo se envía la key'), 'x_api_key')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(patches).toEqual([{ id: 1, body: { limitPerDay: 500, outboundAuth: 'x_api_key' } }]))
    expect(await screen.findByText('Cambios de SegurosYa guardados.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('avisa de que cambiar el dominio borra la key guardada, y no avisa si la ruta es la misma o se da una key nueva', async () => {
    renderBots()
    const user = userEvent.setup()
    await open(user)
    const url = within(dialog()).getByLabelText(/^Dirección del bot/)
    await user.clear(url)
    await user.type(url, 'https://bot1.example.com/otra/ruta')
    expect(within(dialog()).queryByText(/se borrará/)).toBeNull()
    await user.clear(url)
    await user.type(url, 'https://otro-dominio.example.com/a2a')
    expect(within(dialog()).getByText(/se borrará/)).toBeInTheDocument()
    await user.type(within(dialog()).getByLabelText(/^Key nueva/), 'clave-nueva-1234')
    expect(within(dialog()).queryByText(/se borrará/)).toBeNull()
  })

  it('«Quitar la key guardada» manda null; una key nueva se envía en claro solo en esa petición', async () => {
    renderBots()
    const user = userEvent.setup()
    await open(user)
    await user.click(within(dialog()).getByRole('checkbox', { name: 'Quitar la key guardada' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(patches).toEqual([{ id: 1, body: { outboundApiKey: null } }]))
  })

  it('el rechazo del servidor (http) se muestra y el diálogo sigue abierto', async () => {
    renderBots()
    const user = userEvent.setup()
    await open(user)
    const url = within(dialog()).getByLabelText(/^Dirección del bot/)
    await user.clear(url)
    await user.type(url, 'http://bot1.example.com/a2a')
    await user.type(within(dialog()).getByLabelText(/^Key nueva/), 'clave-nueva-1234')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Solo se acepta https')
  })
})

/* ---------------- Activar, rotar, probar ---------------- */
describe('activar y desactivar', () => {
  it('desactiva un bot activo y avisa de lo que pasa', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Desactivar a SegurosYa' }))
    await waitFor(() => expect(patches).toEqual([{ id: 1, body: { active: false } }]))
    expect(await screen.findByText(/SegurosYa quedó desactivado/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Activar a SegurosYa' })).toBeInTheDocument()
  })

  it('activa uno desactivado', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Activar a Taller Express' }))
    await waitFor(() => expect(patches).toEqual([{ id: 2, body: { active: true } }]))
    expect(await screen.findByText('Taller Express quedó activo.')).toBeInTheDocument()
  })
})

describe('rotar la key', () => {
  it('pide confirmación; cancelar no rota nada', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Generar una key nueva para SegurosYa' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Rotar la key de SegurosYa' })
    expect(within(confirm).getByText(/dejará de funcionar al instante/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(rotated).toEqual([])
  })

  it('al confirmar muestra la key nueva una sola vez', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Generar una key nueva para SegurosYa' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Generar key nueva' }))
    const reveal = await screen.findByRole('dialog', { name: /Key nueva de SegurosYa/ })
    expect(rotated).toEqual([1])
    expect(within(reveal).getByLabelText('Key del bot')).toHaveValue(NEW_KEY)
    expect(within(reveal).getByText(/La key anterior ya dejó de funcionar/)).toBeInTheDocument()
    await user.click(within(reveal).getByRole('button', { name: 'Ya la guardé' }))
    expect(document.body.innerHTML).not.toContain(NEW_KEY)
  })
})

describe('probar la conexión', () => {
  it('conexión correcta: lo que dice el bot de sí mismo va como texto de un tercero no verificado', async () => {
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Probar la conexión con SegurosYa' }))
    const row = await rowOf('SegurosYa')
    const result = await within(row).findByText('Conexión correcta')
    expect(tested).toEqual([1])
    const box = result.closest('div')!
    expect(within(box).getByText(/tercero no verificado/)).toBeInTheDocument()
    expect(within(box).getByText('SegurosYa Bot')).toBeInTheDocument()
    expect(within(box).getByText('Seguros: SOAT y todo riesgo')).toBeInTheDocument()
    expect(within(box).getByText('Habilidades: soat, seguros')).toBeInTheDocument()
  })

  it('un nombre hostil se muestra como texto, sin crear elementos', async () => {
    connection = { ok: true, name: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script> https://atacante.example', skills: [], originMismatch: false, flags: [] }
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Probar la conexión con SegurosYa' }))
    const row = await rowOf('SegurosYa')
    await within(row).findByText('Conexión correcta')
    expect(within(row).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(row.querySelector('img, script, [onerror], a[href]')).toBeNull()
  })

  it('avisa si la tarjeta dice que el bot vive en otro dominio', async () => {
    connection = { ...connection, originMismatch: true }
    renderBots()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Probar la conexión con SegurosYa' }))
    expect(await screen.findByText(/vive en otro dominio/)).toBeInTheDocument()
    expect(screen.getByText(/no a esa/)).toBeInTheDocument()
  })

  it('si falla, muestra la categoría con su mensaje fijo y una explicación, sin direcciones ni códigos', async () => {
    connection = { ok: false, status: 'bloqueado_ssrf', message: 'Ese destino no está permitido.' }
    renderBots()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Probar la conexión con SegurosYa' }))
    expect(await screen.findByText('Ese destino no está permitido.')).toBeInTheDocument()
    expect(screen.getByText(/no pasa la política de seguridad/)).toBeInTheDocument()
  })

  it('sin dirección no se puede probar', async () => {
    db = [bot(1, 'Sin Direccion', { url: null, hasOutboundKey: false })]
    renderBots()
    expect(await screen.findByRole('button', { name: 'Probar la conexión con Sin Direccion' })).toBeDisabled()
  })
})

/* ---------------- Intercambios ---------------- */
describe('intercambios', () => {
  const openTab = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('tab', { name: 'Intercambios' }))
    return screen.findByRole('list', { name: 'Intercambios' })
  }

  it('lista lo guardado con quién escribió cada texto y el resultado', async () => {
    renderBots()
    const user = userEvent.setup()
    const list = await openTab(user)
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Taller Express')).toBeInTheDocument()
    expect(within(items[0]!).getByText('consultar_stock · marca=Mazda')).toBeInTheDocument()
    expect(within(items[0]!).getByText(/MCP · Entrante/)).toBeInTheDocument()
    expect(within(items[1]!).getByText(/Pregunta que enviamos/)).toBeInTheDocument()
    expect(within(items[1]!).getByText(/Respuesta del bot \(tercero no verificado/)).toBeInTheDocument()
    expect(within(items[1]!).getByText('Desde $250.000 al año')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Correcto')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Intercambios' })).toHaveAttribute('aria-selected', 'true')
  })

  it('el texto de un tercero se pinta como texto aunque traiga HTML', async () => {
    exchanges = [exchange(1, { answer: '<img src=x onerror=alert(1)> <script>alert(2)</script>', question: '<b onmouseover=alert(3)>hola</b>' })]
    renderBots()
    const list = await openTab(userEvent.setup())
    expect(within(list).getByText('<img src=x onerror=alert(1)> <script>alert(2)</script>')).toBeInTheDocument()
    expect(within(list).getByText('<b onmouseover=alert(3)>hola</b>')).toBeInTheDocument()
    expect(list.querySelector('img, script, b, [onerror], [onmouseover], a[href]')).toBeNull()
  })

  it('un intercambio entrante de A2A marca la pregunta como del tercero', async () => {
    exchanges = [exchange(1, { direction: 'entrante', question: '¿Tienen Mazda 3?', answer: 'Hay 1 coincidencia' })]
    renderBots()
    const list = await openTab(userEvent.setup())
    expect(within(list).getByText(/Pregunta del bot \(tercero no verificado/)).toBeInTheDocument()
    expect(within(list).getByText('Lo que respondió AutoMax')).toBeInTheDocument()
  })

  it('filtrar vuelve a pedir con el filtro y a la primera página', async () => {
    renderBots()
    const user = userEvent.setup()
    await openTab(user)
    await user.selectOptions(screen.getByLabelText('Canal'), 'mcp')
    await waitFor(() => expect(exchangeCalls.at(-1)?.searchParams.get('channel')).toBe('mcp'))
    expect(exchangeCalls.at(-1)?.searchParams.get('page')).toBe('1')
    expect(exchangeCalls.at(-1)?.searchParams.get('limit')).toBe('15')
    expect(await screen.findByText('consultar_stock · marca=Mazda')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    await waitFor(() => expect(exchangeCalls.at(-1)?.searchParams.has('channel')).toBe(false))
  })

  it('sin intercambios, o sin resultados con los filtros, lo explica', async () => {
    exchanges = []
    renderBots()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Intercambios' }))
    expect(await screen.findByText('Todavía no hay intercambios')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Resultado'), 'timeout')
    expect(await screen.findByText('No hay intercambios con esos filtros')).toBeInTheDocument()
  })
})
