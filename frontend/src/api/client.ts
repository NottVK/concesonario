import axios, { isAxiosError } from 'axios'
import { clearToken, getToken } from './session'

/** Cliente HTTP único. En desarrollo `/api` pasa por el proxy de Vite. */
export const api = axios.create({ baseURL: '/api', timeout: 15_000 })

/** URL absoluta o relativa al protocolo (`https://…`, `//otro.com/…`): apunta a otro origen que la API. */
const CROSS_ORIGIN_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

api.interceptors.request.use((config) => {
  const token = getToken()
  // El bearer solo viaja a la API: si alguna vez se llama a una URL externa con este cliente, no se filtra.
  if (token && !CROSS_ORIGIN_URL.test(config.url ?? '')) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

// Un 401 con token guardado significa sesión vencida: se limpia y la UI redirige al login.
// Sin token (por ejemplo credenciales malas en el login) el error pasa tal cual.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401 && getToken()) clearToken()
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
