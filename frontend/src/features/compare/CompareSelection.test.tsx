import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { VehicleWithBrand } from '@/api/types'
import { VehicleCard } from '@/features/catalog/VehicleCard'
import { CompareDetailButton } from './CompareButton'
import { CompareProvider, useCompare } from './CompareContext'
import { CompareTray } from './CompareTray'

const car = (id: number): VehicleWithBrand => ({
  id, brandId: 1, brand: { id: 1, name: 'Kia', country: 'X', logoUrl: null }, model: `Modelo ${id}`, year: 2024,
  version: 'Base', price: '90000000.00', mileage: 0, fuel: 'gasolina', transmission: 'manual', color: 'Gris',
  status: 'nuevo', revision: 1, description: null, images: [],
})

function Probe() {
  const compare = useCompare()
  return (
    <>
      <output data-testid="ids">{compare.ids.join(',')}</output>
      {[1, 2, 3, 4].map((id) => (
        <button key={id} onClick={() => compare.toggle(id)}>
          toggle {id}
        </button>
      ))}
      <button onClick={() => compare.replace([7, 7, 8, 9, 10, 11])}>replace</button>
      <button onClick={() => compare.clear()}>clear</button>
    </>
  )
}

const KEY = 'automax.compare'

describe('CompareProvider', () => {
  it('guarda hasta 3 vehículos y rechaza el cuarto', async () => {
    const user = userEvent.setup()
    render(<CompareProvider><Probe /></CompareProvider>)
    for (const id of [1, 2, 3, 4]) await user.click(screen.getByRole('button', { name: `toggle ${id}` }))
    expect(screen.getByTestId('ids')).toHaveTextContent('1,2,3')
  })

  it('quitar uno libera un lugar', async () => {
    const user = userEvent.setup()
    render(<CompareProvider><Probe /></CompareProvider>)
    for (const id of [1, 2, 3]) await user.click(screen.getByRole('button', { name: `toggle ${id}` }))
    await user.click(screen.getByRole('button', { name: 'toggle 2' }))
    await user.click(screen.getByRole('button', { name: 'toggle 4' }))
    expect(screen.getByTestId('ids')).toHaveTextContent('1,3,4')
  })

  it('replace limpia repetidos y respeta el máximo', async () => {
    const user = userEvent.setup()
    render(<CompareProvider><Probe /></CompareProvider>)
    await user.click(screen.getByRole('button', { name: 'replace' }))
    expect(screen.getByTestId('ids')).toHaveTextContent('7,8,9')
  })

  it('guarda solo ids en sessionStorage (nada personal) y nunca en localStorage', async () => {
    const user = userEvent.setup()
    render(<CompareProvider><Probe /></CompareProvider>)
    await user.click(screen.getByRole('button', { name: 'toggle 1' }))
    await user.click(screen.getByRole('button', { name: 'toggle 2' }))
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? 'null')).toEqual([1, 2])
    expect(localStorage.length).toBe(0)
  })

  it('recupera la selección al recargar y descarta datos corruptos o manipulados', () => {
    sessionStorage.setItem(KEY, JSON.stringify([4, 5]))
    const first = render(<CompareProvider><Probe /></CompareProvider>)
    expect(screen.getByTestId('ids')).toHaveTextContent('4,5')
    first.unmount()

    for (const bad of ['no es json', '{"a":1}', '[1,"2",-3,0,1.5,null,99999999999]', '[1,2,3,4,5,6]']) {
      sessionStorage.setItem(KEY, bad)
      const view = render(<CompareProvider><Probe /></CompareProvider>)
      const ids = screen.getByTestId('ids').textContent ?? ''
      expect(ids.split(',').filter(Boolean).length).toBeLessThanOrEqual(3)
      expect(ids).not.toMatch(/[^0-9,]/)
      view.unmount()
    }
  })

  it('sigue funcionando en memoria si sessionStorage falla', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const user = userEvent.setup()
    render(<CompareProvider><Probe /></CompareProvider>)
    await user.click(screen.getByRole('button', { name: 'toggle 1' }))
    expect(screen.getByTestId('ids')).toHaveTextContent('1')
    spy.mockRestore()
  })

  it('usarlo fuera del proveedor da un error claro', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/CompareProvider/)
    spy.mockRestore()
  })
})

describe('botones de comparar', () => {
  it('la tarjeta alterna el estado y su botón no está dentro del enlace', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CompareProvider>
          <ul>
            <VehicleCard vehicle={car(1)} />
          </ul>
          <Probe />
        </CompareProvider>
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Comparar Kia Modelo 1' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.closest('a')).toBeNull()
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('En comparación')
    expect(screen.getByTestId('ids')).toHaveTextContent('1')
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('con 3 elegidos el cuarto queda bloqueado con una explicación', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CompareProvider>
          <ul>
            <VehicleCard vehicle={car(9)} />
          </ul>
          <Probe />
        </CompareProvider>
      </MemoryRouter>,
    )
    for (const id of [1, 2, 3]) await user.click(screen.getByRole('button', { name: `toggle ${id}` }))
    const button = screen.getByRole('button', { name: 'Comparar Kia Modelo 9' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/Quita uno/))
  })

  it('el botón del detalle agrega, quita y avisa cuando ya hay 3', async () => {
    const user = userEvent.setup()
    render(
      <CompareProvider>
        <CompareDetailButton vehicle={car(9)} />
        <Probe />
      </CompareProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Agregar al comparador' }))
    expect(screen.getByRole('button', { name: 'Quitar del comparador' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Quitar del comparador' }))
    for (const id of [1, 2, 3]) await user.click(screen.getByRole('button', { name: `toggle ${id}` }))
    expect(screen.getByRole('button', { name: 'Agregar al comparador' })).toBeDisabled()
    expect(screen.getByText(/Ya elegiste 3 vehículos/)).toBeInTheDocument()
  })
})

describe('CompareTray', () => {
  const renderTray = (path = '/catalogo') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <CompareProvider>
          <Routes>
            <Route path="*" element={<><CompareTray /><Probe /></>} />
          </Routes>
        </CompareProvider>
      </MemoryRouter>,
    )

  it('no aparece sin selección', () => {
    renderTray()
    expect(screen.queryByRole('region', { name: 'Vehículos para comparar' })).not.toBeInTheDocument()
  })

  it('con un solo vehículo pide elegir otro y no deja comparar', async () => {
    const user = userEvent.setup()
    renderTray()
    await user.click(screen.getByRole('button', { name: 'toggle 1' }))
    const tray = screen.getByRole('region', { name: 'Vehículos para comparar' })
    expect(within(tray).getByText('1 de 3 para comparar')).toBeInTheDocument()
    expect(within(tray).getByText(/Elige al menos 2/)).toBeInTheDocument()
    expect(within(tray).getByRole('button', { name: 'Comparar' })).toBeDisabled()
  })

  it('con 2 o más enlaza a /comparar con los ids y con 3 avisa del máximo', async () => {
    const user = userEvent.setup()
    renderTray()
    await user.click(screen.getByRole('button', { name: 'toggle 1' }))
    await user.click(screen.getByRole('button', { name: 'toggle 2' }))
    expect(screen.getByRole('link', { name: 'Comparar' })).toHaveAttribute('href', '/comparar?ids=1,2')
    await user.click(screen.getByRole('button', { name: 'toggle 3' }))
    expect(screen.getByText(/Máximo 3/)).toBeInTheDocument()
  })

  it('Vaciar borra la selección', async () => {
    const user = userEvent.setup()
    renderTray()
    await user.click(screen.getByRole('button', { name: 'toggle 1' }))
    await user.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(screen.getByTestId('ids')).toHaveTextContent('')
    expect(screen.queryByRole('region', { name: 'Vehículos para comparar' })).not.toBeInTheDocument()
  })

  it('se oculta dentro de /comparar', async () => {
    sessionStorage.setItem(KEY, JSON.stringify([1, 2]))
    renderTray('/comparar')
    expect(screen.queryByRole('region', { name: 'Vehículos para comparar' })).not.toBeInTheDocument()
  })
})
