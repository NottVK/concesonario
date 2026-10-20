/** Fecha y hora en Bogotá, o «Nunca» si no hay. */
export const formatDate = (iso: string | null): string =>
  iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso)) : 'Nunca'

/** Columnas de la lista de bots (la cabecera y cada fila comparten la misma rejilla). */
export const ROW_GRID = 'md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start'
