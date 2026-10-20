/**
 * Una imagen de vehículo es SOLO una ruta propia `/autos/...` o una URL `https://`. Replica la regla del
 * servidor (`backend/src/common/image-path.ts`) para avisar antes de enviar; el servidor sigue decidiendo.
 * Se rechaza todo lo demás (`javascript:`, `data:`, `http:`, `//otro.sitio`, `file:`…) porque el valor
 * termina en el `src` de una imagen.
 */
export const MAX_IMAGE_LENGTH = 255
export const MAX_IMAGES = 10

const LOCAL_PATH = /^\/autos\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/
// Espacios, caracteres de control (incluido NUL) y barras invertidas.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f\\]/

export function isVehicleImagePath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_IMAGE_LENGTH || FORBIDDEN_CHARS.test(value)) return false
  if (value.startsWith('/autos/')) return LOCAL_PATH.test(value) && !value.includes('..')
  // Tras `https://` debe venir el servidor: `https:///a.jpg` lo interpreta el navegador como `https://a.jpg`.
  if (!/^https:\/\/[^/?#]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === ''
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

/** Texto con una imagen por línea → lista sin líneas vacías ni espacios sobrantes. */
export function parseImageLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}
