/** VIN: 17 caracteres alfanuméricos, sin I, O ni Q (norma ISO 3779). */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export const VIN_NOT_FOUND_MESSAGE = 'No encontré una ficha pública para ese VIN.';
export const VIN_INVALID_MESSAGE = 'El VIN debe tener 17 caracteres (letras y números, sin I, O ni Q).';

/** Mayúsculas y sin espacios, guiones ni saltos de línea: es lo único que se "arregla" de lo que escribe la persona. */
export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}
