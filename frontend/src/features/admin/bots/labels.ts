/** Textos del panel de bots. El estado de un intercambio es una categoría (nunca un código de red ni una dirección). */
export const STATUS_LABELS: Record<string, string> = {
  ok: 'Correcto',
  error_validacion: 'Datos no válidos',
  error_interno: 'Error interno',
  rechazado: 'Rechazado',
  timeout: 'Sin respuesta a tiempo',
  error_remoto: 'Falló el otro bot',
  bloqueado_ssrf: 'Destino bloqueado',
  respuesta_invalida: 'Respuesta no válida',
  circuito_abierto: 'Circuito abierto',
  limite: 'Límite alcanzado',
}

export const CHANNEL_LABELS = { a2a: 'A2A', mcp: 'MCP' } as const
export const DIRECTION_LABELS = { entrante: 'Entrante', saliente: 'Saliente' } as const

export const AUTH_LABELS = { bearer: 'Authorization: Bearer', x_api_key: 'Cabecera X-API-Key' } as const

/** Qué se le explica al administrador de cada estado que no es «correcto». */
export const STATUS_HINTS: Record<string, string> = {
  rechazado: 'La consulta no era válida o el bot estaba desactivado.',
  timeout: 'El otro bot tardó más de 8 segundos.',
  error_remoto: 'El otro bot respondió con un error o no se pudo conectar.',
  bloqueado_ssrf: 'La dirección del bot no pasa la política de seguridad (red interna, http, puerto prohibido).',
  respuesta_invalida: 'La respuesta no era JSON, era demasiado grande o no traía texto.',
  circuito_abierto: 'El bot falló 3 veces seguidas: se deja de llamar durante 1 minuto.',
  limite: 'Se alcanzó el límite de consultas por minuto, por sesión o simultáneas.',
}

export const statusLabel = (status: string | null): string => (status ? (STATUS_LABELS[status] ?? status) : 'Sin estado')
