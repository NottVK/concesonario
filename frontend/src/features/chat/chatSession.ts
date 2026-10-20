/**
 * Token de la conversación del chat (lo emite el servidor; el navegador solo lo guarda y lo reenvía).
 * - sessionStorage: se borra al cerrar la pestaña. Los mensajes NO se guardan en el navegador.
 * - Si el storage falla (modo privado, bloqueado), la conversación sigue con la copia en memoria.
 */
const KEY = 'automax.chat.session'

let memoryToken: string | null = null
let hydrated = false

export function getChatToken(): string | null {
  if (!hydrated) {
    try {
      memoryToken = sessionStorage.getItem(KEY)
    } catch {
      memoryToken = null
    }
    hydrated = true
  }
  return memoryToken
}

export function setChatToken(token: string): void {
  memoryToken = token
  hydrated = true
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // Sin storage disponible: el token queda solo en memoria.
  }
}

export function clearChatToken(): void {
  memoryToken = null
  hydrated = true
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Sin storage disponible: ya se limpió la copia en memoria.
  }
}

/** Solo para pruebas: olvida la copia en memoria para volver a leer del storage. */
export function resetChatTokenCache(): void {
  memoryToken = null
  hydrated = false
}
