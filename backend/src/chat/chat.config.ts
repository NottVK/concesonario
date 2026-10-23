/**
 * Modo de evaluación (`CHAT_EVAL_MODE=true`): solo para correr las 20 preguntas contra un modelo real, que son
 * decenas de turnos desde una sola IP. Relaja los límites por IP y activa la salida de depuración de las tools.
 * NUNCA en producción: con NODE_ENV=production se ignora, y al arrancar se avisa en el log.
 */
export function chatEvalMode(): boolean {
  return process.env.CHAT_EVAL_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * Límites del chat. Los valores de producción son fijos; las variables `CHAT_*` solo se respetan con
 * NODE_ENV=test (Vitest lo fija solo) o en modo de evaluación, para que una variable mal puesta no desactive
 * un límite real.
 */
function fromTestEnv(name: string, fallback: number): number {
  if (process.env.NODE_ENV !== 'test' && !chatEvalMode()) return fallback;
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Si la respuesta de POST /chat lleva `debug` (tools llamadas y sus datos): solo en pruebas o evaluación. */
export function chatDebugEnabled(): boolean {
  return (process.env.NODE_ENV === 'test' && process.env.CHAT_DEBUG_TOOLS === 'true') || (chatEvalMode() && process.env.CHAT_DEBUG_TOOLS !== 'false');
}

export const CHAT_MESSAGE_MAX_CHARS = 500;
export const CHAT_HISTORY_TURNS = 10;
export const CHAT_HISTORY_MAX_CHARS = 6000;
export const CHAT_REPLY_MAX_CHARS = 1200;
export const CHAT_MAX_TOOL_ITERATIONS = 4;
export const CHAT_MAX_CALLS_PER_ITERATION = 3;
export const CHAT_SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const CHAT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CHAT_RETENTION_DAYS = 7;
export const CHAT_PROPOSAL_TTL_MS = 10 * 60 * 1000;
export const CHAT_PROPOSAL_RETENTION_MS = 24 * 60 * 60 * 1000;
export const CHAT_QUEUE_LENGTH = 3;
export const DEFAULT_CHAT_TURN_TIMEOUT_MS = 240_000;

/**
 * Tope de un turno completo (cola + todas las llamadas al modelo + tools). `CHAT_TURN_TIMEOUT_MS` lo ajusta
 * entre 30 y 300 s; con gpt-oss:20b en un equipo con 4 GB de GPU, un turno con una tool tarda ~45 s con el modelo cargado. Un valor inválido NO arranca la API.
 */
export function chatTurnTimeoutMs(raw: string | undefined = process.env.CHAT_TURN_TIMEOUT_MS): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_CHAT_TURN_TIMEOUT_MS;
  const value = /^\d{5,6}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(value) || value < 30_000 || value > 300_000) {
    throw new Error('CHAT_TURN_TIMEOUT_MS debe ser un entero entre 30000 y 300000 (milisegundos)');
  }
  return value;
}

/** Peticiones por minuto y por IP a POST /api/chat (se lee al cargar el módulo: va en un decorador). */
export const chatPerMinuteLimit = (): number => fromTestEnv('CHAT_LIMIT_PER_MINUTE', 6) || 6;
export const chatPerHourLimit = (): number => fromTestEnv('CHAT_LIMIT_PER_HOUR', 60) || 60;
/** Pausa mínima entre dos turnos de la misma sesión. */
export const chatMinTurnGapMs = (): number => fromTestEnv('CHAT_MIN_TURN_GAP_MS', 2000);
/** Turnos máximos por sesión. */
export const chatMaxTurns = (): number => fromTestEnv('CHAT_MAX_TURNS', 60) || 60;
