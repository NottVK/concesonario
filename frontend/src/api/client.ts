import axios, { isAxiosError } from 'axios'
import { clearToken, getToken } from './session'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** No intentar reautenticar si responde 401 (login y comprobación inicial de sesión). */
    skipReauth?: boolean
    /** Token con el que salió la petición: sirve para saber de qué usuario era. */
    usedToken?: string | null
    /** La petición ya se reintentó una vez tras volver a entrar; no se reintenta otra vez. */
    retried?: boolean
  }
}

/** Cliente HTTP único. En desarrollo `/api` pasa por el proxy de Vite. */
export const api = axios.create({ baseURL: '/api', timeout: 15_000 })

/** URL absoluta o relativa al protocolo (`https://…`, `//otro.com/…`): apunta a otro origen que la API. */
const CROSS_ORIGIN_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

api.interceptors.request.use((config) => {
  const token = getToken()
  // El bearer solo viaja a la API: si alguna vez se llama a una URL externa con este cliente, no se filtra.
  if (token && !CROSS_ORIGIN_URL.test(config.url ?? '')) {
    config.headers.set('Authorization', `Bearer ${token}`)
    config.usedToken = token
  }
  return config
})

/**
 * Qué hacer cuando una petición con sesión recibe 401. Lo registra la sesión de la app (`AuthProvider`):
 * decide si se puede reintentar. `usedToken` es el token con el que salió la petición.
 */
export type UnauthorizedHandler = (usedToken: string) => Promise<'retry' | 'reject'>
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

// Un 401 con token significa sesión vencida. Si la app registró un manejador (panel), este pide volver a
// entrar y la petición solo se reintenta, una vez, si vuelve a entrar el MISMO usuario. Un 401 es de la
// puerta de autenticación: la acción no se ejecutó, así que reintentar es seguro. Sin manejador, o sin
// token (credenciales malas en el login), se limpia la sesión / el error pasa tal cual.
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) return Promise.reject(error)
    const config = error.config
    const usedToken = config.usedToken
    if (!usedToken || config.skipReauth) return Promise.reject(error)

    if (!unauthorizedHandler || config.retried) {
      if (getToken()) clearToken()
      return Promise.reject(error)
    }
    const outcome = await unauthorizedHandler(usedToken)
    if (outcome === 'retry') return api.request({ ...config, retried: true })
    return Promise.reject(error)
  },
)

interface ApiErrorBody {
  message?: string | string[]
}

/** Mensaje en español listo para mostrar al usuario. */
export function errorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return 'No hay conexión con el servidor. Intenta de nuevo.'
    if (error.response.status === 429) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
    // Los 5xx traen textos técnicos en inglés ("Internal server error"); al usuario no se le muestran.
    if (error.response.status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en un momento.'
    const message = error.response.data?.message
    if (Array.isArray(message)) return message.join('. ')
    if (message) return message
  }
  return 'Ocurrió un error inesperado. Intenta de nuevo.'
}
