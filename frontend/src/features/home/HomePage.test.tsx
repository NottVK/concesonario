import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { CompareProvider } from '@/features/compare/CompareContext'
import { MemoryRouter } from 'react-router-dom'
import type { Brand, VehicleWithBrand } from '@/api/types'
import { PLACEHOLDER_SRC } from '@/components/CarImage'
import { HomePage } from './HomePage'

const brandNames = ['BMW', 'Chevrolet', 'Ford', 'Hyundai', 'Kia', 'Mazda', 'Nissan', 'Renault', 'Toyota', 'Volkswagen']
const brands: Brand[] = brandNames.map((name, index) => ({
  id: index + 1, name, country: 'X', logoUrl: `/autos/marcas/${name.toLowerCase()}.svg`,
}))

const car = (id: number, model: string): VehicleWithBrand => ({
  id, brandId: 1, brand: brands[0], model, year: 2024, version: 'Base', price: `${100 + id}000000.00`, mileage: 0,
  fuel: 'gasolina', transmission: 'automatica', color: 'Negro', status: 'nuevo', revision: 1, description: null,
  images: [`/autos/bmw-${model.toLowerCase()}.webp`],
})
const seven = [car(70, 'iX3'), car(69, 'X5'), car(68, 'X3'), car(67, 'X1'), car(66, 'Serie 3'), car(65, 'Serie 1'), car(64, 'Amarok')]

const requests: URL[] = []
let vehiclesResponse: () => Response
let brandsResponse: () => Response

const server = setupServer(
  http.get('*/api/vehiculos', ({ request }) => {
    requests.push(new URL(request.url))
    return vehiclesResponse()
  }),
  http.get('*/api/marcas', () => brandsResponse()),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  vehiclesResponse = () => HttpResponse.json({ data: seven, meta: { total: 60, page: 1, limit: 7, pages: 9 } })
  brandsResponse = () => HttpResponse.json(brands)
})
afterEach(() => {
  server.resetHandlers()
  requests.length = 0
})
afterAll(() => server.close())

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CompareProvider>
        <HomePage />
      </CompareProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const heroTitle = (name: string) => screen.findByRole('heading', { level: 1, name })
const FALLBACK = 'Tu próximo carro está en AutoMax'

describe('HomePage', () => {
  it('muestra de hero el más reciente y pide los datos una sola vez con sort=newest', async () => {
    renderHome()
    expect(await heroTitle('BMW iX3')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('sort')).toBe('newest')
    expect(requests[0].searchParams.get('limit')).toBe('7')
    expect(screen.getByRole('link', { name: 'Ver este auto' })).toHaveAttribute('href', '/catalogo/70')
    expect(screen.getByText('Recién llegado, nuevo')).toBeInTheDocument()
  })

  it('la imagen del hero se carga ya y con prioridad, no diferida', async () => {
    renderHome()
    const image = await screen.findByAltText(/BMW iX3 2024/)
    expect(image).toHaveAttribute('loading', 'eager')
    expect(image).toHaveAttribute('fetchpriority', 'high')
  })

  it('si la foto del hero falta, cae al placeholder dentro del mismo recuadro', async () => {
    renderHome()
    const image = await screen.findByAltText(/BMW iX3 2024/)
    fireEvent.error(image)
    expect(screen.getByAltText(/BMW iX3 2024/)).toHaveAttribute('src', PLACEHOLDER_SRC)
    expect(image.parentElement).toHaveClass('aspect-[16/10]')
  })

  it('los destacados son los 6 siguientes y no repiten el hero; reutilizan las tarjetas del catálogo', async () => {
    renderHome()
    await heroTitle('BMW iX3')
    const featured = screen.getByRole('region', { name: 'Destacados' })
    const titles = within(featured).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['BMW X5', 'BMW X3', 'BMW X1', 'BMW Serie 3', 'BMW Serie 1', 'BMW Amarok'])
    expect(within(featured).getByRole('link', { name: /BMW X5/ })).toHaveAttribute('href', '/catalogo/69')
    expect(within(featured).getByRole('link', { name: 'Ver todo el catálogo' })).toHaveAttribute('href', '/catalogo')
  })

  it('el carrusel lista las 10 marcas y cada una lleva al catálogo filtrado por su id', async () => {
    renderHome()
    const list = await screen.findByRole('list', { name: 'Marcas disponibles' })
    expect(within(list).getAllByRole('link')).toHaveLength(10)
    expect(within(list).getByRole('link', { name: 'Ver autos Toyota' })).toHaveAttribute('href', '/catalogo?brandId=9')
    expect(within(list).getByRole('link', { name: 'Ver autos BMW' })).toHaveAttribute('href', '/catalogo?brandId=1')
  })

  it('un logo de marca que falta muestra la inicial en lugar de una imagen rota', async () => {
    renderHome()
    const list = await screen.findByRole('list', { name: 'Marcas disponibles' })
    fireEvent.error(within(list).getAllByRole('img', { name: 'Logo de BMW' })[0])
    expect(within(list).getByRole('img', { name: 'Logo de BMW' })).toHaveTextContent('B')
  })

  it('mientras carga muestra esqueletos y todavía no hay título', () => {
    renderHome()
    expect(screen.getByLabelText('Cargando el auto destacado')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('si la API de vehículos falla, el hero de respaldo explica y permite reintentar; las marcas siguen', async () => {
    vehiclesResponse = () => HttpResponse.json({ message: 'fallo' }, { status: 500 })
    renderHome()
    expect(await heroTitle(FALLBACK)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Reintentar')
    expect(await screen.findByRole('list', { name: 'Marcas disponibles' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Destacados' })).not.toBeInTheDocument()
  })

  it('sin vehículos muestra el hero de respaldo con salida al catálogo', async () => {
    vehiclesResponse = () => HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 7, pages: 0 } })
    renderHome()
    expect(await heroTitle(FALLBACK)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar el catálogo' })).toHaveAttribute('href', '/catalogo')
    expect(screen.queryByRole('region', { name: 'Destacados' })).not.toBeInTheDocument()
  })

  it('con un solo vehículo no hay destacados repetidos', async () => {
    vehiclesResponse = () => HttpResponse.json({ data: [seven[0]], meta: { total: 1, page: 1, limit: 7, pages: 1 } })
    renderHome()
    await heroTitle('BMW iX3')
    expect(screen.queryByRole('region', { name: 'Destacados' })).not.toBeInTheDocument()
  })

  it('si fallan las marcas lo dice y permite reintentar, sin tumbar el hero', async () => {
    brandsResponse = () => HttpResponse.json({ message: 'fallo' }, { status: 500 })
    renderHome()
    expect(await heroTitle('BMW iX3')).toBeInTheDocument()
    expect(await screen.findByText(/No pudimos cargar las marcas/)).toBeInTheDocument()
  })
})

/**
 * La portada desbordaba 36 px en horizontal a 375 px (decisión 89). jsdom no calcula el layout, así que aquí se fijan las
 * CLASES que lo evitan; la medición real en un navegador está en `e2e/portada.spec.ts`.
 */
describe('portada en móvil: sin desborde horizontal', () => {
  it('el hero es una rejilla de una columna que puede encogerse, con hijos que pueden encogerse', async () => {
    renderHome()
    const title = await heroTitle('BMW iX3')
    const grid = title.closest('div.grid')!
    expect(grid).toHaveClass('grid-cols-[minmax(0,1fr)]')
    expect(grid.firstElementChild).toHaveClass('min-w-0')
    expect(grid.lastElementChild).toHaveClass('min-w-0')
  })

  it('el título y el precio se parten si una palabra no cabe, y el título es de 36 px en móvil', async () => {
    renderHome()
    const title = await heroTitle('BMW iX3')
    expect(title).toHaveClass('text-4xl', 'sm:text-6xl', '[overflow-wrap:anywhere]')
    expect(title.className).not.toMatch(/(^|\s)text-5xl(\s|$)/)
    expect(screen.getByText(/\$\s?170\.000\.000/)).toHaveClass('[overflow-wrap:anywhere]')
  })

  it('la portada de respaldo y la rejilla de destacados tampoco ensanchan la página', async () => {
    vehiclesResponse = () => HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 7, pages: 0 } })
    renderHome()
    const fallback = await heroTitle(FALLBACK)
    expect(fallback).toHaveClass('text-4xl', '[overflow-wrap:anywhere]')
    expect(fallback.closest('div.grid')).toHaveClass('grid-cols-[minmax(0,1fr)]')
  })

  it('los destacados van en una columna encogible en móvil', async () => {
    renderHome()
    await heroTitle('BMW iX3')
    // El primer <ul> de la sección es la rejilla de destacados (las tarjetas traen sus propias listas de datos).
    const list = screen.getByRole('region', { name: 'Destacados' }).querySelector('ul')!
    expect(list).toHaveClass('grid-cols-1')
  })
})

