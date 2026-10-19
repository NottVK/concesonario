import { fireEvent, render, screen } from '@testing-library/react'
import { CarImage, PLACEHOLDER_SRC } from './CarImage'

describe('CarImage', () => {
  it('muestra la foto con alt y carga diferida', () => {
    render(<CarImage src="/autos/toyota-corolla.webp" alt="Toyota Corolla 2024" />)
    const img = screen.getByAltText('Toyota Corolla 2024')
    expect(img).toHaveAttribute('src', '/autos/toyota-corolla.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('cambia al placeholder cuando el .webp no existe', () => {
    render(<CarImage src="/autos/no-existe.webp" alt="Mazda 3" />)
    fireEvent.error(screen.getByAltText('Mazda 3'))
    expect(screen.getByAltText('Mazda 3')).toHaveAttribute('src', PLACEHOLDER_SRC)
  })

  it('no entra en bucle si el placeholder también falla', () => {
    render(<CarImage src="/autos/no-existe.webp" alt="Kia Rio" />)
    const img = screen.getByAltText('Kia Rio')
    fireEvent.error(img)
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', PLACEHOLDER_SRC)
  })

  it('usa el placeholder si el vehículo no tiene imagen', () => {
    render(<CarImage src={undefined} alt="Sin foto" />)
    expect(screen.getByAltText('Sin foto')).toHaveAttribute('src', PLACEHOLDER_SRC)
  })
})
