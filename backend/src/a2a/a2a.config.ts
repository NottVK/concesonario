/**
 * Configuración del canal A2A. La URL pública del bot sale SOLO del entorno (`A2A_PUBLIC_BASE_URL`), nunca de la
 * cabecera Host de quien pide la tarjeta (decisión 111). Los errores nombran la variable, jamás su valor.
 */

export const A2A_CONFIG = Symbol('A2A_CONFIG');

export interface A2aConfig {
  /** Origen público del bot sin barra final, por ejemplo `https://bot.automax.co`. */
  publicBaseUrl: string;
}

export const A2A_DEFAULTS = {
  /** Mensaje de la tarea (pregunta de otro bot). */
  maxMessageChars: 300,
  /** Respuesta HTTP completa de /a2a/tasks. */
  maxResponseBytes: 4_096,
  /** Texto `answer` de la respuesta. */
  maxAnswerChars: 600,
  /** Vehículos que se nombran dentro del texto de la respuesta. */
  answerVehicles: 3,
  /** Vehículos que se devuelven en `data` (antes de recortar por tamaño). */
  maxResults: 5,
} as const;

/** Las cuatro habilidades que publica la tarjeta (decisión 110: `citas` es solo informativa). */
export const A2A_SKILLS = ['stock', 'precios', 'citas', 'financiacion'] as const;
export type A2aSkill = (typeof A2A_SKILLS)[number];

export function loadA2aConfig(env: Record<string, string | undefined> = process.env): A2aConfig {
  const production = env.NODE_ENV === 'production';
  const raw = env.A2A_PUBLIC_BASE_URL?.trim();
  if (!raw) {
    if (production) throw new Error('Falta A2A_PUBLIC_BASE_URL (la URL pública del bot, con https) y es obligatoria en producción');
    return { publicBaseUrl: `http://localhost:${env.PORT ?? 8000}` };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('A2A_PUBLIC_BASE_URL no es una URL válida');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('A2A_PUBLIC_BASE_URL debe empezar por https:// (o http:// solo en desarrollo)');
  if (production && url.protocol !== 'https:') throw new Error('En producción A2A_PUBLIC_BASE_URL debe usar https');
  if (url.username || url.password) throw new Error('A2A_PUBLIC_BASE_URL no puede llevar usuario ni contraseña');
  if (url.search || url.hash) throw new Error('A2A_PUBLIC_BASE_URL no puede llevar parámetros ni fragmento');
  return { publicBaseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}
