/**
 * Configuración del servidor MCP: valores por defecto (todos en un solo lugar, con pruebas) y secretos del entorno.
 * Los secretos nunca se imprimen: los errores nombran la variable, jamás su valor.
 */

export const MCP_DEFAULTS = {
  /** Llamadas por minuto de un bot (editable por bot de 1 a 600). */
  botPerMinute: 30,
  botPerMinuteRange: [1, 600] as const,
  /** Llamadas por día de un bot (editable por bot de 1 a 100.000). */
  botPerDay: 2000,
  botPerDayRange: [1, 100_000] as const,
  /** Antes de autenticar: peticiones por minuto por IP y peticiones simultáneas por IP. */
  ipPerMinute: 60,
  ipConcurrent: 5,
  /** Bloqueo por IP: fallos de autenticación dentro de la ventana y duración del bloqueo. */
  lockoutFailures: 10,
  lockoutWindowMs: 5 * 60_000,
  lockoutDurationMs: 15 * 60_000,
  /** Tope global del MCP (todas las IPs y bots), por minuto. */
  globalPerMinute: 600,
  /** Tamaños. */
  maxBodyBytes: 16_384,
  maxResponseBytes: 4_096,
  maxResults: 10,
  defaultResults: 5,
  /** Argumentos de texto. */
  maxTextChars: 60,
  yearRange: [1990, 2100] as const,
  /** Tiempos del servidor HTTP (contra conexiones lentas). */
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 15_000,
  keepAliveTimeoutMs: 5_000,
  /** Auditoría. */
  argsSummaryMaxChars: 200,
  auditRetentionDays: 90,
} as const;

export interface McpSecrets {
  /** Pepper vigente (HMAC de las keys de los bots). */
  pepper: string;
  /** Versión del pepper vigente; cada bot guarda con cuál se calculó su hash. */
  pepperVersion: number;
  /** Pepper de la versión anterior, solo mientras quede algún bot sin migrar. */
  pepperPrevious: string | null;
  /** Clave AES-256 (32 bytes) que cifra las keys que NOSOTROS enviamos a otros bots. */
  encryptionKey: Buffer;
}

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^cambia_/i;
const MIN_PEPPER_CHARS = 32;

function readPepper(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  if (!value) return null;
  if (PLACEHOLDER.test(value)) throw new Error(`${name} todavía tiene el valor de ejemplo de .env.example: pon uno propio y aleatorio`);
  if (value.length < MIN_PEPPER_CHARS) throw new Error(`${name} debe tener al menos ${MIN_PEPPER_CHARS} caracteres (por ejemplo, openssl rand -hex 32)`);
  return value;
}

/** 64 caracteres hexadecimales o base64 (estándar o URL) que decodifiquen a exactamente 32 bytes. */
function parseEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim();
  if (!value) throw new Error('Falta BOT_KEY_ENCRYPTION_KEY (clave AES de 32 bytes; por ejemplo, openssl rand -hex 32). El servidor no arranca sin ella');
  if (PLACEHOLDER.test(value)) throw new Error('BOT_KEY_ENCRYPTION_KEY todavía tiene el valor de ejemplo de .env.example: pon una propia y aleatoria');
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(value)) {
    const bytes = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (bytes.length === 32) return bytes;
  }
  throw new Error('BOT_KEY_ENCRYPTION_KEY debe ser de 32 bytes: 64 caracteres hexadecimales o base64 (openssl rand -hex 32)');
}

/**
 * Lee y valida los secretos. Si falta alguno o es inválido LANZA: la API no arranca (mejor que arrancar con keys
 * que no se pueden verificar o con claves salientes sin cifrar).
 */
export function loadMcpSecrets(env: Env = process.env): McpSecrets {
  const pepper = readPepper(env, 'MCP_KEY_PEPPER');
  if (!pepper) throw new Error('Falta MCP_KEY_PEPPER (secreto aleatorio de 32 o más caracteres; por ejemplo, openssl rand -hex 32). El servidor no arranca sin él');
  const rawVersion = env.MCP_KEY_PEPPER_VERSION?.trim();
  const pepperVersion = rawVersion ? Number(rawVersion) : 1;
  if (!Number.isInteger(pepperVersion) || pepperVersion < 1 || pepperVersion > 32_000) {
    throw new Error('MCP_KEY_PEPPER_VERSION debe ser un entero entre 1 y 32000');
  }
  const pepperPrevious = readPepper(env, 'MCP_KEY_PEPPER_PREVIOUS');
  if (pepperPrevious === pepper) throw new Error('MCP_KEY_PEPPER_PREVIOUS no puede ser igual a MCP_KEY_PEPPER');
  return { pepper, pepperVersion, pepperPrevious, encryptionKey: parseEncryptionKey(env.BOT_KEY_ENCRYPTION_KEY) };
}

export const MCP_SECRETS = Symbol('MCP_SECRETS');
