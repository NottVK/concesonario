import { AxiosError } from 'axios'
import { api, errorMessage } from './client'
import { clearToken, getToken, setToken } from './session'

describe('sesión', () => {
  afterEach(() => clearToken())

  it('guarda el token en sessionStorage y nunca en localStorage', () => {
    setToken('abc.def.ghi')
    expect(getToken()).toBe('abc.def.ghi')
    expect(sessionStorage.getItem('automax.token')).toBe('abc.def.ghi')
    expect(localStorage.length).toBe(0)
  })

  it('clearToken borra memoria y storage', () => {
    setToken('abc')
    clearToken()
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('automax.token')).toBeNull()
  })

  it('sigue funcionando en memoria si sessionStorage falla', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(() => setToken('solo-memoria')).not.toThrow()
    expect(getToken()).toBe('solo-memoria')
    spy.mockRestore()
  })

  it('el cliente envía Authorization: Bearer cuando hay sesión', async () => {
    setToken('mi-token')
    let header: unknown
    await api.get('/x', {
      adapter: async (config) => {
        header = config.headers.get('Authorization')
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      },
    })
    expect(header).toBe('Bearer mi-token')
  })

  it('un 401 con sesión activa limpia el token', async () => {
    setToken('vencido')
    await expect(
      api.get('/privado', {
        adapter: async (config) => {
          throw new AxiosError('no autorizado', '401', config, null, {
            data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config,
          })
        },
      }),
    ).rejects.toBeDefined()
    expect(getToken()).toBeNull()
  })
})

describe('errorMessage', () => {
  it('une los mensajes de validación y traduce 429 y la falta de red', () => {
    const withResponse = (status: number, message?: string | string[]) =>
      new AxiosError('x', String(status), undefined, null, {
        data: { message }, status, statusText: '', headers: {}, config: {} as never,
      })
    expect(errorMessage(withResponse(400, ['a', 'b']))).toBe('a. b')
    expect(errorMessage(withResponse(429))).toMatch(/Demasiados intentos/)
    expect(errorMessage(new AxiosError('Network Error'))).toMatch(/No hay conexión/)
    expect(errorMessage(new Error('otro'))).toMatch(/inesperado/)
  })
})

describe('el bearer solo viaja a la API', () => {
  const sent = async (url: string): Promise<unknown> => {
    let header: unknown
    await api.get(url, {
      adapter: async (config) => {
        header = config.headers.get('Authorization')
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      },
    })
    return header
  }

  afterEach(() => clearToken())

  it('lo adjunta a rutas relativas de la API', async () => {
    setToken('t')
    expect(await sent('/vehiculos')).toBe('Bearer t')
    expect(await sent('citas/1')).toBe('Bearer t')
  })

  it.each(['https://otro-dominio.com/x', 'http://localhost:9999/x', '//otro-dominio.com/x', 'HTTPS://MAYUS.com/x', 'ftp://x.com/a', 'javascript:alert(1)'])(
    'no lo adjunta a %s',
    async (url) => {
      setToken('secreto')
      expect(await sent(url)).toBeUndefined()
    },
  )
})

describe('errorMessage con errores del servidor', () => {
  const withStatus = (status: number, message?: string) =>
    new AxiosError('x', String(status), undefined, null, { data: { message }, status, statusText: '', headers: {}, config: {} as never })

  it('los 5xx no muestran el texto técnico en inglés del servidor', () => {
    for (const status of [500, 502, 503]) {
      const text = errorMessage(withStatus(status, 'Internal server error'))
      expect(text).toMatch(/El servidor tuvo un problema/)
      expect(text).not.toMatch(/Internal/)
    }
  })

  it('los 4xx siguen mostrando el mensaje en español del servidor', () => {
    expect(errorMessage(withStatus(404, 'No existe el vehículo 5'))).toBe('No existe el vehículo 5')
  })
})
