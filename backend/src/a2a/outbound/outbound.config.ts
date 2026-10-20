import { isIP } from 'node:net';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { parseIPv4, parseIPv6 } from './ip-ranges.js';

/** Límites de la A2A saliente (decisión 115). Todos en un solo lugar y con pruebas. */
export const OUTBOUND_DEFAULTS = {
  /** Plazo total de una llamada (conexión, respuesta y lectura del cuerpo). */
  deadlineMs: 8_000,
  /** Tope de la respuesta de una tarea, contado en el stream. */
  maxResponseBytes: 16_384,
  /** Tope de la tarjeta remota. */
  maxCardBytes: 4_096,
  /** Pregunta que se envía: largo mínimo y máximo, ya redactada. */
  minQuestionChars: 5,
  maxQuestionChars: 300,
  /** Texto que se muestra al usuario. */
  maxAnswerChars: 600,
  /** Límites de uso. */
  perSessionPerHour: 3,
  globalPerMinute: 20,
  concurrent: 2,
  testConnectionPerMinute: 5,
  /** Circuit breaker. */
  breakerFailures: 3,
  breakerOpenMs: 60_000,
  /** Entradas máximas de la lista de desarrollo. */
  maxDevTargets: 10,
} as const;

export const OUTBOUND_SETTINGS = Symbol('OUTBOUND_SETTINGS');

export interface OutboundSettings {
  production: boolean;
  /** `IP:puerto` exactos permitidos SOLO en desarrollo (y solo ahí se acepta `http`). Vacío en producción. */
  devAllowed: ReadonlySet<string>;
  /** Puertos a los que la salida NUNCA se conecta: el de la propia API, el de la base y el de Ollama. */
  forbiddenPorts: ReadonlySet<number>;
}

type Env = Record<string, string | undefined>;

function portOf(raw: string | undefined, fallback: number): number {
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function ollamaPort(host: string | undefined): number {
  if (!host?.trim()) return 11_434;
  try {
    const url = new URL(host.trim());
    return url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  } catch {
    return 11_434;
  }
}

/** Puertos propios que la salida no puede alcanzar aunque el destino sea «público» (decisión 112). */
export function forbiddenPortsFrom(env: Env): Set<number> {
  return new Set([portOf(env.PORT, 8000), portOf(env.DB_PORT, 5432), 5432, ollamaPort(env.OLLAMA_HOST)]);
}

/** `IP:puerto` canónico de una entrada de A2A_DEV_ALLOWED_TARGETS, o null si no es una IP literal con puerto exacto. */
export function canonicalDevTarget(entry: string): string | null {
  const match = /^(?:\[([0-9a-fA-F:.]+)\]|(\d{1,3}(?:\.\d{1,3}){3})):(\d{1,5})$/.exec(entry.trim());
  if (!match) return null;
  const port = Number(match[3]);
  if (port < 1 || port > 65535) return null;
  const v6 = match[1];
  if (v6) return parseIPv6(v6) ? `[${new URL(`http://[${v6}]/`).hostname.slice(1, -1)}]:${port}` : null;
  return parseIPv4(match[2]!) ? `${match[2]}:${port}` : null;
}

/**
 * Lee el entorno de la salida. Si algo está mal la API NO arranca: A2A_DEV_ALLOWED_TARGETS no se acepta con
 * NODE_ENV=production, cada entrada debe ser una IP literal con su puerto exacto (sin nombres, rangos ni comodines) y
 * no puede apuntar a un puerto prohibido. Los errores nombran la variable, nunca el valor.
 */
export function loadOutboundSettings(env: Env = process.env): OutboundSettings {
  const production = env.NODE_ENV === 'production';
  const forbiddenPorts = forbiddenPortsFrom(env);
  const raw = (env.A2A_DEV_ALLOWED_TARGETS ?? '').trim();
  if (raw === '') return { production, devAllowed: new Set(), forbiddenPorts };
  if (production) throw new Error('A2A_DEV_ALLOWED_TARGETS no se puede usar con NODE_ENV=production (es solo para desarrollo)');
  const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length > OUTBOUND_DEFAULTS.maxDevTargets) throw new Error(`A2A_DEV_ALLOWED_TARGETS admite como máximo ${OUTBOUND_DEFAULTS.maxDevTargets} entradas`);
  const devAllowed = new Set<string>();
  for (const entry of entries) {
    const target = canonicalDevTarget(entry);
    if (!target) throw new Error('A2A_DEV_ALLOWED_TARGETS: cada entrada debe ser una IP literal con su puerto exacto (por ejemplo 127.0.0.1:8100)');
    const port = Number(target.slice(target.lastIndexOf(':') + 1));
    if (forbiddenPorts.has(port)) throw new Error('A2A_DEV_ALLOWED_TARGETS: una entrada apunta a un puerto prohibido (la propia API, la base de datos u Ollama)');
    devAllowed.add(target);
  }
  return { production, devAllowed, forbiddenPorts };
}

/** `IP:puerto` canónico de un destino, para compararlo con la lista de desarrollo. */
export function devKey(address: string, port: number): string {
  return isIP(address) === 6 ? `[${address.toLowerCase()}]:${port}` : `${address}:${port}`;
}

/** Mensajes públicos y fijos por categoría: sin IP, sin códigos de red, sin nada que vuelva del otro bot. */
export const PUBLIC_MESSAGES: Record<string, string> = {
  [ExchangeStatus.REJECTED]: 'No pude enviar esa consulta.',
  [ExchangeStatus.TIMEOUT]: 'El otro bot no respondió a tiempo.',
  [ExchangeStatus.REMOTE_ERROR]: 'El otro bot no pudo responder ahora.',
  [ExchangeStatus.SSRF_BLOCKED]: 'Ese destino no está permitido.',
  [ExchangeStatus.INVALID_RESPONSE]: 'El otro bot respondió algo que no pude usar.',
  [ExchangeStatus.CIRCUIT_OPEN]: 'El otro bot falló varias veces; lo intentaré de nuevo más tarde.',
  [ExchangeStatus.LIMITED]: 'Ya hice demasiadas consultas a otros bots; intenta en unos minutos.',
  [ExchangeStatus.INTERNAL_ERROR]: 'No pude usar la conexión con ese bot.',
};
