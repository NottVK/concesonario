import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isAxiosError } from 'axios'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '@/api/client'
import { getToken, setToken } from '@/api/session'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { LoginPage } from '@/features/admin/LoginPage'
import { GOOD_PASSWORD, USERS, makeToken } from '@/test/auth'
import type { TestUser } from '@/test/auth'
import { AuthProvider } from './AuthContext'
import { RequireRole, safeAdminPath } from './guards'

/* ---------------- Servidor simulado ---------------- */
const tokens = new Map<string, number>() // tokens que el servidor acepta → id
const expired = new Set<string>() // tokens que el servidor ya considera vencidos
const loginBodies: { email: string; password: string }[] = []
const clientesCalls: { token: string | null; url: string }[] = []
let reincarnate = false
let gate: Promise<void> = Promise.resolve()

const bearer = (request: Request): string | null => request.headers.get('authorization')?.replace('Bearer ', '') ?? null
const allUsers = (): TestUser[] => [...Object.values(USERS), { ...USERS['vendedor@automax.co'], id: 77 }]

const server = setupServer(
  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    loginBodies.push(body)
    if (body.email === 'limite@automax.co') return HttpResponse.json({ message: 'ThrottlerException' }, { status: 429 })
    if (body.password !== GOOD_PASSWORD) return HttpResponse.json({ message: 'Credenciales inválidas' }, { status: 401 })
    const found = USERS[body.email as keyof typeof USERS]
    if (!found) return HttpResponse.json({ message: 'Credenciales inválidas' }, { status: 401 })
    const user = reincarnate && found.id === 2 ? { ...found, id: 77 } : found
    const accessToken = makeToken({ sub: user.id, role: user.role })
    tokens.set(accessToken, user.id)
    return HttpResponse.json({ accessToken, user })
  }),
  http.get('*/api/auth/me', ({ request }) => {
    const token = bearer(request)
    const id = token ? tokens.get(token) : undefined
    if (!token || id === undefined || expired.has(token)) return HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
    return HttpResponse.json(allUsers().find((u) => u.id === id))
  }),
  http.get('*/api/clientes', async ({ request }) => {
    const token = bearer(request)
    const url = new URL(request.url)
    clientesCalls.push({ token, url: url.search })
    if (url.searchParams.has('lento')) await gate
    if (url.searchParams.has('siempre401')) return HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
    const id = token ? tokens.get(token) : undefined
    if (!token || id === undefined || expired.has(token)) return HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
    return HttpResponse.json({ by: id })
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  reincarnate = false
  gate = Promise.resolve()
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  expired.clear()
  loginBodies.length = 0
  clientesCalls.length = 0
})
afterAll(() => server.close())

/* ---------------- Aplicación mínima ---------------- */
function Workbench() {
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState('')
  const call = async (url: string): Promise<string> => {
    try {
      const response = await api.get<{ by: number }>(url)
      return `ok:${response.data.by}`
    } catch (error) {
      return `error:${isAxiosError(error) ? error.response?.status : 'x'}`
    }
  }
  return (
    <section>
      <label>
        Borrador
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button onClick={async () => setResult(await call('/clientes'))}>Cargar clientes</button>
      <button onClick={async () => setResult((await Promise.all([call('/clientes'), call('/clientes?n=2')])).join('|'))}>
        Cargar dos
      </button>
      <button onClick={async () => setResult((await Promise.all([call('/clientes?rapido'), call('/clientes?lento')])).join('|'))}>
        Rápido y lento
      </button>
      <button onClick={async () => setResult(await call('/clientes?siempre401'))}>Siempre 401</button>
      <output data-testid="result">{result}</output>
    </section>
  )
}

function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname}</span>
}

let client: QueryClient

function renderApp(path = '/admin') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <RequireRole roles={['admin', 'vendedor']}>
                  <AdminLayout />
                </RequireRole>
              }
            >
              <Route index element={<Workbench />} />
              <Route path="solo-admin" element={<RequireRole roles={['admin']}><p>Zona exclusiva de admin</p></RequireRole>} />
            </Route>
          </Routes>
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return view
}

const where = () => screen.getByTestId('where').textContent
const result = () => screen.getByTestId('result').textContent

async function login(user: ReturnType<typeof userEvent.setup>, email: string, password = GOOD_PASSWORD) {
  await user.clear(screen.getByLabelText('Correo'))
  await user.type(screen.getByLabelText('Correo'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: /^Entrar$|^Volver a entrar$/ }))
}

async function loggedInAs(email: keyof typeof USERS, path = '/admin') {
  const user = userEvent.setup()
  renderApp(path)
  await screen.findByRole('heading', { name: 'Entrar al panel' })
  await login(user, email)
  await screen.findByRole('button', { name: 'Cargar clientes' })
  return user
}

const dialog = () => screen.getByRole('dialog')

/* ---------------- Inicio de sesión y guardas ---------------- */
describe('inicio de sesión', () => {
  it('sin sesión, /admin lleva al login; al entrar vuelve a la ruta pedida y guarda el token en sessionStorage', async () => {
    const user = userEvent.setup()
    renderApp('/admin/solo-admin')
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(where()).toBe('/admin/login')
    await login(user, 'admin@automax.co')
    expect(await screen.findByText('Zona exclusiva de admin')).toBeInTheDocument()
    expect(where()).toBe('/admin/solo-admin')
    expect(getToken()).toBe(sessionStorage.getItem('automax.token'))
    expect(localStorage.length).toBe(0)
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })

  it('credenciales malas: mensaje único, sin token y sin abrir el diálogo de re-login', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    await login(user, 'admin@automax.co', 'otra-clave-123')
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    await login(user, 'no-existe@automax.co')
    await waitFor(() => expect(loginBodies).toHaveLength(2))
    expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.') // idéntico para un correo inexistente
    expect(getToken()).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('429 (límite de intentos): mensaje amable', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    await login(user, 'limite@automax.co')
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera un minuto')
  })

  it('campos vacíos: avisa sin llamar a la API', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu correo y tu contraseña')
    expect(loginBodies).toHaveLength(0)
  })

  it('con token guardado al abrir la pestaña, confirma al usuario con el servidor', async () => {
    const token = makeToken({ sub: 2, role: 'vendedor' })
    tokens.set(token, 2)
    setToken(token)
    renderApp()
    expect(await screen.findByRole('button', { name: 'Cargar clientes' })).toBeInTheDocument()
    expect(screen.getByText('Víctor Vendedor')).toBeInTheDocument()
  })

  it('un token guardado que el servidor ya no acepta lleva al login sin abrir el diálogo de re-login', async () => {
    const token = makeToken({ sub: 2 })
    setToken(token) // el servidor no lo conoce
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('una cuenta con rol cliente entra pero no tiene acceso al panel', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    await login(user, 'cliente@correo.co')
    expect(await screen.findByRole('heading', { name: 'Esta cuenta no tiene acceso al panel' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await screen.findByRole('heading', { name: 'Entrar al panel' })
  })

  it('el vendedor ve "sin permiso" en una sección de admin, con salida al inicio', async () => {
    const user = userEvent.setup()
    renderApp('/admin/solo-admin')
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    await login(user, 'vendedor@automax.co')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para esta sección' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al inicio del panel' })).toHaveAttribute('href', '/admin')
  })

  it('ya con sesión, /admin/login lleva al panel', async () => {
    const token = makeToken({ sub: 1, role: 'admin' })
    tokens.set(token, 1)
    setToken(token)
    renderApp('/admin/login')
    expect(await screen.findByRole('button', { name: 'Cargar clientes' })).toBeInTheDocument()
    expect(where()).toBe('/admin')
  })

  it.each([
    ['/admin/citas?status=all', '/admin/citas?status=all'], ['/admin', '/admin'],
    ['//evil.com', '/admin'], ['https://evil.com/admin', '/admin'], ['/catalogo', '/admin'], ['/admin\\@evil.com', '/admin'],
    ['/administrador', '/admin'], ['/admin/login', '/admin'], ['/admin/login?x=1', '/admin'], ['/admin?x=1', '/admin?x=1'],
    [null, '/admin'], [42, '/admin'], ['/admin\n/x', '/admin'],
  ])('safeAdminPath(%j) → %j: solo acepta rutas internas del panel', (input, expected) => {
    expect(safeAdminPath(input)).toBe(expected)
  })
})

/* ---------------- Contraseña ---------------- */
describe('la contraseña no se retiene', () => {
  it('el campo queda vacío en cuanto se envía, aunque la respuesta tarde, y no está en ningún estado ni almacenamiento', async () => {
    let release: () => void = () => {}
    const hold = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/auth/login', async () => {
        await hold
        return HttpResponse.json({ message: 'Credenciales inválidas' }, { status: 401 })
      }),
    )
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    const secret = 'contraseña-ultra-secreta-98765'
    await user.type(screen.getByLabelText('Correo'), 'admin@automax.co')
    await user.type(screen.getByLabelText('Contraseña'), secret)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    // Mientras la petición sigue en vuelo:
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()
    expect(document.body.innerHTML).not.toContain(secret)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(secret)
    expect(JSON.stringify({ ...localStorage })).not.toContain(secret)
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(secret)

    release()
    await screen.findByRole('alert')
    // Tras el error sigue vacía: hay que volver a escribirla.
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(document.body.innerHTML).not.toContain(secret)
    expect(screen.getByLabelText('Contraseña')).toHaveFocus()
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret)
      spy.mockRestore()
    }
    // El campo es de tipo contraseña y pide al navegador su gestor, no un valor controlado.
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('el botón se bloquea al enviar: dos envíos seguidos hacen una sola petición', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    await user.type(screen.getByLabelText('Correo'), 'admin@automax.co')
    await user.type(screen.getByLabelText('Contraseña'), GOOD_PASSWORD)
    const submit = screen.getByRole('button', { name: 'Entrar' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await screen.findByRole('button', { name: 'Cargar clientes' })
    expect(loginBodies).toHaveLength(1)
  })

  it('en el diálogo de re-login tampoco se retiene tras enviarla', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    await screen.findByRole('dialog')
    const secret = GOOD_PASSWORD
    await user.type(within(dialog()).getByLabelText('Contraseña'), secret)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(result()).toBe('ok:2'))
    expect(document.body.innerHTML).not.toContain(secret)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(secret)
  })
})

/* ---------------- 401 a mitad de uso y re-login ---------------- */
describe('401 a mitad de uso', () => {
  it('abre el diálogo SIN desmontar la página; si vuelve a entrar el mismo usuario, reintenta y lo escrito sigue ahí', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    await user.type(screen.getByLabelText('Borrador'), 'texto a medio escribir')
    const firstToken = getToken()
    expired.add(firstToken as string)

    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    expect(await screen.findByRole('heading', { name: 'Tu sesión venció' })).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Correo')).toHaveValue('vendedor@automax.co') // precargado
    expect(within(dialog()).getByLabelText('Contraseña')).toHaveFocus() // el foco va directo a la contraseña
    expect(screen.getByLabelText('Borrador')).toHaveValue('texto a medio escribir') // la página sigue montada

    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))

    await waitFor(() => expect(result()).toBe('ok:2'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Borrador')).toHaveValue('texto a medio escribir')
    // La petición salió dos veces: primero con el token vencido y luego con el nuevo.
    expect(clientesCalls).toHaveLength(2)
    expect(clientesCalls[0].token).toBe(firstToken)
    expect(clientesCalls[1].token).toBe(getToken())
    expect(clientesCalls[1].token).not.toBe(firstToken)
  })

  it('si entra OTRO usuario NO se reintenta, se vacía la caché y se avisa', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    client.setQueryData(['datos-del-vendedor'], { secreto: 'solo de Víctor' })
    expired.add(getToken() as string)

    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    await screen.findByRole('dialog')
    await user.clear(within(dialog()).getByLabelText('Correo'))
    await user.type(within(dialog()).getByLabelText('Correo'), 'otro@automax.co')
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))

    await waitFor(() => expect(result()).toBe('error:401'))
    expect(clientesCalls).toHaveLength(1) // jamás se reintentó con la cuenta de otra persona
    expect(client.getQueryData(['datos-del-vendedor'])).toBeUndefined()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(await screen.findByText(/Entraste como Olga Otra, una cuenta distinta a la anterior/)).toBeInTheDocument()
    expect(screen.getByText('Olga Otra')).toBeInTheDocument()
    expect(where()).toBe('/admin')
  })

  it('compara el ID, no el correo: el mismo correo con otro id cuenta como otro usuario', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    reincarnate = true // el servidor ahora devuelve el id 77 para ese correo
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    await screen.findByRole('dialog')
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(result()).toBe('error:401'))
    expect(clientesCalls).toHaveLength(1)
    expect(screen.getByText(/una cuenta distinta a la anterior/)).toBeInTheDocument()
  })

  it('"Salir" cierra la sesión: la petición falla, el token se borra y se vuelve al login', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    client.setQueryData(['algo'], 1)
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    await screen.findByRole('dialog')
    await user.click(within(dialog()).getByRole('button', { name: 'Salir' }))
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('automax.token')).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(clientesCalls).toHaveLength(1)
  })

  it('con la sesión vencida el diálogo no se cierra con Esc', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Cargar clientes' }))
    const modal = await screen.findByRole('dialog')
    const cancel = new Event('cancel', { cancelable: true })
    modal.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
  })

  it('dos peticiones con 401 a la vez comparten UN diálogo y las dos se reintentan una vez', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Cargar dos' }))
    await screen.findByRole('dialog')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(result()).toBe('ok:2|ok:2'))
    expect(clientesCalls).toHaveLength(4)
    expect(loginBodies.filter((b) => b.password === GOOD_PASSWORD)).toHaveLength(2) // el login inicial y el re-login
  })

  it('un 401 tardío con el token viejo, cuando ya se renovó la sesión, se reintenta sin abrir otro diálogo', async () => {
    let release: () => void = () => {}
    gate = new Promise<void>((resolve) => (release = resolve))
    const user = await loggedInAs('vendedor@automax.co')
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Rápido y lento' }))
    await screen.findByRole('dialog')
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    release() // ahora llega el 401 de la petición lenta, que salió con el token viejo
    await waitFor(() => expect(result()).toBe('ok:2|ok:2'))
    expect(loginBodies.filter((b) => b.password === GOOD_PASSWORD)).toHaveLength(2) // un solo re-login
  })

  it('un 401 tardío de la cuenta anterior NO se reintenta con la sesión de otra persona', async () => {
    let release: () => void = () => {}
    gate = new Promise<void>((resolve) => (release = resolve))
    const user = await loggedInAs('vendedor@automax.co')
    expired.add(getToken() as string)
    await user.click(screen.getByRole('button', { name: 'Rápido y lento' }))
    await screen.findByRole('dialog')
    await user.clear(within(dialog()).getByLabelText('Correo'))
    await user.type(within(dialog()).getByLabelText('Correo'), 'otro@automax.co')
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    release() // llega el 401 de la petición lenta, que salió con el token de Víctor
    await waitFor(() => expect(result()).toBe('error:401|error:401'))
    expect(clientesCalls.filter((call) => call.url === '?lento')).toHaveLength(1) // nunca se repitió con la cuenta de Olga
    expect(clientesCalls.every((call) => call.token !== getToken())).toBe(true)
  })

  it('si el reintento vuelve a dar 401 no hay bucle: falla y se cierra la sesión', async () => {
    const user = await loggedInAs('vendedor@automax.co')
    await user.click(screen.getByRole('button', { name: 'Siempre 401' }))
    await screen.findByRole('dialog')
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(clientesCalls.filter((c) => c.url === '?siempre401')).toHaveLength(2) // original + un solo reintento
    expect(getToken()).toBeNull()
  })
})

/* ---------------- Cierre de sesión ---------------- */
describe('cerrar sesión', () => {
  it('borra el token y vacía toda la caché de datos', async () => {
    const user = await loggedInAs('admin@automax.co')
    client.setQueryData(['clientes', 1], { nombre: 'Dato de cliente' })
    client.setQueryData(['citas'], [{ id: 1 }])
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('automax.token')).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('avisa a las demás pestañas por BroadcastChannel', async () => {
    const received: unknown[] = []
    const otherTab = new BroadcastChannel('automax-auth')
    otherTab.onmessage = (event) => received.push(event.data)
    const user = await loggedInAs('admin@automax.co')
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(received).toEqual([{ type: 'logout' }]))
    otherTab.close()
  })

  it('si otra pestaña cierra sesión, esta también: token, usuario y caché se vacían y se explica por qué', async () => {
    await loggedInAs('admin@automax.co')
    client.setQueryData(['clientes'], [{ nombre: 'Dato sensible' }])
    const otherTab = new BroadcastChannel('automax-auth')
    otherTab.postMessage({ type: 'logout' })
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    expect(await screen.findByText('Cerraste sesión en otra pestaña.')).toBeInTheDocument()
    expect(getToken()).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    otherTab.close()
  })

  it('una pestaña sin sesión ignora el aviso de cierre', async () => {
    renderApp('/admin/login')
    await screen.findByRole('heading', { name: 'Entrar al panel' })
    const otherTab = new BroadcastChannel('automax-auth')
    otherTab.postMessage({ type: 'logout' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByText('Cerraste sesión en otra pestaña.')).not.toBeInTheDocument()
    otherTab.close()
  })

  it('sin BroadcastChannel usa la señal de storage (sin datos) para avisar y para recibir', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      await loggedInAs('admin@automax.co')
      client.setQueryData(['x'], 1)
      const spy = vi.spyOn(Storage.prototype, 'setItem')
      window.dispatchEvent(new StorageEvent('storage', { key: 'automax.logout', newValue: String(Date.now()) }))
      await screen.findByRole('heading', { name: 'Entrar al panel' })
      expect(await screen.findByText('Cerraste sesión en otra pestaña.')).toBeInTheDocument()
      expect(client.getQueryCache().getAll()).toHaveLength(0)
      spy.mockRestore()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('la señal de storage no lleva datos y no deja nada guardado', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      const user = await loggedInAs('admin@automax.co')
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
      const signal = setItem.mock.calls.find(([key]) => key === 'automax.logout')
      expect(signal).toBeDefined()
      expect(Number(signal?.[1])).toBeGreaterThan(0) // solo una marca de tiempo
      expect(localStorage.getItem('automax.logout')).toBeNull() // se borra enseguida
      setItem.mockRestore()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/* ---------------- Vencimiento del token ---------------- */
describe('vencimiento de la sesión', () => {
  const seconds = (n: number): number => Math.ceil((Date.now() + n * 1000) / 1000)

  function sessionExpiringIn(userId: keyof typeof USERS, inSeconds: number): string {
    const user = USERS[userId]
    const token = makeToken({ sub: user.id, role: user.role, exp: seconds(inSeconds) })
    tokens.set(token, user.id)
    setToken(token)
    return token
  }

  it('avisa 2 minutos antes y permite renovar sin salir de la página', async () => {
    sessionExpiringIn('vendedor@automax.co', 121.2)
    renderApp()
    await screen.findByRole('button', { name: 'Cargar clientes' })
    expect(screen.queryByText(/Tu sesión vence a las/)).not.toBeInTheDocument()
    const warning = await screen.findByText(/Tu sesión vence a las/, undefined, { timeout: 4000 })
    expect(warning.textContent).not.toMatch(/\.\./) // sin doble punto tras "p. m."

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Renovar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Renueva tu sesión' })).toBeInTheDocument()
    // "Ahora no" lo cierra y la sesión sigue.
    await user.click(within(dialog()).getByRole('button', { name: 'Ahora no' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Cargar clientes' })).toBeInTheDocument()
  })

  it('al renovar con la misma cuenta el aviso desaparece (nuevo vencimiento a 1 hora)', async () => {
    sessionExpiringIn('vendedor@automax.co', 60)
    renderApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Renovar sesión' }))
    await user.type(within(dialog()).getByLabelText('Contraseña'), GOOD_PASSWORD)
    await user.click(within(dialog()).getByRole('button', { name: 'Volver a entrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText(/Tu sesión vence a las/)).not.toBeInTheDocument())
    expect(screen.queryByText(/una cuenta distinta/)).not.toBeInTheDocument()
  })

  it('al vencer abre el diálogo por sí solo, sin esperar a una petición fallida', async () => {
    sessionExpiringIn('vendedor@automax.co', 1.4)
    renderApp()
    await screen.findByRole('button', { name: 'Cargar clientes' })
    expect(await screen.findByRole('heading', { name: 'Tu sesión venció' }, { timeout: 4000 })).toBeInTheDocument()
    expect(clientesCalls).toHaveLength(0)
  })
})
