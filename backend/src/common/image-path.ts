import { ValidateBy } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/** Largo máximo de una imagen (coincide con el límite del DTO). */
export const MAX_IMAGE_LENGTH = 255;

/** `/autos/` + segmentos de letras, números, punto, guion y guion bajo (sin `..`, sin `//`, sin parámetros). */
const LOCAL_PATH = /^\/autos\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Caracteres que nunca van en una URL de imagen: espacios, controles (incluido NUL) y barras invertidas. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f\\]/;

/**
 * Una imagen de vehículo es SOLO una ruta propia `/autos/...` o una URL `https://`. Se rechaza todo lo demás
 * (`javascript:`, `data:`, `http:`, `//otro.sitio`, `file:`…) porque el valor termina en un `src` del navegador.
 */
export function isVehicleImagePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IMAGE_LENGTH) return false;
  if (FORBIDDEN_CHARS.test(value)) return false;
  if (value.startsWith('/autos/')) return LOCAL_PATH.test(value) && !value.includes('..');
  // Tras `https://` debe venir el servidor: `https:///a.jpg` lo interpreta el navegador como `https://a.jpg`.
  if (!/^https:\/\/[^/?#]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  } catch (error) {
    // `new URL` lanza TypeError con entradas mal formadas: es un rechazo normal. Cualquier otro error sí se propaga.
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export const IMAGE_PATH_MESSAGE = 'cada imagen debe ser una ruta /autos/... o una URL https://';

/** Decorador de class-validator; con `{ each: true }` valida cada elemento de la lista. */
export function IsVehicleImage(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isVehicleImage', validator: { validate: isVehicleImagePath, defaultMessage: () => IMAGE_PATH_MESSAGE } },
    options,
  );
}
