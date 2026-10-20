import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setToken } from '@/api/session'
import type { VehicleWithBrand } from '@/api/types'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { USERS, makeToken } from '@/test/auth'
import { InventarioPage } from './InventarioPage'

/* ---------------- Datos y servidor simulado ---------------- */
const MAZDA = { id: 1, name: 'Mazda', country: 'Japón', logoUrl: null }
const KIA = { id: 2, name: 'Kia', country: 'Corea', logoUrl: null }

function car(id: number, model: string, over: Partial<VehicleWithBrand> = {}): VehicleWithBrand {
  return {
    id, brandId: 1, brand: MAZDA, model, year: 2024, version: 'Touring', price: '95000000.00', mileage: 0, fuel: 'gasolina',
    transmission: 'automatica', color: 'Rojo', status: 'nuevo', revision: 1, description: null, images: ['/autos/mazda-3.webp'], ...over,
  }
}

let db: VehicleWithBrand[]
const tokens = new Map<string, number>()
const adminCalls: string[] = []
const posts: unknown[] = []
const puts: { id: number; body: Record<string, unknown> }[] = []
const deletes: number[] = []
let putOverride: (() => Response) | null = null
let deleteOverride: (() => Response) | null = null
let freshOverride: (() => VehicleWithBrand | null) | null = null

const server = setupServer(
  http.get('*/api/auth/me', ({ request }) => {
    const id = tokens.get(request.headers.get('authorization')?.replace('Bearer ', '') ?? '')
    const user = Object.values(USERS).find((u) => u.id === id)
    return user ? HttpResponse.json(user) : HttpResponse.json({ message: 'No autorizado' }, { status: 401 })
  }),
  http.get('*/api/marcas', () => HttpResponse.json([MAZDA, KIA])),
  http.get('*/api/admin/vehiculos', ({ request }) => {
    adminCalls.push(request.url)
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const rows = db.filter((v) => (status ? v.status === status : true))
    return HttpResponse.json({ data: rows, meta: { total: rows.length, page: 1, limit: 10, pages: 1 } })
  }),
  http.get('*/api/vehiculos/:id', ({ params }) => {
    const fresh = freshOverride ? freshOverride() : db.find((v) => v.id === Number(params.id)) ?? null
    return fresh ? HttpResponse.json(fresh) : HttpResponse.json({ message: 'No existe' }, { status: 404 })
  }),
  http.post('*/api/vehiculos', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    posts.push(body)
    const created = car(100 + posts.length, String(body.model))
    db = [created, ...db]
    return HttpResponse.json(created, { status: 201 })
  }),
  http.put('*/api/vehiculos/:id', async ({ request, params }) => {
    puts.push({ id: Number(params.id), body: (await request.json()) as Record<string, unknown> })
    if (putOverride) return putOverride()
    const current = db.find((v) => v.id === Number(params.id))
    if (!current) return HttpResponse.json({ message: 'No existe' }, { status: 404 })
    return HttpResponse.json({ ...current, revision: current.revision + 1 })
  }),
  http.delete('*/api/vehiculos/:id', ({ params }) => {
    deletes.push(Number(params.id))
    if (deleteOverride) return deleteOverride()
    db = db.filter((v) => v.id !== Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  db = [car(1, 'Mazda 3', { revision: 3, price: '95500000.50' }), car(2, 'CX-5', { status: 'usado', price: '120000000.00', mileage: 45000 }), car(3, 'Mazda 2', { status: 'vendido' })]
  putOverride = null
  deleteOverride = null
  freshOverride = null
})
afterEach(() => {
  server.resetHandlers()
  tokens.clear()
  adminCalls.length = 0
  posts.length = 0
  puts.length = 0
  deletes.length = 0
})
afterAll(() => server.close())

function renderInventario(as: keyof typeof USERS = 'admin@automax.co') {
  const user = USERS[as]
  const token = makeToken({ sub: user.id, role: user.role })
  tokens.set(token, user.id)
  setToken(token)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/inventario']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<RequireRole roles={['admin', 'vendedor']}><AdminLayout /></RequireRole>}>
              <Route path="inventario" element={<RequireRole roles={['admin']}><InventarioPage /></RequireRole>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const dialog = () => screen.getByRole('dialog')
const field = (label: RegExp) => within(dialog()).getByLabelText(label)
const rowOf = (name: RegExp) => within(screen.getByRole('list', { name: 'Inventario' })).getAllByRole('listitem').find((row) => name.test(row.textContent ?? '')) as HTMLElement

async function fillValidNewCar(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(field(/^Marca$/), 'Kia')
  await user.type(field(/^Modelo$/), 'Sportage')
  await user.type(field(/^Versión$/), 'GT Line')
  await user.clear(field(/^Año$/))
  await user.type(field(/^Año$/), '2023')
  await user.type(field(/^Precio/), '150000000')
  await user.selectOptions(field(/^Combustible$/), 'Híbrido')
  await user.selectOptions(field(/^Transmisión$/), 'Automática')
  await user.type(field(/^Color$/), 'Gris')
}

/* ---------------- Pruebas ---------------- */
describe('Inventario (solo admin)', () => {
  it('lista el inventario con precio en pesos, kilometraje y estado con texto', async () => {
    renderInventario()
    expect(await screen.findByRole('heading', { name: 'Inventario', level: 1 })).toBeInTheDocument()
    const mazda3 = await screen.findByText('Mazda Mazda 3 2024')
    expect(mazda3).toBeInTheDocument()
    const cx5 = rowOf(/CX-5/)
    expect(within(cx5).getByText(/120\.000\.000/)).toBeInTheDocument()
    expect(within(cx5).getByText(/45\.000 km/)).toBeInTheDocument()
    expect(within(cx5).getByText('Usado')).toBeInTheDocument()
    expect(screen.getByText('3 vehículos')).toBeInTheDocument()
  })

  it('un vehículo vendido no ofrece editar ni borrar', async () => {
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    const sold = rowOf(/Mazda 2/)
    expect(within(sold).getByText('Vendido')).toBeInTheDocument()
    expect(within(sold).queryByRole('button')).not.toBeInTheDocument()
    expect(within(sold).getByText(/sin cambios/)).toBeInTheDocument()
  })

  it('el vendedor ve "sin permiso" y no se pide el inventario completo', async () => {
    renderInventario('vendedor@automax.co')
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para esta sección' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Inventario' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(adminCalls).toEqual([])
  })

  it('agrega un vehículo: el precio se escribe con miles y se envía limpio, sin revisión', async () => {
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Agregar vehículo' }))
    await fillValidNewCar(user)
    expect(field(/^Precio/)).toHaveValue('150.000.000')
    await user.type(field(/^Imágenes/), '/autos/kia-sportage.webp{enter}https://cdn.ejemplo.com/a.jpg')
    await user.click(within(dialog()).getByRole('button', { name: 'Agregar vehículo' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      brandId: 2, model: 'Sportage', year: 2023, version: 'GT Line', price: '150000000', mileage: 0, fuel: 'hibrido',
      transmission: 'automatica', color: 'Gris', status: 'nuevo', images: ['/autos/kia-sportage.webp', 'https://cdn.ejemplo.com/a.jpg'],
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/agregado al inventario/)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://ejemplo.com/a.jpg', '//evil.com/a.jpg', '/autos/../secreto.webp'])(
    'rechaza en el formulario la imagen %s y no envía nada',
    async (image) => {
      const user = userEvent.setup()
      renderInventario()
      await screen.findByText('Mazda Mazda 3 2024')
      await user.click(screen.getByRole('button', { name: 'Agregar vehículo' }))
      await fillValidNewCar(user)
      await user.type(field(/^Imágenes/), image)
      await user.click(within(dialog()).getByRole('button', { name: 'Agregar vehículo' }))
      expect(await within(dialog()).findByText(/La imagen 1 no es válida/)).toBeInTheDocument()
      expect(field(/^Imágenes/)).toHaveAttribute('aria-invalid', 'true')
      expect(posts).toHaveLength(0)
    },
  )

  it('respeta los topes de año y kilometraje del servidor sin enviar nada', async () => {
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Agregar vehículo' }))
    await fillValidNewCar(user)
    await user.clear(field(/^Año$/))
    await user.type(field(/^Año$/), '1980')
    await user.clear(field(/^Kilometraje$/))
    await user.type(field(/^Kilometraje$/), '10000001')
    await user.click(within(dialog()).getByRole('button', { name: 'Agregar vehículo' }))
    expect(await within(dialog()).findByText(/El año debe estar entre 1\.990 y 2\.100/)).toBeInTheDocument()
    expect(within(dialog()).getByText(/kilometraje debe estar entre 0 y 10\.000\.000/i)).toBeInTheDocument()
    expect(posts).toHaveLength(0)
  })

  it('un 409 al agregar explica que ya existe uno igual y conserva lo escrito', async () => {
    server.use(http.post('*/api/vehiculos', () => HttpResponse.json({ message: 'Ya existe un registro con esos datos' }, { status: 409 })))
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Agregar vehículo' }))
    await fillValidNewCar(user)
    await user.click(within(dialog()).getByRole('button', { name: 'Agregar vehículo' }))
    expect(await within(dialog()).findByText(/Ya existe un vehículo con esa marca, modelo, año y versión/)).toBeInTheDocument()
    expect(field(/^Modelo$/)).toHaveValue('Sportage')
  })

  it('edita enviando la revisión leída y conserva los centavos del precio si no se tocó', async () => {
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Editar Mazda Mazda 3 2024' }))
    expect(within(dialog()).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    await user.clear(field(/^Color$/))
    await user.type(field(/^Color$/), 'Azul')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].id).toBe(1)
    expect(puts[0].body).toMatchObject({ color: 'Azul', revision: 3, price: '95500000.50', model: 'Mazda 3' })
    expect(await screen.findByRole('status')).toHaveTextContent(/Cambios de Mazda Mazda 3 2024 guardados/)
  })

  it('409 porque otra persona lo editó: no pisa nada y deja cargar los datos actuales o conservar los míos', async () => {
    putOverride = () => HttpResponse.json({ message: 'Otra persona modificó este vehículo mientras lo editabas.' }, { status: 409 })
    freshOverride = () => car(1, 'Mazda 3', { revision: 4, color: 'Negro', price: '99000000.00' })
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Editar Mazda Mazda 3 2024' }))
    await user.clear(field(/^Color$/))
    await user.type(field(/^Color$/), 'Azul')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(dialog()).findByText(/Otra persona modificó este vehículo mientras lo editabas/)).toBeInTheDocument()

    await user.click(within(dialog()).getByRole('button', { name: 'Cargar los datos actuales' }))
    expect(field(/^Color$/)).toHaveValue('Negro')
    putOverride = null
    await user.clear(field(/^Color$/))
    await user.type(field(/^Color$/), 'Verde')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1].body).toMatchObject({ color: 'Verde', revision: 4 })
  })

  it('409 porque se vendió mientras se editaba: lo dice, no ofrece guardar y no cambia nada', async () => {
    putOverride = () => HttpResponse.json({ message: 'Un vehículo vendido no se puede modificar' }, { status: 409 })
    freshOverride = () => car(1, 'Mazda 3', { revision: 4, status: 'vendido' })
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Editar Mazda Mazda 3 2024' }))
    await user.clear(field(/^Color$/))
    await user.type(field(/^Color$/), 'Azul')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(dialog()).findByText(/se vendió mientras lo editabas/)).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(puts).toHaveLength(1)
  })

  it('un 409 por duplicado (misma revisión) no se confunde con una edición ajena', async () => {
    putOverride = () => HttpResponse.json({ message: 'Ya existe un registro con esos datos' }, { status: 409 })
    freshOverride = () => car(1, 'Mazda 3', { revision: 3, price: '95500000.50' })
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Editar Mazda Mazda 3 2024' }))
    await user.clear(field(/^Versión$/))
    await user.type(field(/^Versión$/), 'Sport')
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }))
    expect(await within(dialog()).findByText(/Ya existe un vehículo con esa marca, modelo, año y versión/)).toBeInTheDocument()
    expect(field(/^Versión$/)).toHaveValue('Sport')
  })

  it('borrar pide confirmación y, al confirmar, borra y avisa', async () => {
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Borrar Mazda CX-5 2024' }))
    expect(within(dialog()).getByText(/Esta acción no se puede deshacer/)).toBeInTheDocument()
    expect(deletes).toEqual([])
    await user.click(within(dialog()).getByRole('button', { name: 'Borrar vehículo' }))
    await waitFor(() => expect(deletes).toEqual([2]))
    expect(await screen.findByRole('status')).toHaveTextContent(/Mazda CX-5 2024 borrado del inventario/)
  })

  it('borrar un vehículo con ventas o citas muestra el mensaje claro del servidor y no lo quita de la lista', async () => {
    deleteOverride = () =>
      HttpResponse.json(
        { message: 'No se puede borrar Mazda 3: tiene una venta registrada y 2 cita(s) (incluidas las canceladas). Los vehículos con historial no se borran.' },
        { status: 409 },
      )
    const user = userEvent.setup()
    renderInventario()
    await screen.findByText('Mazda Mazda 3 2024')
    await user.click(screen.getByRole('button', { name: 'Borrar Mazda Mazda 3 2024' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Borrar vehículo' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent(/tiene una venta registrada y 2 cita\(s\)/)
    expect(alert).toHaveTextContent(/Los vehículos con historial no se borran/)
    expect(within(dialog()).queryByRole('button', { name: 'Borrar vehículo' })).not.toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByText('Mazda Mazda 3 2024')).toBeInTheDocument()
  })

  it('muestra un estado vacío con filtros y un error con reintento', async () => {
    db = []
    const user = userEvent.setup()
    renderInventario()
    expect(await screen.findByText('Todavía no hay vehículos en el inventario')).toBeInTheDocument()
    server.use(http.get('*/api/admin/vehiculos', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })))
    await user.click(screen.getByRole('button', { name: 'Vendidos' }))
    expect(await screen.findByText('No pudimos cargar el inventario')).toBeInTheDocument()
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
