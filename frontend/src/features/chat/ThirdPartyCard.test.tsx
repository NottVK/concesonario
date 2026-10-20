import { render, screen, within } from '@testing-library/react'
import { ThirdPartyCard } from './ThirdPartyCard'

const card = (text: string, flags: string[] = [], botName = 'SegurosYa Bot') => ({ botName, text, flags })

describe('ThirdPartyCard', () => {
  it('se identifica siempre como «tercero no verificado» y nombra al bot', () => {
    render(<ThirdPartyCard card={card('El SOAT es obligatorio para circular.')} />)
    const region = screen.getByRole('complementary', { name: /tercero no verificado: SegurosYa Bot/i })
    expect(within(region).getByText('Tercero no verificado')).toBeInTheDocument()
    expect(within(region).getByText('SegurosYa Bot')).toBeInTheDocument()
    expect(within(region).getByText(/No es información de AutoMax/)).toBeInTheDocument()
    expect(within(region).getByText('El SOAT es obligatorio para circular.')).toBeInTheDocument()
  })

  it('pinta el texto SIEMPRE como texto: HTML, scripts, imágenes y enlaces del tercero no se interpretan', () => {
    const hostile = '<img src=x onerror="alert(1)"> <script>alert(2)</script> <a href="https://atacante.example">clic</a> [x](javascript:alert(3))'
    const { container } = render(<ThirdPartyCard card={card(hostile)} />)
    // El texto aparece literal…
    expect(screen.getByText(hostile)).toBeInTheDocument()
    // …y no se creó ningún elemento a partir de él.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.querySelectorAll('[href]')).toHaveLength(0)
    expect(container.querySelectorAll('[src]')).toHaveLength(0)
  })

  it('el nombre del bot también es texto plano', () => {
    const { container } = render(<ThirdPartyCard card={card('hola', [], '<b onmouseover=alert(1)>Bot</b>')} />)
    expect(screen.getByText('<b onmouseover=alert(1)>Bot</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })

  it('conserva los saltos de línea del texto sin convertirlos en HTML', () => {
    render(<ThirdPartyCard card={card('línea uno\nlínea dos')} />)
    const quote = screen.getByText(/línea uno/)
    expect(quote.tagName).toBe('BLOCKQUOTE')
    expect(quote).toHaveClass('whitespace-pre-wrap')
  })

  it('avisa de lo que se quitó, con el aviso de suplantación primero', () => {
    render(<ThirdPartyCard card={card('texto', ['recortado', 'enlace', 'dice-ser-automax', 'numero'])} />)
    const items = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual([
      'Este mensaje dice ser de AutoMax, pero NO lo es: lo escribió otro bot.',
      'Se quitaron enlaces del texto.',
      'Se taparon números de contacto del texto.',
      'El texto se acortó.',
    ])
  })

  it('un aviso desconocido no rompe la tarjeta ni se muestra', () => {
    render(<ThirdPartyCard card={card('texto', ['algo-nuevo', '<script>'])} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('texto')).toBeInTheDocument()
  })

  it('sin avisos no pinta lista', () => {
    render(<ThirdPartyCard card={card('texto limpio')} />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})
