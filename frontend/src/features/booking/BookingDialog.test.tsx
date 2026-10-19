import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Brand, VehicleWithBrand } from '@/api/types'
import { VehicleDetailPage } from '@/features/detail/VehicleDetailPage'

const mazda: Brand = { id: 3, name: 'Mazda', country: 'Japón', logoUrl: null }
const cx30: VehicleWithBrand = {
  id: 21, brandId: 3, brand: mazda, model: 'CX-30', year: 2024, version: 'Grand Touring', price: '140000000.00',
  mileage: 0, fuel: 'gasolina', transmission: 'automatica', color: 'Rojo', status: 'nuevo',
  description: null, images: [],
}

// Miércoles 4 de noviembre de 2026, 10:30 a. m. en Bogotá. Solo se simula Date; los temporizadores son reales.
const NOW = new Date('2026-11-04T10:30:00-05:00')

const bodies: Array<{ vehicleId: number; scheduledAt: string; customer: Record<string, string> }> = []
let vehicleResponse: () => Response
let bookingResponse: () => Response | Promise<Response>

const created = {
  id: 77, vehicleId: 21, scheduledAt: '2026-11-06T15:00:00.000Z', endsAt: '2026-11-06T16:00:00.000Z', status: 'pendiente',
}

const server = setupServer(
  http.get('*/api/vehiculos/:id', () => vehicleResponse()),
  http.post('*/api/citas', async ({ request }) => {
    bodies.push((await request.json()) as (typeof bodies)[number])
    return bookingResponse()
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vehicleResponse = () => HttpResponse.json(cx30)
  bookingResponse = () => HttpResponse.json(created, { status: 201 })
})
afterEach(() => {
  vi.useRealTimers()
  server.resetHandlers()
  bodies.length = 0
})
afterAll(() => server.close())

function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname + location.search + location.hash}</span>
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/catalogo/21']}>
        <Routes>
          <Route path="/catalogo/:id" element={<VehicleDetailPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const day = (pattern: RegExp) => screen.getByRole('radio', { name: pattern })
const hour = (label: string) => screen.getByRole('radio', { name: new RegExp(`^${label.replace('.', '\\.')}`) })

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { level: 1, name: 'Mazda CX-30' })
  await user.click(screen.getByRole('button', { name: 'Agendar test-drive' }))
  return screen.getByRole('dialog', { name: 'Agenda tu test-drive' })
}

async function fillAndPick(user: ReturnType<typeof userEvent.setup>, phone = '') {
  await user.click(day(/viernes, 6 de noviembre/))
  await user.click(hour('10:00 a. m.'))
  await user.type(screen.getByLabelText('Nombre completo'), '  Ana Pérez ')
  await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.co')
  if (phone) await user.type(screen.getByLabelText(/Teléfono/), phone)
}

const submitButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: /Agendar test-drive|Agendando/ })

describe('horarios del formulario', () => {
  it('deshabilita domingos y fechas pasadas', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    expect(day(/domingo, 8 de noviembre.*no atendemos los domingos/)).toBeDisabled()
    expect(day(/domingo, 15 de noviembre/)).toBeDisabled()
    expect(day(/martes, 3 de noviembre.*fecha pasada/)).toBeDisabled()
    expect(day(/lunes, 2 de noviembre.*fecha pasada/)).toBeDisabled()
    expect(day(/miércoles, 4 de noviembre/)).toBeEnabled()
    expect(day(/sábado, 7 de noviembre/)).toBeEnabled()
  })

  it('solo ofrece de 8:00 a. m. a 5:00 p. m. (la visita termina a las 6:00 p. m.)', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await user.click(day(/viernes, 6 de noviembre/))
    const hours = screen.getAllByRole('radio', { name: /empieza a las/ })
    expect(hours).toHaveLength(10)
    expect(hours.every((radio) => !(radio as HTMLInputElement).disabled)).toBe(true)
    expect(screen.queryByRole('radio', { name: /^6:00 p\. m\./ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^7:00 a\. m\./ })).not.toBeInTheDocument()
    expect(hour('5:00 p. m.')).toHaveAccessibleName(/empieza a las 17:00/)
  })

  it('hoy deshabilita las horas que ya pasaron', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await user.click(day(/miércoles, 4 de noviembre/))
    expect(hour('8:00 a. m.')).toBeDisabled()
    expect(hour('10:00 a. m.')).toBeDisabled()
    expect(hour('11:00 a. m.')).toBeEnabled()
  })

  it('las horas están deshabilitadas hasta elegir un día', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    expect(hour('9:00 a. m.')).toBeDisabled()
  })

  it('al pasar a hoy se descarta una hora ya vencida', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await user.click(day(/viernes, 6 de noviembre/))
    await user.click(hour('9:00 a. m.'))
    await user.click(day(/miércoles, 4 de noviembre/))
    expect(hour('9:00 a. m.')).not.toBeChecked()
  })
})

async function renderAndOpen(user: ReturnType<typeof userEvent.setup>) {
  renderDetail()
  return openDialog(user)
}

describe('envío', () => {
  it.each(['America/Bogota', 'Asia/Tokyo', 'America/Los_Angeles'])(
    'envía la hora con -05:00 aunque el navegador esté en %s',
    async (zone) => {
      process.env.TZ = zone
      const user = userEvent.setup()
      await renderAndOpen(user)
      await fillAndPick(user)
      await user.click(submitButton())
      await screen.findByRole('heading', { name: 'Tu test-drive quedó agendado' })
      expect(bodies).toEqual([
        { vehicleId: 21, scheduledAt: '2026-11-06T10:00:00-05:00', customer: { name: 'Ana Pérez', email: 'ana@correo.co' } },
      ])
      delete process.env.TZ
    },
  )

  it('envía el teléfono solo si se escribió', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user, '300 123 4567')
    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Tu test-drive quedó agendado' })
    expect(bodies[0].customer).toEqual({ name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' })
  })

  it('muestra la confirmación con resumen en hora de Bogotá y sin guardar datos personales', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    const confirmation = await screen.findByRole('status')
    expect(within(confirmation).getByText(/Cita n\.º 77/)).toBeInTheDocument()
    expect(within(confirmation).getByText('Mazda CX-30 2024')).toBeInTheDocument()
    expect(within(confirmation).getByText(/viernes.*6 de noviembre de 2026/)).toBeInTheDocument()
    expect(within(confirmation).getByText(/10:00\s?a\.\s?m\. a 11:00\s?a\.\s?m\., hora de Bogotá/)).toBeInTheDocument()
    expect(within(confirmation).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(confirmation).getByText('ana@correo.co')).toBeInTheDocument()
    expect(within(confirmation).getByText('Pendiente de confirmación')).toBeInTheDocument()

    // Los datos personales no están en la URL ni en ningún storage.
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/catalogo\/21$/)
    const stored = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage })
    expect(stored).not.toMatch(/ana|correo|P[ée]rez/i)
    expect(sessionStorage.length + localStorage.length).toBe(0)
  })

  it('no envía nada si faltan datos y marca cada campo con su error', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await user.click(submitButton())
    expect(await screen.findByText('Elige un día.')).toBeInTheDocument()
    expect(screen.getByText('Elige una hora.')).toBeInTheDocument()
    expect(screen.getByText(/Escribe tu nombre/)).toBeInTheDocument()
    expect(screen.getByText(/Escribe un correo válido/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre completo')).toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toHaveLength(0)
  })

  it('rechaza correo y teléfono mal escritos', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.clear(screen.getByLabelText('Correo electrónico'))
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo')
    await user.type(screen.getByLabelText(/Teléfono/), 'abc')
    await user.click(submitButton())
    expect(await screen.findByText(/Escribe un correo válido/)).toBeInTheDocument()
    expect(screen.getByText(/Usa solo números/)).toBeInTheDocument()
    expect(bodies).toHaveLength(0)
  })

  it('bloquea el botón mientras envía y no duplica la petición', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    bookingResponse = async () => {
      await gate
      return HttpResponse.json(created, { status: 201 })
    }
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    const sending = await screen.findByRole('button', { name: 'Agendando…' })
    expect(sending).toBeDisabled()
    await user.click(sending)
    await user.keyboard('{Enter}')
    release()
    await screen.findByRole('heading', { name: 'Tu test-drive quedó agendado' })
    expect(bodies).toHaveLength(1)
  })
})

describe('errores del servidor', () => {
  it('409 por horario ocupado: mensaje claro y el formulario se conserva', async () => {
    bookingResponse = () => HttpResponse.json({ message: 'Ese vehículo ya tiene una cita en ese horario' }, { status: 409 })
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user, '300 123 4567')
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese horario ya no está disponible para este vehículo')
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('  Ana Pérez ')
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@correo.co')
    expect(screen.getByLabelText(/Teléfono/)).toHaveValue('300 123 4567')
    expect(day(/viernes, 6 de noviembre/)).toBeChecked()
    expect(hour('10:00 a. m.')).toBeChecked()
    expect(submitButton()).toBeEnabled()

    // Elige otra hora y reintenta con éxito.
    bookingResponse = () => HttpResponse.json(created, { status: 201 })
    await user.click(hour('11:00 a. m.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Tu test-drive quedó agendado' })
    expect(bodies.map((b) => b.scheduledAt)).toEqual(['2026-11-06T10:00:00-05:00', '2026-11-06T11:00:00-05:00'])
  })

  it('409 porque el cliente ya tiene otra cita: lo explica con su propio mensaje', async () => {
    bookingResponse = () => HttpResponse.json({ message: 'Ya tienes otra cita que se cruza con ese horario' }, { status: 409 })
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Con ese correo ya tienes una cita que se cruza')
  })

  it('si el vehículo se vendió mientras agendaba, lo dice y la página pasa a "vendido"', async () => {
    bookingResponse = () => {
      vehicleResponse = () => HttpResponse.json({ ...cx30, status: 'vendido' })
      return HttpResponse.json({ message: 'Ese vehículo ya fue vendido' }, { status: 409 })
    }
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    expect(await screen.findByRole('heading', { name: 'Este vehículo ya fue vendido' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Agenda tu test-drive' })).not.toBeInTheDocument()
  })

  it('429: mensaje amable y el formulario se conserva', async () => {
    bookingResponse = () => HttpResponse.json({ message: 'ThrottlerException' }, { status: 429 })
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Hiciste varios intentos seguidos. Espera un minuto')
    expect(alert).not.toHaveTextContent('Throttler')
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@correo.co')
    expect(submitButton()).toBeEnabled()
  })

  it('400 de regla de horario: muestra el texto del servidor; 400 de campos: mensaje genérico', async () => {
    bookingResponse = () => HttpResponse.json({ message: 'La cita debe ser en una fecha futura' }, { status: 400 })
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('La cita debe ser en una fecha futura')

    bookingResponse = () => HttpResponse.json({ message: ['customer.email no es un correo válido'] }, { status: 400 })
    await user.click(submitButton())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos del formulario'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('customer.email')
  })

  it('sin conexión: avisa que quizá la cita sí quedó registrada', async () => {
    bookingResponse = () => HttpResponse.error()
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Si vuelves a intentarlo')
    expect(submitButton()).toBeEnabled()
  })
})

describe('diálogo', () => {
  it('cerrar y volver a abrir conserva lo escrito (solo en memoria)', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agenda tu test-drive' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Agendar test-drive' }))
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana')
  })

  it('tras confirmar y cerrar, el formulario queda limpio', async () => {
    const user = userEvent.setup()
    await renderAndOpen(user)
    await fillAndPick(user)
    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Tu test-drive quedó agendado' })
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await user.click(screen.getByRole('button', { name: 'Agendar test-drive' }))
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('')
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('')
  })
})
