import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router-dom'
import { CompareProvider } from '@/features/compare/CompareContext'
import { resetChatTokenCache } from './chatSession'
import { ChatWidget } from './ChatWidget'
import { THINKING_AFTER_MS } from './useChat'

interface Reply {
  reply: string
  cards: unknown[]
  proposal: unknown
  sessionToken?: string
}

const TOKEN = 'a'.repeat(43)
const reply = (text: string, extra: Partial<Reply> = {}): Reply => ({ reply: text, cards: [], proposal: null, ...extra })

const card = { id: 12, title: 'Mazda 3 Touring', year: 2024, price: '95900000.00', priceText: '$95.900.000', fuel: 'gasolina', transmission: 'automatica', mileage: 0, status: 'nuevo', image: null }
const proposal = {
  id: '11111111-1111-4111-8111-111111111111',
  summary: 'Test-drive del Mazda 3 Touring, martes 3 de noviembre, 10:00 a. m. (hora de Bogotá)',
  vehicleLabel: 'Mazda 3 Touring',
  startsAt: '2026-11-03T15:00:00.000Z',
  expiresAt: '2026-11-03T14:10:00.000Z',
}

const chatCalls: { body: Record<string, unknown>; session: string | null }[] = []
const confirmCalls: Record<string, unknown>[] = []
let deleteCalls = 0
let chatResponse: () => Response | Promise<Response>
let statusResponse: () => Response
let confirmResponse: () => Response

const server = setupServer(
  http.get('*/api/chat/estado', () => statusResponse()),
  http.post('*/api/chat', async ({ request }) => {
    chatCalls.push({ body: (await request.json()) as Record<string, unknown>, session: request.headers.get('x-chat-session') })
    return chatResponse()
  }),
  http.delete('*/api/chat/sesion', () => {
    deleteCalls += 1
    return new HttpResponse(null, { status: 204 })
  }),
  http.post('*/api/chat/citas/confirmar', async ({ request }) => {
    confirmCalls.push((await request.json()) as Record<string, unknown>)
    return confirmResponse()
  }),
)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  resetChatTokenCache()
  chatResponse = () => HttpResponse.json(reply('¡Hola!', { sessionToken: TOKEN }))
  statusResponse = () => HttpResponse.json({ available: true, provider: 'ollama', external: false })
  confirmResponse = () => HttpResponse.json({ appointmentId: 77, message: 'Cita #77 registrada para Mazda 3 Touring.' })
})
afterEach(() => {
  vi.useRealTimers()
  server.resetHandlers()
  chatCalls.length = 0
  confirmCalls.length = 0
  deleteCalls = 0
})
afterAll(() => server.close())

function renderWidget(path = '/', thinkingAfterMs?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CompareProvider>
          <ChatWidget thinkingAfterMs={thinkingAfterMs} />
        </CompareProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const open = async (user = userEvent.setup()) => {
  await user.click(screen.getByRole('button', { name: 'Abrir asistente' }))
  return user
}
const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Escribe tu mensaje'), text)
  await user.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
}

describe('abrir y cerrar', () => {
  it('empieza cerrado, abre con el foco en el campo y vuelve el foco al botón al cerrar', async () => {
    renderWidget()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const user = await open()
    expect(screen.getByRole('dialog', { name: 'Asistente de AutoMax' })).toBeInTheDocument()
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cerrar asistente' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir asistente' })).toHaveFocus()
  })

  it('Esc cierra', async () => {
    renderWidget()
    const user = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la conversación es un log con aria-live educado', async () => {
    renderWidget()
    await open()
    const log = screen.getByRole('log', { name: 'Conversación' })
    expect(log).toHaveAttribute('aria-live', 'polite')
  })
})

describe('enviar mensajes', () => {
  it('muestra «escribiendo…» mientras espera y luego la respuesta; guarda solo el token en sessionStorage', async () => {
    let release!: () => void
    chatResponse = () => new Promise((resolve) => (release = () => resolve(HttpResponse.json(reply('Hola, ¿qué buscas?', { sessionToken: TOKEN })))))
    renderWidget()
    const user = await open()
    await ask(user, 'Hola')
    expect(await screen.findByText('escribiendo…')).toBeInTheDocument()
    expect(screen.getByText('Hola')).toBeInTheDocument()
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue('')
    release()
    expect(await screen.findByText('Hola, ¿qué buscas?')).toBeInTheDocument()
    expect(screen.queryByText('escribiendo…')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('automax.chat.session')).toBe(TOKEN)
    // Los mensajes jamás se guardan en el navegador.
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('qué buscas')
    expect(localStorage.length).toBe(0)
  })

  it('el segundo mensaje viaja con X-Chat-Session', async () => {
    renderWidget()
    const user = await open()
    await ask(user, 'uno')
    await screen.findByText('¡Hola!')
    chatResponse = () => HttpResponse.json(reply('segunda'))
    await ask(user, 'dos')
    await screen.findByText('segunda')
    expect(chatCalls.map((c) => c.session)).toEqual([null, TOKEN])
  })

  it('Enter envía y Shift+Enter agrega una línea', async () => {
    renderWidget()
    const user = await open()
    const box = screen.getByLabelText('Escribe tu mensaje')
    await user.type(box, 'línea 1{Shift>}{Enter}{/Shift}línea 2')
    expect(box).toHaveValue('línea 1\nlínea 2')
    expect(chatCalls).toHaveLength(0)
    await user.keyboard('{Enter}')
    await screen.findByText('¡Hola!')
    expect(chatCalls[0]!.body.message).toBe('línea 1\nlínea 2')
  })

  it('no envía mensajes vacíos y limita a 500 caracteres', async () => {
    renderWidget()
    const user = await open()
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled()
    await user.click(screen.getByLabelText('Escribe tu mensaje'))
    await user.paste('x'.repeat(600))
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue('x'.repeat(500))
    expect(screen.getByText('500/500')).toBeInTheDocument()
  })

  it('manda el vehicleId cuando se está en la ficha de un vehículo, y solo si es válido', async () => {
    const view = renderWidget('/catalogo/21')
    const user = await open()
    await ask(user, 'precio')
    await screen.findByText('¡Hola!')
    expect(chatCalls[0]!.body).toEqual({ message: 'precio', vehicleId: 21 })
    view.unmount()
    chatCalls.length = 0
    renderWidget('/catalogo/abc')
    const second = await open()
    await ask(second, 'precio')
    await screen.findByText('¡Hola!')
    expect(chatCalls[0]!.body).toEqual({ message: 'precio' })
  })

  it('muestra las fichas con precio y enlace a la ficha del vehículo', async () => {
    chatResponse = () => HttpResponse.json(reply('Te muestro uno.', { cards: [card] }))
    renderWidget()
    const user = await open()
    await ask(user, 'mazda')
    expect(await screen.findByText('$95.900.000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver ficha/ })).toHaveAttribute('href', '/catalogo/12')
  })

  it('pinta el texto del modelo como TEXTO: <img onerror> y <script> no se interpretan', async () => {
    const hostile = 'Mira <img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script> <b>negrita</b>'
    chatResponse = () => HttpResponse.json(reply(hostile))
    const { container } = renderWidget()
    const user = await open()
    await ask(user, 'hola')
    expect(await screen.findByText(hostile)).toBeInTheDocument()
    expect(container.ownerDocument.querySelector('img, script, b')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('«Sigo pensando…» aparece cuando la respuesta tarda (10 s en la app; aquí 80 ms)', async () => {
    chatResponse = () => new Promise<Response>(() => undefined)
    renderWidget('/', 80)
    const user = await open()
    await ask(user, 'hola')
    expect(await screen.findByText('escribiendo…')).toBeInTheDocument()
    expect(await screen.findByText('Sigo pensando…')).toBeInTheDocument()
  })

  it('el plazo por defecto para «Sigo pensando…» es de 10 s', () => {
    expect(THINKING_AFTER_MS).toBe(10_000)
  })
})

describe('errores', () => {
  it('503: avisa con el texto del servidor y «Reintentar» reenvía el mismo mensaje sin duplicarlo', async () => {
    chatResponse = () => HttpResponse.json({ message: 'El asistente no está disponible ahora. Puedes usar el catálogo.' }, { status: 503 })
    renderWidget()
    const user = await open()
    await ask(user, 'precio del Mazda')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/no está disponible ahora/)).toBeInTheDocument()
    chatResponse = () => HttpResponse.json(reply('Cuesta $95.900.000'))
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Cuesta $95.900.000')).toBeInTheDocument()
    expect(screen.getAllByText('precio del Mazda')).toHaveLength(1)
    expect(chatCalls).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('504 y fallos de red ofrecen reintentar', async () => {
    chatResponse = () => HttpResponse.json({ message: 'tardó' }, { status: 504 })
    renderWidget()
    const user = await open()
    await ask(user, 'hola')
    expect(await screen.findByText(/tardó demasiado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    chatResponse = () => HttpResponse.error()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/No pudimos comunicarnos/)).toBeInTheDocument()
  })

  it('429: deshabilita el campo con cuenta regresiva y lo habilita al terminar', async () => {
    chatResponse = () => HttpResponse.json({ message: 'Espera un par de segundos antes de enviar otro mensaje.' }, { status: 429, headers: { 'Retry-After': '3' } })
    renderWidget()
    const user = await open()
    await ask(user, 'hola')
    expect(await screen.findByText(/Podrás escribir de nuevo en 3 s/)).toBeInTheDocument()
    const box = screen.getByLabelText('Escribe tu mensaje')
    expect(box).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    await waitFor(() => expect(box).toBeEnabled(), { timeout: 5000 })
    expect(screen.queryByText(/Podrás escribir de nuevo/)).not.toBeInTheDocument()
  })

  it('si el asistente está caído al abrir (estado), muestra el aviso y deshabilita el campo; Reintentar lo vuelve a consultar', async () => {
    statusResponse = () => HttpResponse.json({ available: false, provider: 'ollama', external: false })
    renderWidget()
    const user = await open()
    expect(await screen.findByText(/El asistente no está disponible ahora/)).toBeInTheDocument()
    expect(screen.getByLabelText('Escribe tu mensaje')).toBeDisabled()
    statusResponse = () => HttpResponse.json({ available: true, provider: 'ollama', external: false })
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByLabelText('Escribe tu mensaje')).toBeEnabled())
  })
})

describe('aviso de servicio externo', () => {
  it('con groq avisa en una línea que el texto puede procesarse en un servicio externo', async () => {
    statusResponse = () => HttpResponse.json({ available: true, provider: 'groq', external: true })
    renderWidget()
    await open()
    expect(await screen.findByText(/puede procesarse en un servicio externo/)).toBeInTheDocument()
  })

  it('con un modelo local no muestra el aviso', async () => {
    renderWidget()
    await open()
    await waitFor(() => expect(screen.getByLabelText('Escribe tu mensaje')).toBeEnabled())
    expect(screen.queryByText(/servicio externo/)).not.toBeInTheDocument()
  })
})

describe('sesión', () => {
  it('«Nueva conversación» limpia la pantalla y olvida el token sin llamar al servidor', async () => {
    renderWidget()
    const user = await open()
    await ask(user, 'hola')
    await screen.findByText('¡Hola!')
    await user.click(screen.getByRole('button', { name: 'Nueva conversación' }))
    expect(screen.queryByText('¡Hola!')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('automax.chat.session')).toBeNull()
    expect(deleteCalls).toBe(0)
  })

  it('«Borrar conversación» pide el borrado al servidor y limpia todo', async () => {
    renderWidget()
    const user = await open()
    await ask(user, 'hola')
    await screen.findByText('¡Hola!')
    await user.click(screen.getByRole('button', { name: 'Borrar conversación' }))
    await waitFor(() => expect(screen.queryByText('¡Hola!')).not.toBeInTheDocument())
    expect(deleteCalls).toBe(1)
    expect(sessionStorage.getItem('automax.chat.session')).toBeNull()
  })

  it('si sessionStorage falla, la conversación sigue funcionando con la copia en memoria', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    renderWidget()
    const user = await open()
    await ask(user, 'uno')
    await screen.findByText('¡Hola!')
    chatResponse = () => HttpResponse.json(reply('segunda'))
    await ask(user, 'dos')
    await screen.findByText('segunda')
    expect(chatCalls.map((c) => c.session)).toEqual([null, TOKEN])
    setItem.mockRestore()
    getItem.mockRestore()
  })
})

describe('propuesta de cita', () => {
  const withProposal = () => {
    chatResponse = () => HttpResponse.json(reply('Preparé tu propuesta.', { proposal, cards: [card] }))
  }
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Nombre'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo'), 'ana@correo.co')
    await user.type(screen.getByLabelText('Teléfono (opcional)'), '300 123 4567')
  }

  it('muestra el resumen del servidor y NO hace ninguna petición de cita hasta confirmar', async () => {
    withProposal()
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    const form = await screen.findByRole('form', { name: 'Confirmar cita' })
    expect(within(form).getByText(proposal.summary)).toBeInTheDocument()
    expect(within(form).getByText(/Todavía no está agendada/)).toBeInTheDocument()
    expect(confirmCalls).toHaveLength(0)
  })

  it('confirmar manda UN solo POST con los datos y muestra la cita registrada', async () => {
    withProposal()
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    await screen.findByRole('form', { name: 'Confirmar cita' })
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    expect(await screen.findByText('Cita #77 registrada para Mazda 3 Touring.')).toBeInTheDocument()
    expect(confirmCalls).toEqual([{ proposalId: proposal.id, customer: { name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' } }])
    expect(screen.queryByRole('form', { name: 'Confirmar cita' })).not.toBeInTheDocument()
    expect(chatCalls).toHaveLength(1) // los datos del formulario no pasaron por el chat
    expect(JSON.stringify(chatCalls)).not.toContain('ana@correo.co')
  })

  it('cancelar descarta la propuesta sin ninguna petición', async () => {
    withProposal()
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    await screen.findByRole('form', { name: 'Confirmar cita' })
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Confirmar cita' })).not.toBeInTheDocument()
    expect(screen.getByText('Propuesta descartada.')).toBeInTheDocument()
    expect(confirmCalls).toHaveLength(0)
  })

  it('valida nombre y correo sin enviar nada', async () => {
    withProposal()
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    await screen.findByRole('form', { name: 'Confirmar cita' })
    await user.type(screen.getByLabelText('Correo'), 'no-es-correo')
    await user.type(screen.getByLabelText('Teléfono (opcional)'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    expect(screen.getByText(/Escribe tu nombre/)).toBeInTheDocument()
    expect(screen.getByText(/correo válido/)).toBeInTheDocument()
    expect(screen.getByText(/Usa solo números/)).toBeInTheDocument()
    expect(confirmCalls).toHaveLength(0)
  })

  it.each([
    [410, /ya venció o se usó/],
    [409, /horario ya no está disponible/],
    [429, /Espera un minuto/],
  ])('error %s al confirmar: mensaje claro y la tarjeta sigue ahí', async (status, text) => {
    withProposal()
    confirmResponse = () => HttpResponse.json({ message: 'x' }, { status })
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    await screen.findByRole('form', { name: 'Confirmar cita' })
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Confirmar cita' })).toBeInTheDocument()
  })

  it('sin respuesta del servidor avisa que la cita pudo quedar registrada', async () => {
    withProposal()
    confirmResponse = () => HttpResponse.error() as unknown as Response
    renderWidget()
    const user = await open()
    await ask(user, 'agéndame')
    await screen.findByRole('form', { name: 'Confirmar cita' })
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    expect(await screen.findByText(/pudo quedar registrada/)).toBeInTheDocument()
  })
})
