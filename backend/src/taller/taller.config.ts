/**
 * Conexión con el MCP del taller (decisión 130). Sin `TALLER_MCP_URL` el concesionario usa el taller simulado de
 * desarrollo, con las mismas herramientas y datos del Excel. Con URL, el token es obligatorio (lo entrega el taller con
 * POST /api/auth/entrar y POST /api/auth/token-mcp) y una configuración mala NO arranca la API.
 */
import { remoteMcpConfig } from '../common/remote-mcp-config.js';
import type { RemoteMcpConfig } from '../common/remote-mcp.client.js';

export type TallerMcpConfig = RemoteMcpConfig;

export function tallerMcpConfig(env: NodeJS.ProcessEnv = process.env): TallerMcpConfig | null {
  return remoteMcpConfig({ urlVar: 'TALLER_MCP_URL', tokenVar: 'TALLER_MCP_TOKEN', tokenHint: 'el token MCP que entrega el taller' }, env);
}

/** Plazo de las llamadas rápidas al MCP del taller (disponibilidad, sedes) y de la conexión. */
export const TALLER_CALL_TIMEOUT_MS = 15_000;
/** `prediagnosticar` y `agendar_cita` calculan un prediagnóstico en el taller: el real tardó más de 15 s (decisión 131). */
export const TALLER_SLOW_CALL_TIMEOUT_MS = 60_000;
/** `consultar_manipulacion` corre mientras el taller espera la respuesta de `validar_garantia`: plazo corto. */
export const TALLER_TAMPERING_TIMEOUT_MS = 8_000;
