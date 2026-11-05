/**
 * Configuración del bot de Telegram (decisión 128). Se enciende solo si `TELEGRAM_BOT_TOKEN` está en `.env`
 * y nunca durante las pruebas (NODE_ENV=test). Un token con un formato distinto al de BotFather NO arranca la API.
 */
const TOKEN_FORMAT = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;

/** El token o null si no está configurado. Nunca se escribe en un log: va dentro de la URL de la Bot API. */
export function telegramToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!raw) return null;
  if (!TOKEN_FORMAT.test(raw)) {
    throw new Error('TELEGRAM_BOT_TOKEN no tiene el formato que entrega BotFather (números, dos puntos y letras)');
  }
  return raw;
}

/** El bot escucha solo con token y fuera de las pruebas. */
export function telegramEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'test' && telegramToken(env) !== null;
}

/** Segundos que Telegram mantiene abierta cada consulta de mensajes nuevos (long polling). */
export const TELEGRAM_POLL_TIMEOUT_S = 25;
/** Cada cuánto se repite "escribiendo…" mientras el modelo piensa (Telegram lo borra a los 5 s). */
export const TELEGRAM_TYPING_EVERY_MS = 4_500;
export const TELEGRAM_RETRY_MIN_MS = 3_000;
export const TELEGRAM_RETRY_MAX_MS = 60_000;
/** Mensajes de una misma persona esperando turno; los que pasen de aquí se rechazan con un aviso. */
export const TELEGRAM_MAX_PENDING_PER_CHAT = 3;
/** Telegram rechaza los mensajes de más de 4096 caracteres. */
export const TELEGRAM_MESSAGE_MAX_CHARS = 4000;
