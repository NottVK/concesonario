/** Mayor valor que cabe en una columna `integer` de PostgreSQL (ids, año, km…). Pasarse da un 500. */
export const MAX_DB_INT = 2_147_483_647;

/** Tope razonable de kilometraje (la columna es `integer`, pero 2 000 millones de km no existen). */
export const MAX_MILEAGE_KM = 10_000_000;

/** Opciones de `@Max()` con un mensaje claro en español. */
export function tooBig(field: string, max: number = MAX_DB_INT): { message: string } {
  return { message: `${field} no puede superar ${max}` };
}
