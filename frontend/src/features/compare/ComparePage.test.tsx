import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Brand, VehicleWithBrand } from '@/api/types'
import { CompareProvider } from './CompareContext'
import { ComparePage } from './ComparePage'

const brand = (id: number, name: string): Brand => ({ id, name, country: 'X', logoUrl: null })
const car = (id: number, brandName: string, model: string, extra: Partial<VehicleWithBrand> = {}): VehicleWithBrand => ({
  id, brandId: id, brand: brand(id, brandName), model, year: 2022, version: `Ver ${id}`, price: '100000000.00', mileage: 20000,
  fuel: 'gasolina', transmission: 'manual', color: 'Gris', status: 'usado', description: null, images: [], ...extra,
})

const DB: Record<number, VehicleWithBrand> = {
  1: car(1, 'Mazda', '3', { price: '100000000.00', year: 2022, mileage: 20000 }),
  2: car(2, 'Kia', 'Rio', { price: '90000000.00', year: 2024, mileage: 0, status: 'nuevo', fuel: 'hibrido', transmission: 'automatica' }),
  3: car(3, 'Toyota', 'Yaris', { price: '95000000.00', year: 2023, mileage: 5000 }),
  4: car(4, 'Ford', 'Fiesta', { price: '50000000.00', year: 2025, mileage: 0, status: 'vendido' }),
  6: car(6, 'Renault', 'Logan', { price: '120000000.00', year: 2022, mileage: 30000 }),
}

const requested: number[] = []
let failing = new Set<number>()
const server = setupServer(
  http.get('*/api/vehiculos/:id', ({ params }) => {
    const id = Number(params.id)
    requested.push(id)
    if (failing.has(id)) return HttpResponse.json({ message: 'fallo' }, { status: 500 })
    const found = DB[id]
    return found ? HttpResponse.json(found) : HttpResponse.json({ message: `No existe el vehículo ${id}` }, { status: 404 })
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  failing = new Set()
})
afterEach(() => {
  server.resetHandlers()
  requested.length = 0
})
afterAll(() => server.close())

function Where() {
  const location = useLocation()
  return <span data-testid="where">{location.pathname + location.search}</span>
}

function renderCompare(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CompareProvider>
          <Routes>
            <Route path="/comparar" element={<ComparePage />} />
            <Route path="/catalogo" element={<h1>Catálogo</h1>} />
          </Routes>
          <Where />
        </CompareProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent
const table = () => screen.getByRole('table')
const rowOf = (label: string) => within(table()).getByRole('row', { name: new RegExp(`^${label}`) })
const loaded = (title: string) => screen.findByRole('link', { name: title, hidden: false })

describe('ComparePage: tabla', () => {
  it('muestra los vehículos lado a lado, fila por fila', async () => {
    renderCompare('/comparar?ids=1,2')
    await loaded('Mazda 3')
    await loaded('Kia Rio')
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(3) // característica + 2 vehículos
    expect(within(rowOf('Combustible')).getByText('Híbrido')).toBeInTheDocument()
    expect(within(rowOf('Transmisión')).getByText('Automática')).toBeInTheDocument()
    expect(within(rowOf('Kilometraje')).getByText('0 km')).toBeInTheDocument()
    expect(within(rowOf('Precio')).getByText(/90\.000\.000/)).toBeInTheDocument()
    expect(requested.sort()).toEqual([1, 2])
  })

  it('tiene su propia región con desplazamiento horizontal y primera columna fija', async () => {
    renderCompare('/comparar?ids=1,2,3')
    await loaded('Mazda 3')
    const region = screen.getByRole('region', { name: /desplázate horizontalmente/ })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveClass('overflow-x-auto', 'max-w-full', 'relative') // relative: contiene los textos sr-only
    expect(table()).toHaveClass('min-w-max')
    const rowHeaders = within(table()).getAllByRole('rowheader')
    expect(rowHeaders.length).toBeGreaterThan(5)
    for (const header of rowHeaders) expect(header).toHaveClass('sticky', 'left-0')
    expect(within(table()).getAllByRole('columnheader')[0]).toHaveClass('sticky', 'left-0')
  })

  it('mientras carga muestra esqueletos por columna', () => {
    renderCompare('/comparar?ids=1,2')
    expect(within(table()).getAllByText((_, el) => el?.getAttribute('aria-busy') === 'true')).toHaveLength(2)
  })
})

describe('ComparePage: mejor valor sin depender solo del color', () => {
  it('rotula con texto «Mejor» (más icono) el menor precio, el año más reciente y el menor kilometraje', async () => {
    renderCompare('/comparar?ids=1,2,3')
    await loaded('Kia Rio')
    for (const row of ['Precio', 'Año', 'Kilometraje']) {
      const best = within(rowOf(row)).getAllByText('Mejor')
      expect(best).toHaveLength(1)
      expect(best[0].closest('td')).toHaveTextContent(row === 'Precio' ? /90\.000\.000/ : row === 'Año' ? '2024' : '0 km')
      expect(within(best[0].closest('td') as HTMLElement).getByText(/valor de esta fila/)).toBeInTheDocument()
    }
    // Las filas que no se comparan por valor no llevan marca.
    expect(within(rowOf('Color')).queryByText('Mejor')).not.toBeInTheDocument()
    // Cada fila comparable dice con palabras qué es mejor.
    expect(within(rowOf('Precio')).getByText('Menor es mejor')).toBeInTheDocument()
    expect(within(rowOf('Año')).getByText('Más reciente es mejor')).toBeInTheDocument()
  })

  it('si todos empatan en una fila no se marca a nadie', async () => {
    renderCompare('/comparar?ids=1,6') // mismo año (2022)
    await loaded('Renault Logan')
    expect(within(rowOf('Año')).queryByText('Mejor')).not.toBeInTheDocument()
    expect(within(rowOf('Precio')).getAllByText('Mejor')).toHaveLength(1)
  })

  it('con un solo vehículo no hay nada que destacar y se pide agregar otro', async () => {
    renderCompare('/comparar?ids=1')
    await loaded('Mazda 3')
    expect(screen.queryByText('Mejor')).not.toBeInTheDocument()
    expect(screen.getByText(/Agrega al menos otro vehículo/)).toBeInTheDocument()
  })
})

describe('ComparePage: la URL respeta el máximo de 3', () => {
  it('con más de 3 ids pide solo los 3 primeros, limpia la URL y avisa', async () => {
    renderCompare('/comparar?ids=1,2,3,6,4')
    await loaded('Mazda 3')
    expect(await screen.findByText(/Solo se pueden comparar 3 vehículos/)).toBeInTheDocument()
    expect(where()).toBe('/comparar?ids=1%2C2%2C3')
    expect(requested.sort()).toEqual([1, 2, 3])
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(4)
    expect(screen.queryByRole('link', { name: 'Agregar otro vehículo' })).not.toBeInTheDocument()
  })

  it('quita repetidos y basura, y deja la URL limpia', async () => {
    renderCompare('/comparar?ids=2,2,abc,0,-1,3')
    await loaded('Kia Rio')
    expect(await screen.findByText(/Ignoramos algunos datos/)).toBeInTheDocument()
    expect(where()).toBe('/comparar?ids=2%2C3')
    expect(requested.sort()).toEqual([2, 3])
  })

  it('unifica varios parámetros ids', async () => {
    renderCompare('/comparar?ids=1&ids=2')
    await loaded('Mazda 3')
    expect(where()).toBe('/comparar?ids=1%2C2')
  })

  it('con ids imposibles muestra el estado vacío sin consultar la API', async () => {
    renderCompare('/comparar?ids=abc,%27%3B%20DROP%20TABLE')
    expect(await screen.findByText('Todavía no elegiste vehículos para comparar')).toBeInTheDocument()
    expect(requested).toHaveLength(0)
    expect(where()).toBe('/comparar')
  })
})

describe('ComparePage: inexistentes, vendidos y errores sin romper la pantalla', () => {
  it('un vehículo inexistente ocupa su columna con un aviso y los demás se comparan igual', async () => {
    renderCompare('/comparar?ids=1,99,2')
    await loaded('Kia Rio')
    expect(await screen.findByText('Este vehículo ya no existe')).toBeInTheDocument()
    expect(screen.getByText(/vehículo n\.º 99/)).toBeInTheDocument()
    expect(within(rowOf('Precio')).getAllByText('Mejor')).toHaveLength(1) // sigue comparando 1 y 2
    expect(within(rowOf('Precio')).getByText('Sin datos')).toBeInTheDocument()
  })

  it('si todos los ids no existen la pantalla sigue en pie', async () => {
    renderCompare('/comparar?ids=98,99')
    expect(await screen.findAllByText('Este vehículo ya no existe')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Comparador' })).toBeInTheDocument()
    expect(screen.queryByText('Mejor')).not.toBeInTheDocument()
  })

  it('se puede quitar la columna inexistente y la URL se actualiza', async () => {
    const user = userEvent.setup()
    renderCompare('/comparar?ids=1,99,2')
    await user.click(await screen.findByRole('button', { name: 'Quitar el vehículo n.º 99 de la comparación' }))
    expect(where()).toBe('/comparar?ids=1%2C2')
    await waitFor(() => expect(screen.queryByText('Este vehículo ya no existe')).not.toBeInTheDocument())
  })

  it('un vehículo vendido se muestra marcado, no cuenta para el mejor valor y no ofrece ver detalle', async () => {
    renderCompare('/comparar?ids=1,2,4')
    await loaded('Ford Fiesta')
    expect(screen.getByText(/Ya no está disponible y no cuenta para el mejor valor/)).toBeInTheDocument()
    expect(within(rowOf('Estado')).getByText('Vendido')).toBeInTheDocument()
    // El vendido es el más barato y el más nuevo, pero el mejor se decide entre los disponibles.
    const bestPrice = within(rowOf('Precio')).getAllByText('Mejor')
    expect(bestPrice).toHaveLength(1)
    expect(bestPrice[0].closest('td')).toHaveTextContent(/90\.000\.000/)
    expect(within(rowOf('Ver más')).getAllByRole('link', { name: 'Ver detalle' })).toHaveLength(2)
  })

  it('con un vendido y un solo disponible no se destaca nada', async () => {
    renderCompare('/comparar?ids=1,4')
    await loaded('Ford Fiesta')
    expect(screen.queryByText('Mejor')).not.toBeInTheDocument()
  })

  it('un error del servidor afecta solo a su columna y se puede reintentar', async () => {
    failing = new Set([3])
    const user = userEvent.setup()
    renderCompare('/comparar?ids=1,2,3')
    await loaded('Kia Rio')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el vehículo n.º 3')
    expect(within(rowOf('Precio')).getAllByText('Mejor')).toHaveLength(1)

    failing = new Set()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await loaded('Toyota Yaris')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('ComparePage: selección', () => {
  it('quitar un vehículo actualiza la URL y deja de pedirlo', async () => {
    const user = userEvent.setup()
    renderCompare('/comparar?ids=1,2,3')
    await loaded('Mazda 3')
    await user.click(screen.getByRole('button', { name: 'Quitar Kia Rio de la comparación' }))
    expect(where()).toBe('/comparar?ids=1%2C3')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Kia Rio' })).not.toBeInTheDocument())
    expect(JSON.parse(sessionStorage.getItem('automax.compare') ?? '[]')).toEqual([1, 3])
  })

  it('quitar el último lleva al estado vacío', async () => {
    const user = userEvent.setup()
    renderCompare('/comparar?ids=1')
    await user.click(await screen.findByRole('button', { name: 'Quitar Mazda 3 de la comparación' }))
    expect(await screen.findByText('Todavía no elegiste vehículos para comparar')).toBeInTheDocument()
    expect(where()).toBe('/comparar')
  })

  it('sin ids en la URL adopta la selección hecha en el catálogo', async () => {
    sessionStorage.setItem('automax.compare', JSON.stringify([2, 3]))
    renderCompare('/comparar')
    await loaded('Toyota Yaris')
    expect(where()).toBe('/comparar?ids=2%2C3')
  })

  it('sin ids y sin selección muestra el estado vacío con salida al catálogo', async () => {
    renderCompare('/comparar')
    expect(await screen.findByText('Todavía no elegiste vehículos para comparar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Ir al catálogo' }))
    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument()
  })

  it('con menos de 3 ofrece agregar otro y dice cuántos faltan', async () => {
    renderCompare('/comparar?ids=1,2')
    await loaded('Mazda 3')
    expect(screen.getByRole('link', { name: 'Agregar otro vehículo' })).toHaveAttribute('href', '/catalogo')
    expect(screen.getByText(/Puedes agregar 1 más/)).toBeInTheDocument()
  })

  it('la URL manda sobre la selección guardada', async () => {
    sessionStorage.setItem('automax.compare', JSON.stringify([6]))
    renderCompare('/comparar?ids=1,2')
    await loaded('Mazda 3')
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('automax.compare') ?? '[]')).toEqual([1, 2]))
  })
})
