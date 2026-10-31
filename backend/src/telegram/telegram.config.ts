/** Telegram se activa solo con TELEGRAM_ENABLED=true y un token; sin eso el módulo no hace nada. */
export function telegramEnabled(): boolean {
  return process.env.TELEGRAM_ENABLED === 'true' && telegramToken() !== '';
}

export function telegramToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
}

/** Formato que entrega @BotFather: `<número>:<texto>`. Evita arrancar con el valor de ejemplo. */
export function isValidTelegramToken(token: string): boolean {
  return /^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token);
}

export const TELEGRAM_API = 'https://api.telegram.org';
export const TELEGRAM_POLL_SECONDS = 25;
export const TELEGRAM_MAX_TEXT = 4000;
/** Conversaciones recordadas en memoria (chat_id → sesión); al reiniciar la API se empieza una sesión nueva. */
export const TELEGRAM_MAX_SESSIONS = 5000;
