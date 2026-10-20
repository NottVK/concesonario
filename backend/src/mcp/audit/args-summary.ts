import { MCP_DEFAULTS } from '../mcp.config.js';

/** Argumentos YA VALIDADOS (por zod) de una tool: solo texto corto, números o booleanos. */
export type ValidatedArgs = Readonly<Record<string, string | number | boolean | undefined>>;

// Nombres de argumento permitidos en el resumen: una lista cerrada, no lo que mande el bot.
const KNOWN_KEYS = new Set(['marca', 'modelo', 'anio', 'estado', 'limite', 'vehiculo_id']);
// Defensa extra por si un valor validado llegara con algo raro: solo caracteres simples.
const SAFE_VALUE = /[^\p{L}\p{N} .,_-]/gu;

/**
 * Resumen de una llamada para la auditoría: `marca=Mazda;modelo=3`. Se arma SOLO con argumentos que ya pasaron la
 * validación (nunca con el cuerpo crudo) y con claves de una lista cerrada. Máximo 200 caracteres. Sin texto libre.
 */
export function summarizeArgs(args: ValidatedArgs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || !KNOWN_KEYS.has(key)) continue;
    parts.push(`${key}=${String(value).replace(SAFE_VALUE, '').slice(0, MCP_DEFAULTS.maxTextChars)}`);
  }
  return parts.join(';').slice(0, MCP_DEFAULTS.argsSummaryMaxChars);
}
