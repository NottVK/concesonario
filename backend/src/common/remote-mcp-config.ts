import type { RemoteMcpConfig } from './remote-mcp.client.js';

/**
 * Configuración de un MCP EXTERNO desde dos variables de entorno (URL y token). Sin URL devuelve null (el servicio
 * queda sin conexión); con URL, el token es obligatorio y una configuración mala NO arranca la API. https obligatorio
 * salvo en desarrollo (LAN) o localhost. Lo usan el taller (decisión 130) y la tienda de repuestos (decisión 135).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface RemoteMcpVars {
  urlVar: string;
  tokenVar: string;
  /** Pista de dónde sale el token, para el mensaje de error. */
  tokenHint: string;
}

export function remoteMcpConfig(vars: RemoteMcpVars, env: NodeJS.ProcessEnv = process.env): RemoteMcpConfig | null {
  const rawUrl = env[vars.urlVar]?.trim();
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${vars.urlVar} no es una URL válida (por ejemplo https://servicio.example.com/mcp)`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (local || env.NODE_ENV !== 'production'))) {
    throw new Error(`${vars.urlVar} debe usar https (http solo en desarrollo)`);
  }
  if (url.username || url.password) throw new Error(`${vars.urlVar} no puede llevar usuario ni contraseña: el token va en ${vars.tokenVar}`);
  const token = env[vars.tokenVar]?.trim();
  if (!token) throw new Error(`Falta ${vars.tokenVar}: ${vars.tokenHint}`);
  if (!/^[\x21-\x7e]{16,4096}$/.test(token)) throw new Error(`${vars.tokenVar} no tiene un formato válido`);
  return { url, token };
}
