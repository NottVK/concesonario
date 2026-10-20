import { BlockedTarget } from './errors.js';
import { loadOutboundSettings } from './outbound.config.js';
import { TargetPolicy } from './target-policy.js';
import type { SettingsSource } from './target-policy.js';

/** Qué se le dice al administrador por cada motivo de rechazo. Nunca repite la URL que escribió. */
const REASONS: Record<string, string> = {
  esquema: 'Solo se aceptan direcciones http(s).',
  http: 'Solo se acepta https (http solo vale para una IP:puerto exacta de A2A_DEV_ALLOWED_TARGETS, en desarrollo).',
  credenciales: 'La URL no puede llevar usuario ni contraseña.',
  consulta: 'La URL no puede llevar parámetros (lo que va después de «?»).',
  fragmento: 'La URL no puede llevar fragmento (lo que va después de «#»).',
  puerto: 'Ese puerto no está permitido (es el de la propia API, la base de datos u Ollama).',
  'ip-literal': 'En producción hay que usar un nombre de dominio, no una dirección IP.',
  'ip-privada': 'Esa dirección apunta a una red interna o reservada.',
  nombre: 'Ese nombre no es un dominio público de Internet (localhost, nombres internos, de una sola palabra…).',
};

/**
 * Valida la URL de un bot contra la política SSRF al REGISTRARLA o cambiarla (decisión 112), sin consultar el DNS: el
 * nombre se vuelve a resolver y a validar en cada llamada. Devuelve el motivo para el administrador, o null si pasa.
 */
export function registeredUrlProblem(url: string, settings: SettingsSource = () => loadOutboundSettings()): string | null {
  try {
    new TargetPolicy(settings).check(url);
    return null;
  } catch (error) {
    if (!(error instanceof BlockedTarget)) throw error;
    return REASONS[error.code] ?? 'La URL no es válida.';
  }
}
