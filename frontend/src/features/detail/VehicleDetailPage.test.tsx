import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { CompareProvider } from '@/features/compare/CompareContext'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Brand, VehicleWithBrand } from '@/api/types'
import { PLACEHOLDER_SRC } from '@/components/CarImage'
import { VehicleDetailPage } from './VehicleDetailPage'

const kia: Brand = { id: 5, name: 'Kia', country: 'Corea', logoUrl: null }
const sportage: VehicleWithBrand = {
  id: 9, brandId: 5, brand: kia, model: 'Sportage', year: 2023, version: 'GT Line', price: '150000000.00',
  mileage: 8000, fuel: 'hibrido', transmission: 'automatica', color: 'Gris', status: 'usado',
  revision: 1, description: 'Un solo dueño.', images: ['/autos/kia-sportage.webp', '/autos/kia-sportage-2.webp'],
}

const simulations: unknown[] = []
let vehicleResponse: () => Response
let simulateResponse: () => Response

const simulation = {
  amount: '150000000.00', downPayment: '45000000.00', financed: '105000000.00', months: 60, annualRate: 0.18,
  monthlyRate: 0.0138, monthlyPayment: '2590000.00', totalPayment: '155400000.00', totalInterest: '50400000.00',
}

const server = setupServer(
  http.get('*/api/vehiculos/:id', () => vehicleResponse()),
  http.post('*/api/financiacion/simular', async ({ request }) => {
    simulations.push(await request.json())
    return simulateResponse()
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  vehicleResponse = () => HttpResponse.json(sportage)
  simulateResponse = () => HttpResponse.json(simulation)
})
afterEach(() => {
  server.resetHandlers()
  simulations.length = 0
})
afterAll(() => server.close())

function renderDetail(path = '/catalogo/9') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CompareProvider>
        <Routes>
          <Route path="/catalogo/:id" element={<VehicleDetailPage />} />
        </Routes>
      </CompareProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VehicleDetailPage', () => {
  it('muestra título, precio, ficha técnica y descripción', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { level: 1, name: 'Kia Sportage' })).toBeInTheDocument()
    expect(screen.getAllByText(/150\.000\.000/).length).toBeGreaterThan(0)
    expect(screen.getByText('Híbrido')).toBeInTheDocument()
    expect(screen.getByText('Un solo dueño.')).toBeInTheDocument()
    expect(document.title).toContain('Kia Sportage')
  })

  it('el orden de lectura (y del teclado) es título, simulador, descripción y ficha', async () => {
    renderDetail()
    await screen.findByRole('heading', { level: 1, name: 'Kia Sportage' })
    const order = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(order).toEqual(['Kia Sportage', 'Simula tu crédito', 'Descripción', 'Ficha técnica'])
  })

  it('muestra una página clara si el vehículo no existe (404)', async () => {
    vehicleResponse = () => HttpResponse.json({ message: 'No existe' }, { status: 404 })
    renderDetail('/catalogo/999')
    expect(await screen.findByRole('heading', { name: 'No encontramos este vehículo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute('href', '/catalogo')
  })

  it.each(['2147483648', '99999999999999999999', '1e3', '1.5', '-1', '0'])('el id imposible %s en la URL no consulta la API', async (rawId) => {
    renderDetail(`/catalogo/${rawId}`)
    expect(await screen.findByRole('heading', { name: 'No encontramos este vehículo' })).toBeInTheDocument()
  })

  it('un id inválido en la URL no consulta la API', async () => {
    renderDetail('/catalogo/abc')
    expect(await screen.findByRole('heading', { name: 'No encontramos este vehículo' })).toBeInTheDocument()
  })

  it('si el vehículo ya fue vendido lo dice y ofrece alternativas, sin simulador', async () => {
    vehicleResponse = () => HttpResponse.json({ ...sportage, status: 'vendido' })
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Este vehículo ya fue vendido' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver más Kia' })).toHaveAttribute('href', '/catalogo?brandId=5')
    expect(screen.queryByText('Simula tu crédito')).not.toBeInTheDocument()
  })

  it('un error del servidor ofrece reintentar', async () => {
    vehicleResponse = () => HttpResponse.json({ message: 'fallo' }, { status: 500 })
    renderDetail()
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('la galería cae al placeholder en la imagen que falle y permite cambiar de foto', async () => {
    const user = userEvent.setup()
    renderDetail()
    const main = await screen.findByAltText('Kia Sportage 2023, foto 1 de 2')
    fireEvent.error(main)
    expect(screen.getByAltText('Kia Sportage 2023, foto 1 de 2')).toHaveAttribute('src', PLACEHOLDER_SRC)
    await user.click(screen.getByRole('button', { name: 'Ver foto 2 de 2' }))
    expect(screen.getByAltText('Kia Sportage 2023, foto 2 de 2')).toHaveAttribute('src', '/autos/kia-sportage-2.webp')
  })
})

describe('LoanSimulator', () => {
  const calculate = () => screen.getByRole('button', { name: 'Calcular cuota' })
  const downField = () => screen.getByLabelText('Cuota inicial (COP)')

  it('no consulta al escribir: solo al pulsar "Calcular cuota"', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    await user.clear(downField())
    await user.type(downField(), '50000000')
    expect(downField()).toHaveValue('50.000.000')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(simulations).toHaveLength(0)

    await user.click(calculate())
    expect(await screen.findByText(/2\.590\.000/)).toBeInTheDocument()
    expect(simulations).toEqual([{ amount: '150000000.00', downPayment: '50000000', months: 60 }])
  })

  it('arranca con 30 % de cuota inicial y envía el plazo elegido', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    expect(downField()).toHaveValue('45.000.000')
    await user.selectOptions(screen.getByLabelText('Plazo'), '36')
    await user.click(calculate())
    await screen.findByText(/Tu cuota mensual sería/)
    expect(simulations[0]).toMatchObject({ downPayment: '45000000', months: 36 })
  })

  it('rechaza en el cliente una cuota inicial igual o mayor al valor, sin llamar a la API', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    await user.clear(downField())
    await user.type(downField(), '150000000')
    await user.click(calculate())
    expect(await screen.findByRole('alert')).toHaveTextContent('La cuota inicial debe ser menor')
    expect(simulations).toHaveLength(0)
  })

  it('muestra un mensaje amable ante el 429', async () => {
    simulateResponse = () => HttpResponse.json({ message: 'ThrottlerException' }, { status: 429 })
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    await user.click(calculate())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Espera un minuto y vuelve a calcular')
    expect(alert).not.toHaveTextContent('Throttler')
  })

  it('ignora clics repetidos mientras calcula', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/financiacion/simular', async ({ request }) => {
        simulations.push(await request.json())
        await gate
        return HttpResponse.json(simulation)
      }),
    )
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    await user.click(calculate())
    expect(await screen.findByRole('button', { name: 'Calculando…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Calculando…' }))
    release()
    await screen.findByText(/Tu cuota mensual sería/)
    expect(simulations).toHaveLength(1)
  })

  it('al cambiar un dato, el resultado anterior desaparece', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Simula tu crédito')
    await user.click(calculate())
    await screen.findByText(/Tu cuota mensual sería/)
    await user.selectOptions(screen.getByLabelText('Plazo'), '24')
    await waitFor(() => expect(screen.queryByText(/Tu cuota mensual sería/)).not.toBeInTheDocument())
  })
})
