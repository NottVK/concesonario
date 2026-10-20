import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { CompareProvider } from '@/features/compare/CompareContext'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { Brand, VehicleWithBrand } from '@/api/types'
import { CatalogPage } from './CatalogPage'

const toyota: Brand = { id: 1, name: 'Toyota', country: 'Japón', logoUrl: null }
const corolla: VehicleWithBrand = {
  id: 7, brandId: 1, brand: toyota, model: 'Corolla', year: 2024, version: 'XEI', price: '95000000.00',
  mileage: 0, fuel: 'gasolina', transmission: 'automatica', color: 'Blanco', status: 'nuevo',
  revision: 1, description: null, images: ['/autos/toyota-corolla.webp'],
}

const requests: URL[] = []
let vehiclesResponse: () => Response = () =>
  HttpResponse.json({ data: [corolla], meta: { total: 1, page: 1, limit: 12, pages: 1 } })

const server = setupServer(
  http.get('*/api/marcas', () => HttpResponse.json([toyota])),
  http.get('*/api/vehiculos', ({ request }) => {
    requests.push(new URL(request.url))
    return vehiclesResponse()
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  server.resetHandlers()
  requests.length = 0
})
afterAll(() => server.close())

function Location() {
  const location = useLocation()
  return <output data-testid="url">{location.search}</output>
}

function renderCatalog(initial = '/catalogo') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <CompareProvider>
        <CatalogPage />
        <Location />
      </CompareProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CatalogPage', () => {
  it('muestra los vehículos con precio, ficha y total', async () => {
    renderCatalog()
    expect(await screen.findByRole('heading', { name: 'Toyota Corolla' })).toBeInTheDocument()
    expect(screen.getByText(/95\.000\.000/)).toBeInTheDocument()
    expect(screen.getByText('1 vehículo disponible')).toBeInTheDocument()
    expect(screen.getByAltText(/Toyota Corolla 2024/)).toHaveAttribute('loading', 'lazy')
  })

  it('al elegir una marca consulta la API con brandId y lo guarda en la URL', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Toyota Corolla' })
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Marca' }), '1')
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('brandId')).toBe('1'))
    expect(screen.getByTestId('url')).toHaveTextContent('brandId=1')
  })

  it('el rango de precio se aplica al salir del campo y se ordena si viene invertido', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Toyota Corolla' })
    await user.type(screen.getByLabelText('Precio mínimo'), '90000000')
    await user.type(screen.getByLabelText('Precio máximo'), '50000000')
    await user.tab()
    await waitFor(() => {
      const last = requests.at(-1)?.searchParams
      expect(last?.get('priceMin')).toBe('50000000')
      expect(last?.get('priceMax')).toBe('90000000')
    })
  })

  it('el precio se muestra con separador de miles y se envía como número limpio', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Toyota Corolla' })
    await user.type(screen.getByLabelText('Precio mínimo'), '900000000')
    expect(screen.getByLabelText('Precio mínimo')).toHaveValue('900.000.000')
    await user.tab()
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('priceMin')).toBe('900000000'))
    expect(screen.getByTestId('url')).toHaveTextContent('priceMin=900000000')
  })

  it('el año no lleva separador de miles', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await screen.findByRole('heading', { name: 'Toyota Corolla' })
    await user.type(screen.getByLabelText('Año desde'), '2024')
    expect(screen.getByLabelText('Año desde')).toHaveValue('2024')
  })

  it('muestra un estado vacío con salida cuando no hay resultados', async () => {
    vehiclesResponse = () => HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 12, pages: 0 } })
    renderCatalog('/catalogo?fuel=electrico')
    expect(await screen.findByText('Ningún vehículo coincide con estos filtros')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver todo el catálogo' })).toBeInTheDocument()
  })

  it('muestra el error del servidor y permite reintentar', async () => {
    vehiclesResponse = () => HttpResponse.json({ message: 'Error interno' }, { status: 500 })
    renderCatalog()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el catálogo')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('ignora filtros manipulados en la URL', async () => {
    vehiclesResponse = () =>
      HttpResponse.json({ data: [corolla], meta: { total: 1, page: 1, limit: 12, pages: 1 } })
    renderCatalog("/catalogo?brandId=1 OR 1=1&sort=hack")
    await screen.findByRole('heading', { name: 'Toyota Corolla' })
    expect(requests[0].searchParams.has('brandId')).toBe(false)
    expect(requests[0].searchParams.get('sort')).toBe('newest')
  })
})
