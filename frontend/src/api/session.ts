/**
 * Almacén del token de login: memoria + sessionStorage.
 * - Se borra al cerrar la pestaña y sobrevive a recargarla (el token dura 1 h).
 * - No usa localStorage: persistiría para siempre y un XSS lo robaría más tiempo.
 * - El storage puede fallar (modo privado, bloqueado): la app sigue con la copia en memoria.
 */
const KEY = 'automax.token'

let memoryToken: string | null = null
let hydrated = false
const listeners = new Set<() => void>()

function readStorage(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeStorage(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Sin storage disponible: el token queda solo en memoria.
  }
}

export function getToken(): string | null {
  if (!hydrated) {
    memoryToken = readStorage()
    hydrated = true
  }
  return memoryToken
}

export function setToken(token: string): void {
  memoryToken = token
  hydrated = true
  writeStorage(token)
  listeners.forEach((notify) => notify())
}

export function clearToken(): void {
  memoryToken = null
  hydrated = true
  writeStorage(null)
  listeners.forEach((notify) => notify())
}

/** Para `useSyncExternalStore`: avisa cuando el token cambia. */
export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
