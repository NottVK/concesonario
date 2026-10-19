/** Mayor id que acepta la API (un `integer` de PostgreSQL). Más allá responde 400, así que ni se pregunta. */
export const MAX_DB_INT = 2_147_483_647

/** Id válido escrito en decimal ("12"), sin ceros a la izquierda, signos, decimales ni notación científica. */
export function parseDbId(raw: string | null | undefined): number | null {
  if (!raw || !/^[1-9]\d{0,9}$/.test(raw)) return null
  const id = Number(raw)
  return id <= MAX_DB_INT ? id : null
}
