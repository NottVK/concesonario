import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, setUnauthorizedHandler } from '@/api/client'
import { clearToken, getToken, setToken, subscribeToken } from '@/api/session'
import type { LoginResult, PublicUser } from '@/api/types'
import { ReloginDialog } from './ReloginDialog'
import { decodeJwt, subjectOf } from './jwt'
import type { Role } from './jwt'

export type AuthUser = Pick<PublicUser, 'id' | 'name' | 'email'> & { role: Role }
type Status = 'loading' | 'anonymous' | 'authenticated'
export type ReloginReason = 'expired' | 'renew'

/** Aviso previo al vencimiento del token (no hay refresco: renovar es volver a entrar). */
export const WARN_BEFORE_MS = 2 * 60_000
const CHANNEL = 'automax-auth'
/** Señal sin datos para avisar el cierre de sesión a otras pestañas si el navegador no tiene BroadcastChannel. */
const STORAGE_SIGNAL = 'automax.logout'
const MAX_TIMER_MS = 2 ** 31 - 1

interface AuthApi {
  status: Status
  user: AuthUser | null
  /** Vencimiento de la sesión (ms desde la época), leído del token. */
  expiresAt: number | null
  /** Quedan menos de 2 minutos para que venza. */
  warning: boolean
  notice: string | null
  dismissNotice: () => void
  reloginReason: ReloginReason | null
  /** Inicia sesión (pantalla de login) o la renueva (diálogo). La contraseña NO se guarda en ningún estado. */
  signIn: (email: string, password: string) => Promise<AuthUser>
  logout: () => void
  openRenew: () => void
  closeRenew: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return context
}

const toUser = (user: PublicUser): AuthUser => ({ id: user.id, name: user.name, email: user.email, role: user.role })

/** Inicio de cada rol dentro del panel. */
export const homeFor = (): string => '/admin'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const token = useSyncExternalStore(subscribeToken, getToken, () => null)

  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'anonymous'))
  const [notice, setNotice] = useState<string | null>(null)
  const [reloginReason, setReloginReason] = useState<ReloginReason | null>(null)
  const [warning, setWarning] = useState(false)

  const userRef = useRef<AuthUser | null>(null)
  userRef.current = user
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const relogin = useRef<{ promise: Promise<number | null>; resolve: (id: number | null) => void } | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  /** Verdadero mientras se cierra la sesión a propósito, para no confundirlo con un token borrado desde fuera. */
  const ending = useRef(false)

  const expiresAt = useMemo(() => {
    const exp = decodeJwt(token)?.exp
    return exp ? exp * 1000 : null
  }, [token])

  /** Abre el diálogo de re-login (uno solo, aunque lleguen varios 401 a la vez) y devuelve una promesa con el id que entró. */
  const openRelogin = useCallback((reason: ReloginReason): Promise<number | null> => {
    if (!relogin.current) {
      let resolve!: (id: number | null) => void
      const promise = new Promise<number | null>((done) => {
        resolve = done
      })
      relogin.current = { promise, resolve }
    }
    setReloginReason((current) => (current === 'expired' ? 'expired' : reason))
    return relogin.current.promise
  }, [])

  const closeRelogin = useCallback((enteredId: number | null) => {
    relogin.current?.resolve(enteredId)
    relogin.current = null
    setReloginReason(null)
  }, [])

  /** Termina la sesión en ESTA pestaña: token, usuario y todos los datos en memoria (la caché) quedan borrados. */
  const endSession = useCallback(
    (message: string | null) => {
      ending.current = true
      clearToken()
      setUser(null)
      setStatus('anonymous')
      setWarning(false)
      queryClient.clear()
      closeRelogin(null)
      setNotice(message)
      if (pathRef.current.startsWith('/admin')) navigate('/admin/login', { replace: true })
    },
    [queryClient, closeRelogin, navigate],
  )
  const endSessionRef = useRef(endSession)
  endSessionRef.current = endSession

  const logout = useCallback(() => {
    // Avisa a las demás pestañas del navegador: la sesión se cierra en todas.
    if (channelRef.current) channelRef.current.postMessage({ type: 'logout' })
    else {
      try {
        localStorage.setItem(STORAGE_SIGNAL, String(Date.now()))
        localStorage.removeItem(STORAGE_SIGNAL)
      } catch {
        // Sin storage no hay forma de avisar a otras pestañas; esta sí se cierra.
      }
    }
    endSession(null)
  }, [endSession])

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const { data } = await api.post<LoginResult>('/auth/login', { email, password }, { skipReauth: true })
      const next = toUser(data.user)
      const previous = userRef.current
      ending.current = false
      setToken(data.accessToken)
      setUser(next)
      setStatus('authenticated')
      setNotice(null)
      if (previous && previous.id !== next.id) {
        // Entró OTRA cuenta: nada de lo que estaba en memoria es suyo, y lo pendiente de la anterior se descarta.
        queryClient.clear()
        setNotice(`Entraste como ${next.name}, una cuenta distinta a la anterior. Descartamos lo que estaba pendiente.`)
        if (pathRef.current.startsWith('/admin')) navigate(homeFor(), { replace: true })
      }
      closeRelogin(next.id)
      return next
    },
    [queryClient, closeRelogin, navigate],
  )

  // Al abrir (o recargar) una pestaña con token guardado se confirma con el servidor quién es.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    api
      .get<PublicUser>('/auth/me', { skipReauth: true })
      .then((res) => {
        if (cancelled) return
        setUser(toUser(res.data))
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearToken()
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 401 a mitad de uso: se pide volver a entrar y la petición solo se reintenta si vuelve a entrar el mismo usuario.
  useEffect(
    () =>
      setUnauthorizedHandler(async (usedToken) => {
        const requester = subjectOf(usedToken)
        const current = getToken()
        if (requester === null || !current) return 'reject'
        // El token ya se renovó mientras esta petición volaba: se reintenta solo si sigue siendo la misma persona.
        if (current !== usedToken) return userRef.current?.id === requester ? 'retry' : 'reject'
        if (!userRef.current) return 'reject'
        const enteredId = await openRelogin('expired')
        return enteredId === requester ? 'retry' : 'reject'
      }),
    [openRelogin],
  )

  // Aviso a los 2 minutos del vencimiento y diálogo de re-login justo al vencer (sin esperar a una petición fallida).
  useEffect(() => {
    if (status !== 'authenticated' || !expiresAt) return
    const evaluate = (): void => {
      const left = expiresAt - Date.now()
      setWarning(left <= WARN_BEFORE_MS)
      if (left <= 0) void openRelogin('expired')
    }
    evaluate()
    const timers: ReturnType<typeof setTimeout>[] = []
    const warnIn = expiresAt - WARN_BEFORE_MS - Date.now()
    if (warnIn > 0) timers.push(setTimeout(evaluate, Math.min(warnIn, MAX_TIMER_MS)))
    const expireIn = expiresAt - Date.now()
    if (expireIn > 0) timers.push(setTimeout(evaluate, Math.min(expireIn, MAX_TIMER_MS)))
    // Las pestañas en segundo plano frenan los temporizadores: al volver se vuelve a evaluar.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') evaluate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      timers.forEach(clearTimeout)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, expiresAt, openRelogin])

  // Si el token desaparece por fuera (p. ej. un 401 tras reintentar), la app no puede seguir "autenticada".
  useEffect(() => {
    if (status === 'authenticated' && !token && !ending.current) endSessionRef.current('Tu sesión terminó. Vuelve a entrar.')
  }, [status, token])

  // Cierre de sesión en otra pestaña: esta también se cierra.
  useEffect(() => {
    const message = 'Cerraste sesión en otra pestaña.'
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL)
      channelRef.current = channel
      channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === 'logout' && getToken()) endSessionRef.current(message)
      }
      return () => {
        channel.close()
        channelRef.current = null
      }
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_SIGNAL && event.newValue && getToken()) endSessionRef.current(message)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const api_ = useMemo<AuthApi>(
    () => ({
      status,
      user,
      expiresAt,
      warning,
      notice,
      dismissNotice: () => setNotice(null),
      reloginReason,
      signIn,
      logout,
      openRenew: () => void openRelogin('renew'),
      closeRenew: () => setReloginReason((current) => (current === 'renew' ? null : current)),
    }),
    [status, user, expiresAt, warning, notice, reloginReason, signIn, logout, openRelogin],
  )

  return (
    <AuthContext.Provider value={api_}>
      {children}
      <ReloginDialog />
    </AuthContext.Provider>
  )
}
